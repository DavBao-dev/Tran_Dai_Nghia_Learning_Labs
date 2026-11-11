# Qwen model

Weights: `Qwen3-8B-Q4_K_M.gguf` (5,027,783,488 bytes).
SHA-256: `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`.

[Download pinned original weights](https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/7c41481f57cb95916b40956ab2f0b139b296d974/Qwen3-8B-Q4_K_M.gguf)

Run `python -m pip install huggingface_hub`, then `python backend/download-model.py` to download and verify the weights. The local launcher uses the sibling `tdn-models` directory.

Vercel serves the frontend and browser-based TorchViz runtime. Uploading GGUF weights does not provide an inference server. Chat needs the Ollama gateway on a separate machine; public access requires an HTTPS gateway. Notebook execution and Gallery management remain local backend features.
