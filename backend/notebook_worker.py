"""Trusted local Python cell worker. This is not a sandbox."""
import ast
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import traceback

os.environ.setdefault('MPLBACKEND', 'Agg')
sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')
sys.path.insert(0, os.getcwd())
protocol = sys.stdout
namespace = {'__name__': '__main__'}
count = 0

for line in sys.stdin:
    try:
        request = json.loads(line)
        count += 1
        outputs = []
        stdout, stderr = io.StringIO(), io.StringIO()
        ok = True
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try:
                tree = ast.parse(request['code'], filename=f'<cell-{count}>', mode='exec')
                expression = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
                exec(compile(tree, f'<cell-{count}>', 'exec'), namespace)
                if expression:
                    result = eval(compile(ast.Expression(expression.value), f'<cell-{count}>', 'eval'), namespace)
                    if result is not None:
                        outputs.append({'output_type': 'execute_result', 'execution_count': count,
                                        'metadata': {}, 'data': {'text/plain': repr(result)[:100000]}})
            except BaseException as error:
                ok = False
                outputs.append({'output_type': 'error', 'ename': type(error).__name__, 'evalue': str(error)[:10000],
                                'traceback': traceback.format_exception(type(error), error, error.__traceback__)[-20:]})
        streams = []
        for name, value in [('stdout', stdout.getvalue()), ('stderr', stderr.getvalue())]:
            if value:
                streams.append({'output_type': 'stream', 'name': name, 'text': value[:200000]})
        outputs = streams + outputs
        pyplot = sys.modules.get('matplotlib.pyplot')
        if pyplot:
            try:
                for number in pyplot.get_fignums()[:5]:
                    buffer = io.BytesIO()
                    pyplot.figure(number).savefig(buffer, format='png', dpi=110, bbox_inches='tight')
                    if buffer.tell() < 2000000:
                        outputs.append({'output_type': 'display_data', 'metadata': {},
                                        'data': {'image/png': base64.b64encode(buffer.getvalue()).decode()}})
                pyplot.close('all')
            except Exception:
                pass
        files = {}
        total = 0
        for file in Path.cwd().rglob('*'):
            if file.is_symlink() or not file.is_file() or file.suffix.lower() not in {'.csv', '.txt', '.md', '.json', '.py'}:
                continue
            if any(part.startswith('.') or part == '__pycache__' for part in file.relative_to(Path.cwd()).parts):
                continue
            size = file.stat().st_size
            if size > 1000000 or total + size > 2000000:
                continue
            try:
                text = file.read_text(encoding='utf-8')
                files[file.relative_to(Path.cwd()).as_posix()] = text
                total += size
            except (UnicodeError, OSError):
                pass
        response = {'ok': ok, 'execution_count': count, 'outputs': outputs, 'files': files}
    except BaseException as error:
        response = {'ok': False, 'execution_count': count, 'outputs': [{'output_type': 'error',
                    'ename': type(error).__name__, 'evalue': str(error), 'traceback': [str(error)]}]}
    protocol.write(json.dumps(response, ensure_ascii=False) + '\n')
    protocol.flush()
