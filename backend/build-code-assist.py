"""Build a small offline signature index from installed libraries; never executes student code."""
import importlib
import inspect
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
catalog = {'schema': 1, 'versions': {}, 'modules': {}, 'callables': {}}
selected = {
    'torch': 'tensor as_tensor from_numpy rand randn randint zeros ones empty arange linspace cat stack reshape flatten squeeze unsqueeze transpose matmul mm bmm sum mean max min argmax softmax sigmoid relu no_grad manual_seed device save load float32 float64 int64 nn optim utils',
    'numpy': 'array asarray zeros ones empty arange linspace reshape concatenate stack vstack hstack mean std var sum min max argmin argmax dot matmul exp log sqrt abs where unique clip round random float32 float64 int32 int64 ndarray',
    'pandas': 'read_csv read_json read_excel read_parquet concat merge crosstab get_dummies to_datetime to_numeric date_range DataFrame Series Index',
    'torch.utils.data': 'DataLoader Dataset TensorDataset random_split Subset',
}
modules = ['torch', 'torch.nn', 'torch.nn.functional', 'torch.optim', 'torch.utils.data', 'numpy', 'pandas',
           'sklearn.linear_model', 'sklearn.model_selection', 'sklearn.metrics', 'sklearn.preprocessing',
           'sklearn.pipeline', 'sklearn.ensemble', 'sklearn.svm', 'sklearn.feature_extraction.text']

def record(qualified, obj):
    try:
        signature = inspect.signature(obj)
    except (ValueError, TypeError):
        return
    parameters = []
    for parameter in signature.parameters.values():
        if parameter.name in ('self', 'cls') or parameter.kind in (parameter.VAR_POSITIONAL, parameter.VAR_KEYWORD):
            continue
        parameters.append({'name': parameter.name, 'keyword': parameter.kind != parameter.POSITIONAL_ONLY,
                           'default': None if parameter.default is parameter.empty else repr(parameter.default)[:90],
                           'type': '' if parameter.annotation is parameter.empty else str(parameter.annotation).replace("<class '", '').replace("'>", '')[:60]})
    doc = inspect.getdoc(obj) or ''
    catalog['callables'][qualified] = {'name': qualified, 'signature': str(signature)[:1500], 'params': parameters,
                                      'doc': next((line.strip() for line in doc.splitlines() if line.strip()), '')[:200]}

for module_name in modules:
    try:
        module = importlib.import_module(module_name)
    except ImportError:
        continue
    base = module_name.split('.')[0]
    if base not in catalog['versions']:
        catalog['versions'][base] = getattr(importlib.import_module(base), '__version__', 'installed')
    names = selected[module_name].split() if module_name in selected else sorted(name for name in dir(module) if not name.startswith('_'))[:220]
    entries = []
    for name in names:
        try:
            obj = getattr(module, name)
        except (AttributeError, ImportError):
            continue
        if not callable(obj) and not inspect.ismodule(obj) and not name.endswith(('32', '64')):
            continue
        qualified = module_name + '.' + name
        entries.append({'name': name, 'qualified': qualified, 'kind': 'class' if inspect.isclass(obj) else 'module' if inspect.ismodule(obj) else 'function' if callable(obj) else 'value'})
        if callable(obj):
            record(qualified, obj)
            if inspect.isclass(obj):
                methods = []
                for method in ['fit', 'predict', 'fit_transform', 'transform', 'score', 'forward', 'to', 'train', 'eval', 'parameters', 'read_csv', 'head', 'drop', 'fillna', 'to_csv', 'split']:
                    try:
                        value = getattr(obj, method)
                        if callable(value):
                            methods.append({'name': method, 'qualified': qualified + '.' + method, 'kind': 'method'})
                            record(qualified + '.' + method, value)
                    except (AttributeError, TypeError):
                        pass
                if methods:
                    catalog['modules'][qualified] = methods
    catalog['modules'][module_name] = entries

destination = ROOT / 'dist/code-assist-data.json'
definitions, identities, references = [], {}, {}
for qualified, entry in catalog['callables'].items():
    definition = {key: value for key, value in entry.items() if key != 'name'}
    identity = json.dumps(definition, sort_keys=True)
    if identity not in identities:
        identities[identity] = len(definitions)
        definitions.append(definition)
    references[qualified] = identities[identity]
catalog['definitions'] = definitions
catalog['callables'] = references
destination.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Indexed {len(catalog["callables"])} signatures; {destination.stat().st_size:,} bytes')
