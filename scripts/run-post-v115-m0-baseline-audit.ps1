$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $repo 'docs\evidence\post-v115-m0-baseline'
New-Item -ItemType Directory -Force -Path $evidence | Out-Null

$env:LONGEDIT_M0_WORKSPACE_EVIDENCE = Join-Path $evidence 'workspace-baseline.json'
$env:LONGEDIT_M0_GRAPH_EVIDENCE = Join-Path $evidence 'graph-baseline.json'

Push-Location $repo
try {
  cargo test --locked --manifest-path src-tauri/Cargo.toml post_v115_m0_ -- --nocapture --test-threads=1
  if ($LASTEXITCODE -ne 0) { throw 'M0 real workspace and graph baseline failed' }
  node scripts/check-post-v115-m0-baseline.mjs
  if ($LASTEXITCODE -ne 0) { throw 'M0 baseline contract failed' }
} finally {
  Pop-Location
  Remove-Item Env:LONGEDIT_M0_WORKSPACE_EVIDENCE -ErrorAction SilentlyContinue
  Remove-Item Env:LONGEDIT_M0_GRAPH_EVIDENCE -ErrorAction SilentlyContinue
}
