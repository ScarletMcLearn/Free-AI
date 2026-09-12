$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& node (Join-Path $RepoRoot "src/fallback-test.mjs") @args
exit $LASTEXITCODE
