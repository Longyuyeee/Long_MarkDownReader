param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v115-explicit-save-alignment'
$root = Join-Path $env:TEMP ("longedit-explicit-save-{0}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$baselineSource = Join-Path $root 'baseline-source'
$baselineLibrary = Join-Path $root 'baseline-library'
$currentLibrary = Join-Path $root 'current-library'
$baselineWebview = Join-Path $root 'baseline-webview'
$currentWebview = Join-Path $root 'current-webview'
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output,$baselineLibrary,$currentLibrary,$baselineWebview,$currentWebview -Force | Out-Null
$fixtureName = 'explicit-save-test.md'
$content = "# Explicit Save Test`r`n`r`nOriginal content`r`n"
[IO.File]::WriteAllText((Join-Path $baselineLibrary $fixtureName), $content, [Text.UTF8Encoding]::new($true))
[IO.File]::WriteAllText((Join-Path $currentLibrary $fixtureName), $content, [Text.UTF8Encoding]::new($true))
if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
  & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed' }
}
& git worktree add --detach $baselineSource HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot create baseline worktree' }
function Stop-Port([int]$Port) { Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
function Invoke-Scenario([string]$Library,[string]$Webview,[int]$CdpPort,[string]$Mode) {
  if (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 9000 is already in use' }
  if ($Mode -eq 'baseline') { $env:LONGEDIT_EXPLICIT_SAVE_BASELINE_SOURCE = Join-Path $baselineSource 'src\views\LibraryMode.vue' }
  else { Remove-Item Env:LONGEDIT_EXPLICIT_SAVE_BASELINE_SOURCE -ErrorAction SilentlyContinue }
  $vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','9000','--strictPort' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
  try {
    for ($i = 0; $i -lt 180 -and -not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
    $env:LONGEDIT_E2E_LIBRARY = $Library
    $env:LONGEDIT_E2E_THEME = 'dark'
    $env:LONGEDIT_E2E_STYLE = 'sharp'
    $env:LONGEDIT_E2E_MOTION = 'reduced'
    $env:WEBVIEW2_USER_DATA_FOLDER = $Webview
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$CdpPort --remote-allow-origins=*"
    $app = Start-Process (Join-Path $workspace 'src-tauri\target\debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
    try {
      for ($i = 0; $i -lt 240 -and -not (Get-NetTCPConnection -LocalPort $CdpPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
      $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$CdpPort"
      $env:LONGEDIT_EXPLICIT_SAVE_OUTPUT = $output
      $env:LONGEDIT_EXPLICIT_SAVE_FIXTURE = Join-Path $Library $fixtureName
      $env:LONGEDIT_EXPLICIT_SAVE_MODE = $Mode
      & node (Join-Path $workspace 'scripts\capture-post-v115-explicit-save-alignment.mjs')
      if ($LASTEXITCODE -ne 0) { throw "$Mode explicit-save scenario failed" }
    } finally {
      if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force }
      Stop-Port $CdpPort
    }
  } finally {
    if ($vite -and -not $vite.HasExited) { Stop-Process $vite.Id -Force }
    Stop-Port 9000
  }
}
try {
  Invoke-Scenario $baselineLibrary $baselineWebview 9341 'baseline'
  Invoke-Scenario $currentLibrary $currentWebview 9342 'current'
} finally {
  Remove-Item Env:LONGEDIT_EXPLICIT_SAVE_BASELINE_SOURCE -ErrorAction SilentlyContinue
  & git worktree remove --force $baselineSource 2>$null
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
& node (Join-Path $workspace 'scripts\check-post-v115-explicit-save-alignment.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Explicit-save evidence check failed' }
Write-Output "Explicit-save alignment audit completed: $output"
