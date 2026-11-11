param([string]$ModelDirectory = (Join-Path $PSScriptRoot "../tdn-models"), [int]$Port = 5173)
$ErrorActionPreference = "Stop"
python (Join-Path $PSScriptRoot "run-local.py") --model-directory $ModelDirectory --port $Port
exit $LASTEXITCODE
