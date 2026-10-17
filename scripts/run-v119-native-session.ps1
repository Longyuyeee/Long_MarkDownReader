param([Parameter(Mandatory=$true)][string]$ProductDirectory,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows'){throw 'Only a disposable hosted Windows runner may launch this session IPC audit'}
$product=(Resolve-Path -LiteralPath $ProductDirectory).Path
$expectedCommit='6a3b10357bda9a2ee095fa07fe26cafd622a2ab0'
if((& git -C $product rev-parse HEAD).Trim() -ne $expectedCommit){throw 'Fixed session product source differs'}
if((& git -C $product status --porcelain --untracked-files=no)){throw 'Fixed product source is dirty'}
$output=[IO.Path]::GetFullPath($OutputDirectory)
if($output -ne [IO.Path]::GetFullPath((Join-Path $env:GITHUB_WORKSPACE 'session-native-evidence')) -or (Test-Path -LiteralPath $output)){throw 'Evidence requires a fresh exact output directory'}
if(Get-NetTCPConnection -LocalPort 14200,9458 -State Listen -ErrorAction SilentlyContinue){throw 'Audit ports must be free'}
New-Item -ItemType Directory -Path $output | Out-Null
$auditRoot=Join-Path $env:RUNNER_TEMP ('longedit-v119-session-'+[Guid]::NewGuid().ToString('N'))
$driver=Join-Path $PSScriptRoot 'capture-v119-native-session.mjs'
& node $driver fixture $auditRoot $output
if($LASTEXITCODE -ne 0){throw 'Exclusive generated session fixture failed'}
$fixture=Get-Content -LiteralPath (Join-Path $auditRoot 'fixture.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$env:LONGEDIT_E2E_LIBRARY=$fixture.library
$env:LONGEDIT_E2E_CONFIG_DIR=$fixture.config
$env:LONGEDIT_E2E_THEME='white'
$env:LONGEDIT_E2E_STYLE='minimal'
$env:LONGEDIT_E2E_MOTION='calm'
$env:WEBVIEW2_USER_DATA_FOLDER=$fixture.webview
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9458 --remote-allow-origins=http://127.0.0.1:9458'
$env:LONGEDIT_NATIVE_EXECUTABLE=Join-Path $product 'src-tauri\target\debug\tauri-app.exe'
$node=(Get-Command node.exe).Source
. (Join-Path $PSScriptRoot 'lib\v118-webview-test-policy.ps1')
$vite=$null;$app=$null
try{
 Enable-V118WebViewTestPolicy $fixture.webview
 $vite=Start-Process -FilePath $node -ArgumentList 'node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','14200','--strictPort' -WorkingDirectory $product -WindowStyle Hidden -RedirectStandardOutput (Join-Path $output 'vite.stdout.log') -RedirectStandardError (Join-Path $output 'vite.stderr.log') -PassThru
 $ready=$false
 for($n=0;$n -lt 150;$n++){try{if((Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:14200/' -TimeoutSec 2).StatusCode -eq 200){$ready=$true;break}}catch{};Start-Sleep -Milliseconds 200}
 if(-not $ready){throw 'Fixed product dev server unavailable'}
 foreach($phase in @('baseline','restart')){
  $app=Start-Process -FilePath $env:LONGEDIT_NATIVE_EXECUTABLE -ArgumentList '--minimized' -WorkingDirectory $product -WindowStyle Hidden -RedirectStandardOutput (Join-Path $output "$phase.stdout.log") -RedirectStandardError (Join-Path $output "$phase.stderr.log") -PassThru
  try{& node $driver $phase $auditRoot $output;if($LASTEXITCODE -ne 0){throw "Real native session IPC failed: $phase"}}
  finally{if($app -and -not $app.HasExited){Stop-Process -Id $app.Id -Force};$app=$null}
  for($n=0;$n -lt 150;$n++){if(-not(Get-NetTCPConnection -LocalPort 9458 -State Listen -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 100}
  if(Get-NetTCPConnection -LocalPort 9458 -State Listen -ErrorAction SilentlyContinue){throw 'Owned WebView process did not close before restart'}
 }
}finally{
 if($app -and -not $app.HasExited){Stop-Process -Id $app.Id -Force}
 if($vite -and -not $vite.HasExited){Stop-Process -Id $vite.Id -Force}
 Disable-V118WebViewTestPolicy
 # Generated fixture/junctions remain on the disposable VM. Never recursively
 # remove a computed/user directory or terminate arbitrary port owners.
}
