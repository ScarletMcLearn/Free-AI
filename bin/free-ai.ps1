$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$env:FREE_AI_CALLER_CWD = (Get-Location).ProviderPath
& node (Join-Path $RepoRoot "src/free-ai.mjs") @args
exit $LASTEXITCODE
