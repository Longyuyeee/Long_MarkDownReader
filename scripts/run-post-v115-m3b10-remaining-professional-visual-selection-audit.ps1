param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'run-post-v115-m3a1-semantics-audit.ps1'
$previousTarget = $env:CARGO_TARGET_DIR
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'longedit-mdreader-cargo-target' }
try {
  $arguments = @{ Stage = 'M3B10'; Theme = 'dark'; Motion = 'reduced' }
  if ($SkipBuild) { $arguments.SkipBuild = $true }
  & $runner @arguments
  if ($LASTEXITCODE -ne 0) { throw 'M3B-10 real desktop audit failed' }
  Write-Output 'M3B-10 dark/reduced real desktop selection audit completed'
} finally {
  $env:CARGO_TARGET_DIR = $previousTarget
}
