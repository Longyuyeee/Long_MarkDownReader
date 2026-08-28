param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'run-post-v115-m3a1-semantics-audit.ps1'
$previousTarget = $env:CARGO_TARGET_DIR
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'longedit-mdreader-cargo-target' }
try {
  $sessions = @(
    @{ Theme = 'dark'; Motion = 'calm' },
    @{ Theme = 'dark'; Motion = 'reduced' },
    @{ Theme = 'white'; Motion = 'reduced' },
    @{ Theme = 'contrast'; Motion = 'reduced' }
  )
  foreach ($session in $sessions) {
    $arguments = @{ Stage = 'M3B11'; Theme = $session.Theme; Motion = $session.Motion; SkipEvidenceCheck = $true }
    if ($SkipBuild -or $session -ne $sessions[0]) { $arguments.SkipBuild = $true }
    if ($session -ne $sessions[0]) { $arguments.Append = $true }
    & $runner @arguments
    if ($LASTEXITCODE -ne 0) { throw "M3B-11 $($session.Theme)/$($session.Motion) desktop audit failed" }
  }
  & node (Join-Path $workspace 'scripts\check-post-v115-m3b11-restrained-node-status-rings.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'M3B-11 evidence contract failed' }
  Write-Output 'M3B-11 four-session real desktop audit completed'
} finally {
  $env:CARGO_TARGET_DIR = $previousTarget
}
