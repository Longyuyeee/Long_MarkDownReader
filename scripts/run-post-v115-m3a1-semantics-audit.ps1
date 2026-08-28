param([switch]$SkipBuild,[switch]$Append,[switch]$SkipEvidenceCheck,[ValidateSet('M3A1','M3A2','M3A3','M3A4','M3A5','M3A6','M3A7','M3A8','M3B0','M3B1','M3B2','M3B4','M3B5','M3B6','M3B7','M3B8','M3B9','M3B10','M3B11','M3B12')][string]$Stage = 'M3A1',[ValidateSet('dark','white','contrast')][string]$Theme = 'dark',[ValidateSet('calm','reduced')][string]$Motion = 'reduced')
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputRelative = if ($Stage -eq 'M3B1') { 'docs\evidence\post-v115-m3b1-semantic-zoom-community-overview' } elseif ($Stage -eq 'M3B0') { 'docs\evidence\post-v115-m3b0-professional-visual-baseline' } elseif ($Stage -eq 'M3A8') { 'docs\evidence\post-v115-m3a8-semantic-exploration-exit' } elseif ($Stage -eq 'M3A7') { 'docs\evidence\post-v115-m3a7-neighbor-pinning-history' } elseif ($Stage -eq 'M3A6') { 'docs\evidence\post-v115-m3a6-node-comparison' } elseif ($Stage -eq 'M3A5') { 'docs\evidence\post-v115-m3a5-community' } elseif ($Stage -eq 'M3A4') { 'docs\evidence\post-v115-m3a4-relation-evidence' } elseif ($Stage -eq 'M3A3') { 'docs\evidence\post-v115-m3a3-shortest-path' } elseif ($Stage -eq 'M3A2') { 'docs\evidence\post-v115-m3a2-neighbor-focus' } else { 'docs\evidence\post-v115-m3a1-semantics' }
if ($Stage -eq 'M3B2') { $outputRelative = 'docs\evidence\post-v115-m3b2-community-contours-semantic-hierarchy' }
if ($Stage -eq 'M3B4') { $outputRelative = 'docs\evidence\post-v115-m3b4-curved-parallel-relations-static-path-labels' }
if ($Stage -eq 'M3B5') { $outputRelative = 'docs\evidence\post-v115-m3b5-selected-path-direction-motion-reduced-motion' }
if ($Stage -eq 'M3B6') { $outputRelative = 'docs\evidence\post-v115-m3b6-navigation-camera-selection' }
if ($Stage -eq 'M3B7') { $outputRelative = 'docs\evidence\post-v115-m3b7-fit-selection-reduced-motion-focus' }
if ($Stage -eq 'M3B8') { $outputRelative = 'docs\evidence\post-v115-m3b8-remaining-navigation-selection' }
if ($Stage -eq 'M3B9') { $outputRelative = 'docs\evidence\post-v115-m3b9-bounded-semantic-minimap' }
if ($Stage -eq 'M3B10') { $outputRelative = 'docs\evidence\post-v115-m3b10-remaining-professional-visual-selection' }
if ($Stage -eq 'M3B11') { $outputRelative = 'docs\evidence\post-v115-m3b11-restrained-node-status-rings' }
if ($Stage -eq 'M3B12') { $outputRelative = 'docs\evidence\post-v115-m3b12-professional-visual-system-exit' }
$output = Join-Path $workspace $outputRelative
$auditRoot = Join-Path $env:TEMP ("longedit-m3a1-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot 'library'
$webview = Join-Path $auditRoot 'webview'
$appPort = 14200
$cdpPort = 14601
$utf8 = [Text.UTF8Encoding]::new($false)
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw 'M3A-1 audit ports are already in use' }
if (-not $Append) { Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $output,$library,$webview,(Join-Path $library 'research') -Force | Out-Null

[IO.File]::WriteAllText((Join-Path $library 'NorthStar.md'), "# North Star`n`n[[research/Brief]]`n", $utf8)
[IO.File]::WriteAllText((Join-Path $library 'research\Brief.md'), "---`nrelations:`n  depends-on: [[NorthStar]] [[NorthStar]]`n---`n# Brief`n[Evidence](longedit://pdf?path=research%2FEvidence.pdf&page=1&annotation=evidence-1)`n", $utf8)
[IO.File]::WriteAllText((Join-Path $library 'research\Evidence.pdf'), '%PDF representative fixture', $utf8)
[IO.File]::WriteAllText((Join-Path $library 'research\Evidence.pdf.annotations.json'), '{"schemaVersion":1,"source":{"pdfFile":"Evidence.pdf","size":27,"modifiedAt":1},"annotations":[{"id":"evidence-1","kind":"comment","page":1,"color":"yellow","rects":[],"quote":"retention","comment":"Supports the roadmap","createdAt":1,"updatedAt":1}]}', $utf8)
[IO.File]::WriteAllText((Join-Path $library 'research\Roadmap.table.json'), '{"schemaVersion":1,"kind":"longedit.table","data":{"columns":[{"id":"topic","name":"Topic","type":"text"}],"rows":[{"id":"row-1","values":{"topic":"Knowledge network"}}]},"views":[{"id":"chart","name":"Coverage chart","kind":"chart","config":{"categoryColumn":"topic"}},{"id":"dashboard","name":"Management dashboard","kind":"dashboard","config":{"dashboardItems":[{"chartViewId":"chart","width":6}]}}],"activeView":"dashboard"}', $utf8)
[IO.File]::WriteAllText((Join-Path $library 'research\System.canvas'), '{"nodes":[{"id":"north-star","type":"file","file":"NorthStar.md","x":0,"y":0,"width":240,"height":120},{"id":"roadmap-chart","type":"file","file":"research/Roadmap.table.json","longeditViewId":"chart","x":320,"y":0,"width":240,"height":120}],"edges":[{"id":"supports-roadmap","fromNode":"north-star","toNode":"roadmap-chart","relationType":"supports"}]}', $utf8)
[IO.File]::WriteAllText((Join-Path $library 'research\Outline.opml'), '<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Delivery outline</title></head><body><outline text="Discover" _longeditId="discover"><outline text="Deliver" _longeditId="deliver"/></outline></body></opml>', $utf8)
Copy-Item -LiteralPath (Join-Path $workspace 'fixtures\pptx\producers\microsoft-powerpoint-16.pptx') -Destination (Join-Path $library 'research\Review.pptx')
if ($Stage -in @('M3B10','M3B11','M3B12')) {
  $now = [DateTime]::UtcNow
  [IO.File]::SetLastWriteTimeUtc((Join-Path $library 'NorthStar.md'), $now)
  [IO.File]::SetLastWriteTimeUtc((Join-Path $library 'research\Brief.md'), $now.AddDays(-2))
  [IO.File]::SetLastWriteTimeUtc((Join-Path $library 'research\Evidence.pdf'), $now.AddDays(-10))
  [IO.File]::SetLastWriteTimeUtc((Join-Path $library 'research\Roadmap.table.json'), $now.AddDays(-40))
  [IO.File]::SetLastWriteTimeUtc((Join-Path $library 'research\System.canvas'), $now.AddDays(-80))
  [IO.File]::SetLastWriteTimeUtc((Join-Path $library 'research\Outline.opml'), $now.AddDays(-160))
  [IO.File]::SetLastWriteTimeUtc((Join-Path $library 'research\Review.pptx'), $now.AddDays(-365))
}

if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
  $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.e2e.conf.json') -Raw
  & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw 'Tauri Debug build failed' }
}

$vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port',"$appPort",'--strictPort' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
function Wait-ForPort([int]$Port,[bool]$Listening) {
  for ($attempt = 0; $attempt -lt 600; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}
try {
  Wait-ForPort $appPort $true
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = $Theme
  $env:LONGEDIT_E2E_STYLE = 'sharp'
  $env:LONGEDIT_E2E_MOTION = $Motion
  $env:WEBVIEW2_USER_DATA_FOLDER = $webview
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $targetRoot = if ($env:CARGO_TARGET_DIR) { [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR) } else { Join-Path $workspace 'src-tauri\target' }
  $app = Start-Process (Join-Path $targetRoot 'debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_M3A1_OUTPUT = $output
    $env:LONGEDIT_M3A1_LIBRARY = $library
    $env:LONGEDIT_M3_STAGE = $Stage
    $env:LONGEDIT_M3_THEME = $Theme
    $env:LONGEDIT_M3_MOTION = $Motion
    & node (Join-Path $workspace 'scripts\capture-post-v115-m3a1-semantics.mjs')
    if ($LASTEXITCODE -ne 0) { throw "$Stage desktop capture failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort $cdpPort $false
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}
$checkRelative = if ($Stage -eq 'M3B1') { 'scripts\check-post-v115-m3b1-semantic-zoom-community-overview.mjs' } elseif ($Stage -eq 'M3B0') { 'scripts\check-post-v115-m3b0-professional-visual-baseline.mjs' } elseif ($Stage -eq 'M3A8') { 'scripts\check-post-v115-m3a8-semantic-exploration-exit.mjs' } elseif ($Stage -eq 'M3A7') { 'scripts\check-post-v115-m3a7-neighbor-pinning-history.mjs' } elseif ($Stage -eq 'M3A6') { 'scripts\check-post-v115-m3a6-node-comparison.mjs' } elseif ($Stage -eq 'M3A5') { 'scripts\check-post-v115-m3a5-community.mjs' } elseif ($Stage -eq 'M3A4') { 'scripts\check-post-v115-m3a4-relation-evidence.mjs' } elseif ($Stage -eq 'M3A3') { 'scripts\check-post-v115-m3a3-shortest-path.mjs' } elseif ($Stage -eq 'M3A2') { 'scripts\check-post-v115-m3a2-neighbor-focus.mjs' } else { 'scripts\check-post-v115-m3a1-semantics.mjs' }
if ($Stage -eq 'M3B2') { $checkRelative = 'scripts\check-post-v115-m3b2-community-contours-semantic-hierarchy.mjs' }
if ($Stage -eq 'M3B4') { $checkRelative = 'scripts\check-post-v115-m3b4-curved-parallel-relations-static-path-labels.mjs' }
if ($Stage -eq 'M3B5') { $checkRelative = 'scripts\check-post-v115-m3b5-selected-path-direction-motion-reduced-motion.mjs' }
if ($Stage -eq 'M3B6') { $checkRelative = 'scripts\check-post-v115-m3b6-navigation-camera-selection.mjs' }
if ($Stage -eq 'M3B7') { $checkRelative = 'scripts\check-post-v115-m3b7-fit-selection-reduced-motion-focus.mjs' }
if ($Stage -eq 'M3B8') { $checkRelative = 'scripts\check-post-v115-m3b8-remaining-navigation-selection.mjs' }
if ($Stage -eq 'M3B9') { $checkRelative = 'scripts\check-post-v115-m3b9-bounded-semantic-minimap.mjs' }
if ($Stage -eq 'M3B10') { $checkRelative = 'scripts\check-post-v115-m3b10-remaining-professional-visual-selection.mjs' }
if ($Stage -eq 'M3B11') { $checkRelative = 'scripts\check-post-v115-m3b11-restrained-node-status-rings.mjs' }
if ($Stage -eq 'M3B12') { $checkRelative = 'scripts\check-post-v115-m3b12-professional-visual-system-exit.mjs' }
if (-not $SkipEvidenceCheck) {
  & node (Join-Path $workspace $checkRelative)
  if ($LASTEXITCODE -ne 0) { throw "$Stage evidence contract failed" }
}
Write-Output "$Stage real desktop audit completed: $output"
