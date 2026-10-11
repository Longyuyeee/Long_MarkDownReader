$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (Get-NetTCPConnection -LocalPort 9356 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 9356 is occupied; existing processes will not be stopped' }
if (-not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue)) { throw 'Start the repository Vite server on localhost:9000 first' }
& cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri/Cargo.toml')
if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
$auditRoot = Join-Path ([IO.Path]::GetTempPath()) ('longedit-v110-data-' + [guid]::NewGuid().ToString('N'))
$library = Join-Path $auditRoot 'library'
New-Item -ItemType Directory -Path $library | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/v126-search/Note.md') -Destination $library
$names = @('LONGEDIT_E2E_LIBRARY','LONGEDIT_E2E_CONFIG_DIR','LONGEDIT_E2E_THEME','WEBVIEW2_USER_DATA_FOLDER','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','LONGEDIT_CDP_ENDPOINT','LONGEDIT_UX26_OUTPUT')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$app = $null
try {
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_CONFIG_DIR = Join-Path $auditRoot 'config'
  $env:LONGEDIT_E2E_THEME = 'white'
  $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $auditRoot 'webview'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9356 --remote-allow-origins=*'
  $env:LONGEDIT_CDP_ENDPOINT = 'http://127.0.0.1:9356'
  $env:LONGEDIT_UX26_OUTPUT = Join-Path $workspace 'docs/evidence/v110-native-data'
  foreach ($phase in @('initial','restart')) {
    $app = Start-Process -FilePath (Join-Path $workspace 'src-tauri/target/debug/tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
    & node (Join-Path $PSScriptRoot 'capture-v110-native-data.mjs') $phase
    if ($LASTEXITCODE -ne 0) { throw "Native data audit failed in $phase; fixtures retained at $auditRoot" }
    Stop-Process -Id $app.Id
    $app.WaitForExit()
  }
} finally {
  if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id }
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
Write-Output "Native data checks passed. Isolated fixtures retained: $auditRoot"
