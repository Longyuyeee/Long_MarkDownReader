param([Parameter(Mandatory=$true)][string]$ProductDirectory,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') { throw 'Only a disposable GitHub-hosted Windows runner may launch this real IPC audit' }
$product=(Resolve-Path -LiteralPath $ProductDirectory).Path
$orchestration=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$expectedCommit='c70735c7064d9e8f30f1bfae98acee634ba040d8'
if ((& git -C $product rev-parse HEAD).Trim() -ne $expectedCommit) { throw 'Frozen product source differs' }
if ((& git -C $product status --porcelain --untracked-files=no)) { throw 'Frozen product source is dirty' }
$output=[IO.Path]::GetFullPath($OutputDirectory)
$expectedOutput=Join-Path $env:GITHUB_WORKSPACE 'native-search-evidence'
if ($output -ne [IO.Path]::GetFullPath($expectedOutput) -or (Test-Path -LiteralPath $output)) { throw 'Evidence must be a fresh fixed output directory' }
if (Get-NetTCPConnection -LocalPort 14200,9458 -State Listen -ErrorAction SilentlyContinue) { throw 'Audit ports must be free' }
New-Item -ItemType Directory -Path $output | Out-Null
if($env:LONGEDIT_NATIVE_PROGRAM_RECEIPT){Copy-Item -LiteralPath $env:LONGEDIT_NATIVE_PROGRAM_RECEIPT -Destination (Join-Path $output 'program-build-receipt.json')}
$auditRoot=Join-Path $env:RUNNER_TEMP ('longedit-v118-native-'+[Guid]::NewGuid().ToString('N'))
$driver=Join-Path $orchestration 'scripts\capture-v118-native-search.mjs'
& node $driver fixture $auditRoot $product $output
if ($LASTEXITCODE -ne 0) { throw 'Exclusive generated fixture failed' }
$fixture=Get-Content -LiteralPath (Join-Path $auditRoot 'fixture.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$env:LONGEDIT_E2E_LIBRARY=$fixture.library
$env:LONGEDIT_E2E_CONFIG_DIR=$fixture.config
$env:LONGEDIT_E2E_THEME='white'
$env:LONGEDIT_E2E_STYLE='minimal'
$env:LONGEDIT_E2E_MOTION='calm'
$env:WEBVIEW2_USER_DATA_FOLDER=$fixture.webview
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9458 --remote-allow-origins=http://127.0.0.1:9458'
$env:LONGEDIT_NATIVE_PRODUCT_COMMIT=$expectedCommit
$env:LONGEDIT_NATIVE_EXECUTABLE=Join-Path $product 'src-tauri\target\debug\tauri-app.exe'
$node=(Get-Command node.exe).Source
. (Join-Path $PSScriptRoot 'lib\v118-webview-test-policy.ps1')
$vite=$null; $app=$null
try {
  Enable-V118WebViewTestPolicy $fixture.webview
  $policyPlan=@(Get-V118WebViewPolicyPlan $fixture.webview)
  foreach($entry in $policyPlan){if((Get-Item -LiteralPath $entry.key).GetValue($entry.name) -cne $entry.value){throw 'Dedicated debugger configuration was not retained'}}
  @{schemaVersion=1;elevated=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);entries=$policyPlan;scope='exact-test-host-values-on-disposable-hosted-runner';sourceUserContentIncluded=$false} | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 -LiteralPath (Join-Path $output 'debugger-configuration.json')
  # Direct Node invocation avoids npm/PowerShell argument forwarding differences.
  $vite=Start-Process -FilePath $node -ArgumentList 'node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','14200','--strictPort' -WorkingDirectory $product -WindowStyle Hidden -RedirectStandardOutput (Join-Path $output 'vite.stdout.log') -RedirectStandardError (Join-Path $output 'vite.stderr.log') -PassThru
  $ready=$false
  for($n=0;$n -lt 150;$n++){try{$response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:14200/' -TimeoutSec 2;if($response.StatusCode -eq 200){$ready=$true;break}}catch{};Start-Sleep -Milliseconds 200}
  if(-not $ready){throw 'Product dev server did not become ready'}
  foreach($phase in @('baseline','disk')){
    # --minimized prevents the product setup from requesting focus. The hosted
    # E2E config can show its own test window so WebView2 initializes normally.
    $app=Start-Process -FilePath $env:LONGEDIT_NATIVE_EXECUTABLE -ArgumentList '--minimized' -WorkingDirectory (Join-Path $product 'src-tauri') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $output "$phase.stdout.log") -RedirectStandardError (Join-Path $output "$phase.stderr.log") -PassThru
    try { & node $driver $phase $auditRoot $product $output; if($LASTEXITCODE -ne 0){throw "Real IPC $phase failed"} }
    catch {
      $app.Refresh()
      $diagnostic=@{phase=$phase;pid=$app.Id;hasExited=$app.HasExited;sessionId=$app.SessionId;debugPortListening=[bool](Get-NetTCPConnection -LocalPort 9458 -State Listen -ErrorAction SilentlyContinue)}
      $diagnostic.webviewProcesses=@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Select-Object ProcessId,ParentProcessId,CommandLine)
      $diagnostic.runtimeVersions=@('HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}','HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}','HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') | ForEach-Object {Get-ItemPropertyValue -LiteralPath $_ -Name pv -ErrorAction SilentlyContinue}
      if($app.HasExited){$diagnostic.exitCode=$app.ExitCode}else{$diagnostic.windowHandle=$app.MainWindowHandle.ToInt64();$diagnostic.workingSet64=$app.WorkingSet64}
      $diagnostic | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 -LiteralPath (Join-Path $output "$phase-process-diagnostic.json")
      throw
    }
    finally { if($app -and -not $app.HasExited){Stop-Process -Id $app.Id -Force};$app=$null }
    for($n=0;$n -lt 150;$n++){if(-not(Get-NetTCPConnection -LocalPort 9458 -State Listen -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 100}
    if(Get-NetTCPConnection -LocalPort 9458 -State Listen -ErrorAction SilentlyContinue){throw 'Owned WebView process did not close before restart'}
  }
} finally {
  if($app -and -not $app.HasExited){Stop-Process -Id $app.Id -Force}
  if($vite -and -not $vite.HasExited){Stop-Process -Id $vite.Id -Force}
  Disable-V118WebViewTestPolicy
  # Leave only self-generated fixture data to the disposable runner cleanup.
  # Never enumerate or kill arbitrary port owners, or delete a user directory.
}
