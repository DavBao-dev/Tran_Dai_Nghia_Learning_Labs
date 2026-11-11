"""Start a temporary, authenticated chat tunnel; all private state stays outside Git."""
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen, Request
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT.parent / 'tdn-models/runtime'
RUNTIME.mkdir(parents=True, exist_ok=True)
STOP = RUNTIME / 'group.stop'
STATE = RUNTIME / 'group-state.json'
children, logs = [], []
env = os.environ.copy()
env.update(OLLAMA_HOST='127.0.0.1:11435', OLLAMA_URL='http://127.0.0.1:11435',
    OLLAMA_MODELS=str(ROOT.parent/'tdn-models/ollama'), OLLAMA_MODEL='tdn-qwen3-8b',
    OLLAMA_NUM_PARALLEL='1', OLLAMA_MAX_LOADED_MODELS='1', OLLAMA_CONTEXT_LENGTH='4096',
    OLLAMA_FLASH_ATTENTION='1', OLLAMA_KV_CACHE_TYPE='q8_0', PYTHONUTF8='1',
    AI_ALLOWED_ORIGINS='https://tran-dai-nghia-learning-labs.vercel.app,http://127.0.0.1:5173,http://localhost:5173')

def get(url, token=None):
    return json.load(urlopen(Request(url, headers={'Authorization': 'Bearer '+token} if token else {}), timeout=4))

def launch(args, name):
    log = open(RUNTIME/name, 'w', encoding='utf-8')
    logs.append(log)
    child = subprocess.Popen(args, cwd=ROOT, env=env, stdout=log, stderr=log,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    children.append(child)
    return child

try:
    # Fail safely if the chat port is already occupied; do not start duplicate servers.
    import socket
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 5180))
    STOP.unlink(missing_ok=True)
    keyfile = RUNTIME/'group-key.txt'
    if not keyfile.exists():
        keyfile.write_text(secrets.token_urlsafe(32), encoding='utf-8')
    key = keyfile.read_text(encoding='utf-8').strip()
    env['AI_GATEWAY_KEY'] = key
    exe = shutil.which('cloudflared') or str(RUNTIME/'cloudflared.exe')
    if not Path(exe).is_file():
        raise RuntimeError('Install cloudflared or put cloudflared.exe in tdn-models/runtime first.')
    try:
        tags = get(env['OLLAMA_URL']+'/api/tags')
    except Exception:
        ollama = shutil.which('ollama') or str(Path(os.environ['LOCALAPPDATA'])/'Programs/Ollama/ollama.exe')
        launch([ollama, 'serve'], 'group-ollama.log')
        for _ in range(30):
            time.sleep(1)
            try:
                tags = get(env['OLLAMA_URL']+'/api/tags')
                break
            except Exception:
                pass
        else:
            raise RuntimeError('Ollama did not start. See group-ollama.log.')
    if not any(m['name'].split(':')[0] == env['OLLAMA_MODEL'] for m in tags.get('models', [])):
        raise RuntimeError('Run Chay-AI-Local.cmd once to create the Qwen model first.')
    launch([sys.executable, '-u', str(ROOT/'backend/group_gateway.py')], 'group-gateway.log')
    for _ in range(20):
        time.sleep(1)
        try:
            if get('http://127.0.0.1:5180/api/health', key)['ready']:
                break
        except Exception:
            pass
    else:
        raise RuntimeError('Chat gateway did not start.')
    tunnel = launch([exe, 'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:5180'], 'group-tunnel.log')
    for _ in range(90):
        time.sleep(1)
        match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', (RUNTIME/'group-tunnel.log').read_text(encoding='utf-8', errors='replace'))
        if match:
            url = match.group()
            break
        if tunnel.poll() is not None:
            raise RuntimeError('Tunnel stopped; see group-tunnel.log.')
    else:
        raise RuntimeError('No tunnel URL after 90 seconds.')
    STATE.write_text(json.dumps({'url': url, 'pid': os.getpid(), 'children': [p.pid for p in children]}), encoding='utf-8')
    (RUNTIME/'GROUP-ACCESS.txt').write_text(
        'Website: https://tran-dai-nghia-learning-labs.vercel.app/?groupGateway='+quote(url+'/api/chat', safe='')+'#exam\n'
        'Open Chat AI > Cau hinh\nGateway: '+url+'/api/chat\nMa truy cap: '+key+
        '\nShare this file privately with your group. Do not upload to GitHub.\n'
        'Keep this PC awake. URL changes after restarting. Run Dung-AI-Nhom.cmd to stop.\n', encoding='utf-8')
    print('READY: '+url+' | Access instructions: '+str(RUNTIME/'GROUP-ACCESS.txt'), flush=True)
    while not STOP.exists():
        if any(p.poll() is not None for p in children):
            raise RuntimeError('A group service exited. Check group logs.')
        time.sleep(2)
except KeyboardInterrupt:
    pass
finally:
    for p in reversed(children):
        if p.poll() is None:
            p.terminate()
            try:
                p.wait(timeout=8)
            except subprocess.TimeoutExpired:
                p.kill()
    for log in logs:
        log.close()
