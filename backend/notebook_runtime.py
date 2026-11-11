"""Persistent local cell processes, isolated by problem directory (not security sandboxes)."""
import atexit
import concurrent.futures
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get('TDN_NOTEBOOK_DIR', ROOT.parent / 'tdn-models/runtime/notebooks')).resolve()
WORK.mkdir(parents=True, exist_ok=True)
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=3)
KERNELS = {}
LOCK = threading.Lock()

def safe_files(directory, files):
    if not isinstance(files, dict) or len(files) > 100:
        raise ValueError('Tối đa 100 tệp làm việc.')
    total = 0
    for name, content in files.items():
        if not isinstance(name, str) or not re.fullmatch(r'[\w. /-]{1,100}', name) or '\\' in name:
            raise ValueError('Đường dẫn tệp không hợp lệ.')
        parts = name.split('/')
        if any(part in ('', '.', '..') for part in parts) or name.startswith('/'):
            raise ValueError('Tệp phải nằm trong thư mục bài toán.')
        if not isinstance(content, str) or len(content.encode('utf-8')) > 2000000:
            raise ValueError('Mỗi tệp tối đa 2 MB.')
        total += len(content.encode('utf-8'))
        if total > 4000000:
            raise ValueError('Tổng dữ liệu tối đa 4 MB.')
        destination = directory.joinpath(*parts).resolve()
        if not destination.is_relative_to(directory):
            raise ValueError('Tệp nằm ngoài bài toán.')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding='utf-8')

def stop(kernel):
    process = kernel['process']
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()

def reset(problem):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', problem):
        raise ValueError('ID bài toán không hợp lệ.')
    with LOCK:
        kernel = KERNELS.get(problem)
        if kernel:
            if not kernel['lock'].acquire(blocking=False):
                raise RuntimeError('Kernel đang chạy một ô.')
            try:
                stop(kernel)
                KERNELS.pop(problem, None)
            finally:
                kernel['lock'].release()

def execute(payload):
    problem, code = payload.get('problem_id'), payload.get('code')
    if not isinstance(problem, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', problem):
        raise ValueError('ID bài toán không hợp lệ.')
    if not isinstance(code, str) or len(code) > 200000:
        raise ValueError('Ô code tối đa 200.000 ký tự.')
    with LOCK:
        kernel = KERNELS.get(problem)
        if kernel and kernel['process'].poll() is not None:
            KERNELS.pop(problem)
            kernel = None
        if not kernel:
            if len(KERNELS) >= 3:
                idle = sorted((item for item in KERNELS.items() if not item[1]['lock'].locked()), key=lambda item: item[1]['used'])
                if not idle:
                    raise RuntimeError('Đang có 3 kernel hoạt động.')
                key, old = idle[0]
                stop(old)
                KERNELS.pop(key)
            directory = (WORK / problem).resolve()
            if not directory.is_relative_to(WORK):
                raise ValueError('Thư mục bài toán không hợp lệ.')
            directory.mkdir(parents=True, exist_ok=True)
            environment = os.environ.copy()
            environment.update(PYTHONUTF8='1', MPLBACKEND='Agg')
            process = subprocess.Popen([sys.executable, '-u', str(Path(__file__).with_name('notebook_worker.py'))],
                                       cwd=directory, env=environment, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.DEVNULL, text=True, encoding='utf-8',
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            kernel = {'process': process, 'directory': directory, 'lock': threading.Lock(), 'used': time.monotonic()}
            KERNELS[problem] = kernel
        if not kernel['lock'].acquire(blocking=False):
            raise RuntimeError('Kernel đang chạy một ô.')
    try:
        safe_files(kernel['directory'], payload.get('files', {}))
        kernel['process'].stdin.write(json.dumps({'code': code}) + '\n')
        kernel['process'].stdin.flush()
        future = POOL.submit(kernel['process'].stdout.readline)
        try:
            line = future.result(timeout=120)
        except concurrent.futures.TimeoutError:
            stop(kernel)
            raise RuntimeError('Ô chạy quá 120 giây; kernel đã dừng. Hãy reset rồi chạy lại.')
        if not line:
            raise RuntimeError('Kernel đã dừng. Hãy reset rồi chạy lại.')
        return json.loads(line)
    finally:
        kernel['used'] = time.monotonic()
        kernel['lock'].release()

@atexit.register
def close():
    for kernel in KERNELS.values():
        stop(kernel)
    POOL.shutdown(wait=False, cancel_futures=True)
