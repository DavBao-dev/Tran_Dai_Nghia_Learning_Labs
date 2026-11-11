from pathlib import Path
import os, json, hashlib, argparse

parser = argparse.ArgumentParser()
parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[2] / 'tdn-models')
root = parser.parse_args().directory.resolve()
root.mkdir(parents=True, exist_ok=True)
os.environ['HF_HOME'] = str(root / '.hf-cache')
os.environ['HF_HUB_DOWNLOAD_TIMEOUT'] = '120'
os.environ['HF_HUB_DISABLE_XET'] = '1'
from huggingface_hub import HfApi, hf_hub_download

repo = 'Qwen/Qwen3-8B-GGUF'
filename = 'Qwen3-8B-Q4_K_M.gguf'
info = HfApi().model_info(repo, revision='7c41481f57cb95916b40956ab2f0b139b296d974', files_metadata=True)
entry = next(s for s in info.siblings if s.rfilename == filename)
expected = entry.lfs.sha256
metadata = {'repo': repo, 'revision': info.sha, 'file': filename, 'bytes': entry.size, 'sha256': expected, 'status': 'downloading'}
manifest = root / 'model-info.json'
manifest.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
print(f'Downloading {repo}/{filename}: {entry.size / 1e9:.2f} GB', flush=True)
path = hf_hub_download(repo, filename, revision=info.sha, local_dir=root)
print('Checking SHA-256...', flush=True)
sha = hashlib.sha256()
with open(path, 'rb') as f:
    for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
        sha.update(block)
if sha.hexdigest() != expected:
    raise RuntimeError('Downloaded model checksum mismatch')
metadata['status'] = 'verified'
manifest.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
print(json.dumps(metadata), flush=True)
