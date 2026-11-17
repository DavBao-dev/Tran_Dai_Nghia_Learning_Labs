"""Open real JupyterLab locally. Never runs a public server or overwrites exam files."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parent
MODULES = ('jupyterlab', 'ipykernel', 'pandas', 'sklearn')

def ready(python):
    try:
        return subprocess.run([str(python), '-c', 'import jupyterlab,ipykernel,pandas,sklearn'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False

def environment(use_current=False):
    if sys.version_info < (3, 10):
        raise RuntimeError('Can Python 3.10 tro len. Cai Python roi mo lai launcher.')
    if ready(sys.executable):
        return Path(sys.executable)
    if use_current:
        raise RuntimeError('Python hien tai chua co jupyterlab, ipykernel, pandas, scikit-learn.')
    base = Path(os.environ.get('LOCALAPPDATA', str(Path.home()/'.cache')))/'TDN-JupyterLab'/f'python-{sys.version_info.major}.{sys.version_info.minor}'
    python = base/('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.exists():
        print('Tao moi truong Python rieng (dung chung cho cac de TDN)...', flush=True)
        venv.EnvBuilder(with_pip=True).create(base)
    if not ready(python):
        print('Cai JupyterLab va thu vien lan dau. Can Internet; cac lan sau khong tai lai.', flush=True)
        subprocess.check_call([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '-r', str(ROOT/'requirements-jupyterlab.txt')])
    if not ready(python):
        raise RuntimeError('Chua cai du thu vien. Xem thong bao pip o tren.')
    return python

def launch_spec(root, python, port=8888, no_browser=False):
    root = Path(root).resolve()
    env = os.environ.copy()
    env['JUPYTER_TOKEN'] = secrets.token_urlsafe(32)
    env['PYTHONUTF8'] = '1'
    # Explicit CLI values override a personal config that exposes the server publicly.
    args = [str(python), '-m', 'jupyterlab', '--ServerApp.ip=127.0.0.1',
        '--ServerApp.allow_remote_access=False', '--ServerApp.root_dir='+str(root),
        '--ServerApp.port='+str(port), '--ServerApp.port_retries=50',
        '--ServerApp.default_url=/lab/tree/notebook.ipynb',
        '--ServerApp.open_browser='+str(not no_browser)]
    return args, env

def main():
    parser = argparse.ArgumentParser(description='JupyterLab local cho bo de TDN')
    parser.add_argument('--use-current', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=8888)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Port phai trong khoang 1024..65535')
    python = environment(args.use_current)
    command, env = launch_spec(ROOT, python, args.port, args.no_browser)
    print('Thu muc bai lam: '+str(ROOT), flush=True)
    print('Luu notebook bang Ctrl+S. Dong server bang Ctrl+C trong cua so nay.', flush=True)
    print('JupyterLab chi chay tren may nay. Code Python co quyen cua tai khoan tren may.', flush=True)
    try:
        child = subprocess.Popen(command, cwd=ROOT, env=env)
        return child.wait()
    except KeyboardInterrupt:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
        return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print('Khong khoi dong duoc JupyterLab: '+str(error), file=sys.stderr)
        raise SystemExit(1)
