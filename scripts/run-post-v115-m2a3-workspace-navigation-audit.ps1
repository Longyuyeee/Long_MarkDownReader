param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v115-m2a3-workspace-navigation'
$root = Join-Path $env:TEMP ("longedit-m2a3-{0}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$libraryName = -join ([char[]](0x771F,0x5B9E,0x5BFC,0x822A,0x8D44,0x6599,0x5E93))
$library = Join-Path $root $libraryName
$webview = Join-Path $root 'webview'
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output,$library,$webview -Force | Out-Null
Copy-Item -Path (Join-Path $workspace 'fixtures\post-v115-m0\workspace\*') -Destination $library -Recurse -Force
$taskFile = Join-Path $library 'm2a3-filter.md'
$today = Get-Date
$todayKey = $today.ToString('yyyy-MM-dd')
$overdueKey = $today.AddDays(-6).ToString('yyyy-MM-dd')
$futureKey = $today.AddDays(15).ToString('yyyy-MM-dd')
$taskContent = @(
  '# Filter tasks',
  "- [ ] Today urgent !high @due($todayKey)",
  "- [ ] Future low !low @due($futureKey)",
  '- [ ] General task without date',
  "- [x] Completed medium !medium @due($overdueKey)"
) -join "`r`n"
[IO.File]::WriteAllText($taskFile, "$taskContent`r`n", [Text.UTF8Encoding]::new($false))
$projectCanvas = Join-Path $library 'boards\project-board.canvas'
[IO.File]::WriteAllText($projectCanvas, '{"nodes":[{"id":"m2a3","type":"text","text":"M2A3 project board","x":0,"y":0,"width":320,"height":120}],"edges":[]}', [Text.UTF8Encoding]::new($false))
$pinnedCanvas = Get-ChildItem (Join-Path $library 'boards') -Filter '*.canvas' | Where-Object Name -ne 'project-board.canvas' | Select-Object -First 1 -ExpandProperty FullName
if (-not $pinnedCanvas) { throw 'Pinned Canvas fixture missing' }
if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
  & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed' }
}
if (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 9000 is already in use' }
$vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','9000','--strictPort' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
try {
  for ($i = 0; $i -lt 180 -and -not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = 'dark'
  $env:LONGEDIT_E2E_STYLE = 'sharp'
  $env:LONGEDIT_E2E_MOTION = 'reduced'
  $env:WEBVIEW2_USER_DATA_FOLDER = $webview
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9336 --remote-allow-origins=*'
  $app = Start-Process (Join-Path $workspace 'src-tauri\target\debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  try {
    for ($i = 0; $i -lt 180 -and -not (Get-NetTCPConnection -LocalPort 9336 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
    $env:LONGEDIT_CDP_ENDPOINT = 'http://127.0.0.1:9336'
    $env:LONGEDIT_M2A3_AUDIT_OUTPUT = $output
    $env:LONGEDIT_M2A3_LIBRARY = $library
    $env:LONGEDIT_M2A3_PINNED_CANVAS = $pinnedCanvas
    $env:LONGEDIT_M2A3_TASK_FILE = $taskFile
    & node (Join-Path $workspace 'scripts\capture-post-v115-m2a3-workspace-navigation.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'M2A3 desktop audit failed' }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force }
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process $vite.Id -Force }
  Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
& node (Join-Path $workspace 'scripts\check-post-v115-m2a3-workspace-navigation.mjs')
if ($LASTEXITCODE -ne 0) { throw 'M2A3 evidence check failed' }
Write-Output "M2A3 audit completed: $output"
