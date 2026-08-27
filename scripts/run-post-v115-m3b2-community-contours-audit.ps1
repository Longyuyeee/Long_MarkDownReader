param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'run-post-v115-m3a1-semantics-audit.ps1'
$first = $true
foreach ($theme in 'dark','white','contrast') {
  $arguments = @{ Stage = 'M3B2'; Theme = $theme; SkipEvidenceCheck = $true }
  if ($SkipBuild -or -not $first) { $arguments.SkipBuild = $true }
  if (-not $first) { $arguments.Append = $true }
  & $runner @arguments
  if ($LASTEXITCODE -ne 0) { throw "M3B-2 $theme desktop audit failed" }
  $first = $false
}
& node (Join-Path $workspace 'scripts\check-post-v115-m3b2-community-contours-semantic-hierarchy.mjs')
if ($LASTEXITCODE -ne 0) { throw 'M3B-2 evidence contract failed' }
Write-Output 'M3B-2 dark/light/high-contrast real desktop audit completed'
