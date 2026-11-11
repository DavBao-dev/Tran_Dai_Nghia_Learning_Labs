"""Chat-only public boundary. Never exposes files, notebook execution or admin APIs."""
import collections
import os
import threading
import time
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
import gateway

if not gateway.ACCESS_KEY:
    raise SystemExit('AI_GATEWAY_KEY is required')

class GroupGateway(gateway.Gateway):
    attempts = collections.deque()
    lock = threading.Lock()

    def reply(self, status, data):
        if 'content' in data:
            data['mode'] = 'fast'
        if 'notebook' in data:
            data['notebook'] = False
        return super().reply(status, data)

    def setup(self):
        super().setup()
        self.connection.settimeout(100)

    def do_HEAD(self):
        self.reply(404, {'error': 'Chat API only.'})

    def do_GET(self):
        if urlsplit(self.path).path != '/api/health':
            return self.reply(404, {'error': 'Chat API only.'})
        return super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != '/api/chat':
            return self.reply(404, {'error': 'Chat API only.'})
        if not self.authorized():
            return
        with self.lock:
            now = time.monotonic()
            while self.attempts and self.attempts[0] < now - 60:
                self.attempts.popleft()
            if len(self.attempts) >= 12:
                return self.reply(429, {'error': 'Nhóm tối đa 12 lượt/phút. Hãy chờ một chút.'})
            self.attempts.append(now)
        return super().do_POST()

# Keep Quick Tunnel requests short and bound GPU output for the shared machine.
gateway.inference_profile = lambda payload: {
    'think': False, 'options': {'num_ctx': 4096, 'num_predict': 768, 'temperature': 0.6}}

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('GROUP_PORT', '5180'))), GroupGateway).serve_forever()
