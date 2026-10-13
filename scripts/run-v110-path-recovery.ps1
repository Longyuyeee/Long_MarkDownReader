$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (Get-NetTCPConnection -LocalPort 9357 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 9357 occupied; existing processes will not be stopped' }
if (-not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue)) { throw 'Start Vite on port 9000 first' }
& cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri/Cargo.toml') --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
$auditRoot = Join-Path ([IO.Path]::GetTempPath()) ('longedit-v110-path-' + [guid]::NewGuid().ToString('N'))
$library = Join-Path $auditRoot 'library'
New-Item -ItemType Directory -Path (Join-Path $library 'Project') | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/v126-search/Note.md') -Destination (Join-Path $library 'Note.md')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/v126-search/Note.md') -Destination (Join-Path $library 'Project/Child.md')
$names = @('LONGEDIT_E2E_LIBRARY','LONGEDIT_E2E_CONFIG_DIR','WEBVIEW2_USER_DATA_FOLDER','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','LONGEDIT_CDP_ENDPOINT','LONGEDIT_PATH_RECOVERY_OUTPUT')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$app = $null
try {
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_CONFIG_DIR = Join-Path $auditRoot 'config'
  $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $auditRoot 'webview'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9357 --remote-allow-origins=*'
  $env:LONGEDIT_CDP_ENDPOINT = 'http://127.0.0.1:9357'
  $env:LONGEDIT_PATH_RECOVERY_OUTPUT = Join-Path $workspace 'docs/evidence/v110-path-recovery-native'
  $app = Start-Process -FilePath (Join-Path $workspace 'src-tauri/target/debug/tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  & node (Join-Path $PSScriptRoot 'test-v110-path-recovery-native.mjs')
  if ($LASTEXITCODE -ne 0) { throw "Path recovery audit failed; fixtures retained at $auditRoot" }
} finally {
  if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id }
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
Write-Output "Isolated fixtures retained: $auditRoot"
