param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v115-m1d-selection'
$appPort = 14200; $cdpPort = 14533
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M1D selection audit requires free ports $appPort and $cdpPort" }
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null
if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'M1D production build failed' }
  $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.e2e.conf.json') -Raw
  & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw 'M1D Tauri build failed' }
}
$root = Join-Path $env:TEMP ("longedit-m1d-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $root 'library'; $webview = Join-Path $root 'webview'
New-Item -ItemType Directory -Path $library,$webview -Force | Out-Null
$vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port',"$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
try {
  for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME='dark'; $env:LONGEDIT_E2E_STYLE='sharp'; $env:LONGEDIT_E2E_MOTION='reduced'
  $env:WEBVIEW2_USER_DATA_FOLDER=$webview; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process (Join-Path $workspace 'src-tauri\target\debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  try {
    for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_M1D_LIBRARY=$library; $env:LONGEDIT_M1D_OUTPUT=$output
    & node (Join-Path $workspace 'scripts\capture-post-v115-m1d-selection-audit.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'M1D real desktop selection audit failed' }
  } finally { if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force } }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process $vite.Id -Force }
  Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "M1D real selection audit completed: $output"
