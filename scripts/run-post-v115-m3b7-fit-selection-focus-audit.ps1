param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'run-post-v115-m3a1-semantics-audit.ps1'
$previousTarget = $env:CARGO_TARGET_DIR
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'longedit-mdreader-cargo-target' }
try {
  $first = $true
  foreach ($motion in 'calm','reduced') {
    $arguments = @{ Stage = 'M3B7'; Theme = 'dark'; Motion = $motion; SkipEvidenceCheck = $true }
    if ($SkipBuild -or -not $first) { $arguments.SkipBuild = $true }
    if (-not $first) { $arguments.Append = $true }
    & $runner @arguments
    if ($LASTEXITCODE -ne 0) { throw "M3B-7 dark/$motion desktop audit failed" }
    $first = $false
  }
  & node (Join-Path $workspace 'scripts\check-post-v115-m3b7-fit-selection-reduced-motion-focus.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'M3B-7 evidence contract failed' }
  Write-Output 'M3B-7 dark calm/reduced real desktop audit completed'
} finally {
  $env:CARGO_TARGET_DIR = $previousTarget
}
