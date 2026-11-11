"""Start the frontend and its GPU gateway together. Uses the downloaded GGUF via Ollama."""
import argparse
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import hashlib
import subprocess
import sys
import time
import webbrowser

ROOT = Path(__file__).resolve().parent
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def request(port, path, payload=None, timeout=4, key=''):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=timeout)
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['Authorization'] = 'Bearer ' + key
    raw = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
    try:
        connection.request('POST' if raw else 'GET', path, body=raw, headers=headers)
        response = connection.getresponse()
        data = json.loads(response.read())
        return response.status, data
    finally:
        connection.close()

def stop(process):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()

def verify_notebook(port, key=''):
    status, result = request(port, '/api/notebook/execute', {'problem_id': 'launcher-check', 'code': '6 * 7', 'files': {}}, timeout=30, key=key)
    values = [output.get('data', {}).get('text/plain') for output in result.get('outputs', [])]
    if status != 200 or result.get('ok') is not True or '42' not in values:
        raise RuntimeError('Backend notebook không chạy được Python: ' + str(result))
    request(port, '/api/notebook/reset', {'problem_id': 'launcher-check'}, key=key)


def choose_port(start, key=''):
    for port in range(start, start + 11):
        try:
            status, health = request(port, '/api/notebook/health', timeout=1, key=key)
            if status == 200 and health.get('app') == 'tdn-ai-workspace' and health.get('api_version') == 1 and health.get('chat_profiles_version') == 1 and health.get('learning_version') == 1:
                verify_notebook(port, key)
                return port, True
        except (OSError, ValueError, RuntimeError):
            pass
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', port))
                return port, False
            except OSError:
                continue
    raise RuntimeError('Không tìm được cổng trống cho backend notebook.')


def same_frontend(port):
    try:
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=2)
        connection.request('GET', '/notebook-ui.js')
        response = connection.getresponse()
        content = response.read(); connection.close()
        return response.status == 200 and hashlib.sha256(content).digest() == hashlib.sha256((ROOT/'dist/notebook-ui.js').read_bytes()).digest()
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-directory', type=Path, default=ROOT.parent / 'tdn-models')
    parser.add_argument('--port', type=int, default=5173)
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--verify', action='store_true', help='Send one real inference request before serving.')
    parser.add_argument('--check-only', action='store_true', help='Stop after verification.')
    parser.add_argument('--notebook-only', action='store_true', help='Run Python cells without starting Ollama.')
    args = parser.parse_args()
    preferred_port = args.port
    key = os.environ.get('AI_GATEWAY_KEY', '')
    args.port, reuse = choose_port(preferred_port, key)
    frontend_port = preferred_port if args.port != preferred_port and same_frontend(preferred_port) else args.port
    display_url = f'http://127.0.0.1:{frontend_port}/?update=learning-r1&gatewayPort={args.port}'
    if reuse:
        print('Python notebook đã được kiểm tra: 6 * 7 = 42. Mở ' + display_url, flush=True)
        if not args.no_open: webbrowser.open(display_url)
        return
    if args.port != preferred_port:
        print(f'Server cũ ở cổng {preferred_port}; dùng backend notebook mới tại cổng {args.port}.', flush=True)
    model_root = args.model_directory.resolve()
    weight = model_root / 'Qwen3-8B-Q4_K_M.gguf'
    if not args.notebook_only and not weight.is_file():
        raise RuntimeError(f'Chưa có weight: {weight}. Chạy python backend/download-model.py trước.')
    executable = shutil.which('ollama')
    if not executable and not args.notebook_only:
        installed = Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs/Ollama/ollama.exe'
        if installed.is_file():
            executable = str(installed)
        else:
            raise RuntimeError('Chưa tìm thấy Ollama. Cài Ollama rồi mở lại ứng dụng.')
    runtime = model_root / 'runtime'
    runtime.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment.update(OLLAMA_HOST='127.0.0.1:11435', OLLAMA_MODELS=str(model_root/'ollama'),
                       OLLAMA_NUM_PARALLEL='1', OLLAMA_MAX_LOADED_MODELS='1', OLLAMA_CONTEXT_LENGTH='4096',
                       OLLAMA_FLASH_ATTENTION='1', OLLAMA_KV_CACHE_TYPE='q8_0',
                       OLLAMA_URL='http://127.0.0.1:11435', OLLAMA_MODEL='tdn-qwen3-8b', PYTHONUTF8='1')
    local_origin = f'http://127.0.0.1:{args.port}'
    environment['AI_ALLOWED_ORIGINS'] = ','.join(dict.fromkeys([local_origin, f'http://localhost:{args.port}', f'http://127.0.0.1:{preferred_port}', f'http://localhost:{preferred_port}']))
    engine = gateway = None
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    key = environment.get('AI_GATEWAY_KEY', '')
    log = open(runtime/'local-stack.log', 'a', encoding='utf-8')
    try:
        if not args.notebook_only:
            try:
                request(11435, '/api/version')
            except (OSError, ValueError):
                print('Đang khởi động Ollama…', flush=True)
                engine = subprocess.Popen([executable, 'serve'], env=environment, stdout=log, stderr=log, creationflags=flags)
            for attempt in range(40):
                try:
                    status, _ = request(11435, '/api/version', timeout=2)
                    if status == 200:
                        break
                except (OSError, ValueError):
                    pass
                if engine and engine.poll() is not None:
                    raise RuntimeError('Ollama dừng khi khởi động. Xem tdn-models/runtime/local-stack.log.')
                time.sleep(1)
            else:
                raise RuntimeError('Không kết nối được Ollama sau 40 lần kiểm tra.')
            _, tags = request(11435, '/api/tags')
            if not any(m.get('name', '').split(':')[0] == 'tdn-qwen3-8b' for m in tags.get('models', [])):
                definition = runtime/'Modelfile'
                definition.write_text(f'FROM "{weight.as_posix()}"\nPARAMETER num_ctx 4096\nPARAMETER temperature 0.6\n', encoding='utf-8')
                print('Đang import weight vào Ollama (chỉ cần lần đầu)…', flush=True)
                subprocess.run([executable, 'create', 'tdn-qwen3-8b', '-f', str(definition)], env=environment, stdout=log, stderr=log, check=True)
        gateway = subprocess.Popen([sys.executable, '-u', str(ROOT/'backend/gateway.py'), '--port', str(args.port)],
                                   env=environment, cwd=ROOT, stdout=log, stderr=log, creationflags=flags)
        for attempt in range(20):
            if gateway.poll() is not None:
                raise RuntimeError('Gateway không khởi động được. Cổng có thể đang được dùng; xem local-stack.log.')
            try:
                status, health = request(args.port, '/api/notebook/health', key=key)
                if status == 200 and health.get('api_version') == 1:
                    break
            except (OSError, ValueError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Gateway chưa sẵn sàng. Xem tdn-models/runtime/local-stack.log.')
        verify_notebook(args.port, key)
        print('Python notebook OK: 6 * 7 = 42', flush=True)
        if args.verify:
            print('Đang kiểm tra một câu trả lời thật từ model…', flush=True)
            status, answer = request(args.port, '/api/chat', {'problem': {'title': 'Kiểm tra kết nối'},
                                      'messages': [{'role': 'user', 'content': 'Trả lời ngắn bằng tiếng Việt: TF-IDF dùng để làm gì?'}]}, timeout=180, key=key)
            if status != 200 or not answer.get('content'):
                raise RuntimeError('Model không trả lời: ' + str(answer))
            print('AI: ' + answer['content'], flush=True)
            (runtime/'latest-verification.json').write_text(json.dumps({'status': 'passed', 'url': local_origin, 'response': answer}, ensure_ascii=False, indent=2), encoding='utf-8')
        print('SẴN SÀNG: ' + display_url + ' · Ctrl+C để dừng', flush=True)
        (runtime/'local-stack.json').write_text(json.dumps({'launcher_pid': os.getpid(), 'gateway_pid': gateway.pid,
                                  'ollama_pid': engine.pid if engine else None, 'url': display_url, 'notebook_api_url': local_origin}), encoding='utf-8')
        if args.check_only:
            return
        if not args.no_open:
            webbrowser.open(display_url)
        gateway.wait()
    finally:
        stop(gateway)
        stop(engine)
        log.close()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nĐã dừng ứng dụng local.')
    except Exception as error:
        print('Không khởi động được: ' + str(error), file=sys.stderr)
        sys.exit(1)
