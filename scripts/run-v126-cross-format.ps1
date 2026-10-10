$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (Get-NetTCPConnection -LocalPort 9000,9355 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Ports 9000 and 9355 must be free. Existing applications will not be stopped.'
}
& cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri/Cargo.toml')
if ($LASTEXITCODE -ne 0) { throw 'Native debug build failed' }
$auditRoot = Join-Path ([IO.Path]::GetTempPath()) ('longedit-v126-' + [guid]::NewGuid().ToString('N'))
$library = Join-Path $auditRoot 'library'
New-Item -ItemType Directory -Path $library -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/v126-search/Note.md'),(Join-Path $PSScriptRoot 'fixtures/v126-search/Budget.md') -Destination $library
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/v126-search/Paper.pdf'),(Join-Path $PSScriptRoot 'fixtures/v126-search/Plain.txt') -Destination $library
$names = @('LONGEDIT_E2E_LIBRARY','LONGEDIT_E2E_THEME','WEBVIEW2_USER_DATA_FOLDER','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','LONGEDIT_UX26_OUTPUT','LONGEDIT_CDP_ENDPOINT')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$vite = $null
$app = $null
try {
  $vite = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 9000 --strictPort' -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $auditRoot 'vite.log') -RedirectStandardError (Join-Path $auditRoot 'vite-error.log') -PassThru
  $ready = $false
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    if ($vite.HasExited) { throw 'Vite exited before startup' }
    if (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $ready) { throw 'Vite startup timed out' }
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = 'white'
  $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $auditRoot 'webview'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9355 --remote-allow-origins=*'
  $env:LONGEDIT_CDP_ENDPOINT = 'http://127.0.0.1:9355'
  $env:LONGEDIT_UX26_OUTPUT = Join-Path $workspace 'docs/evidence/v126-cross-format'
  $app = Start-Process -FilePath (Join-Path $workspace 'src-tauri/target/debug/tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  Push-Location $workspace
  try {
    & node scripts/capture-v126-cross-format.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Search user-flow regression failed; inspect the failure report' }
  } finally { Pop-Location }
} finally {
  # Only processes created by this invocation; never kill listeners by port.
  if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id }
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id }
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
Write-Output "Passed. Generated fixtures/logs retained at $auditRoot; no user library or installed application changed."
