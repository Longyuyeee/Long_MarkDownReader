param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v115-m1cb-ods-cell-edit'
$fixture = Join-Path $workspace 'src-tauri\tests\fixtures\odf-content\longedit-e1c-spreadsheet.ods'
$soffice = @((Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'), (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $soffice) { throw 'LibreOffice is required for M1C-B' }
$appPort = 14200; $cdpPort = 14530
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M1C-B requires free ports $appPort and $cdpPort" }
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null
if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'M1C-B production build failed' }
  $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.e2e.conf.json') -Raw
  & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw 'M1C-B Tauri build failed' }
}
$root = Join-Path $env:TEMP ("longedit-m1cb-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $root 'library'; $webview = Join-Path $root 'webview'; $loOut = Join-Path $root 'lo-output'; $loProfile = Join-Path $root 'lo-profile'
New-Item -ItemType Directory -Path $library,$webview,$loOut,$loProfile -Force | Out-Null
$source = Join-Path $library 'real-ods-source.ods'; $target = Join-Path $library 'm1cb-verified-copy.ods'; $bridge = Join-Path $root 'runtime-result.json'
Copy-Item -LiteralPath $fixture -Destination $source
$vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port',"$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
try {
  for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME='white'; $env:LONGEDIT_E2E_STYLE='minimal'; $env:LONGEDIT_E2E_MOTION='reduced'
  $env:WEBVIEW2_USER_DATA_FOLDER=$webview; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process (Join-Path $workspace 'src-tauri\target\debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  try {
    for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_M1CB_APP_ORIGIN="http://127.0.0.1:$appPort"; $env:LONGEDIT_M1CB_AUDIT_OUTPUT=$output
    $env:LONGEDIT_M1CB_SOURCE=$source; $env:LONGEDIT_M1CB_TARGET=$target; $env:LONGEDIT_M1CB_RESULT_BRIDGE=$bridge
    & node (Join-Path $workspace 'scripts\capture-post-v115-m1cb-ods-cell-edit.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'M1C-B desktop audit failed' }
  } finally { if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force } }

  $profileUri = ([uri]$loProfile).AbsoluteUri
  & $soffice "-env:UserInstallation=$profileUri" --headless --nologo --nodefault --nofirststartwizard --norestore --convert-to 'csv:Text - txt - csv (StarCalc)' --outdir $loOut $target | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'LibreOffice CSV reopen failed' }
  & $soffice "-env:UserInstallation=$profileUri" --headless --nologo --nodefault --nofirststartwizard --norestore --convert-to 'pdf:calc_pdf_Export' --outdir $loOut $target | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'LibreOffice PDF reopen failed' }
  $csv = Join-Path $loOut 'm1cb-verified-copy.csv'; $pdf = Join-Path $loOut 'm1cb-verified-copy.pdf'
  $csvText = Get-Content -LiteralPath $csv -Raw -Encoding UTF8
  $actualA1 = ($csvText -split "`r?`n")[0] -split ',' | Select-Object -First 1
  $actualA1 = $actualA1.Trim('"')
  if ($actualA1 -ne 'LongEdit M1C-B desktop value') { throw "LibreOffice A1 mismatch: $actualA1" }
  $runtime = Get-Content -LiteralPath $bridge -Raw | ConvertFrom-Json
  $evidence = [ordered]@{
    schemaVersion=1; stage='M1C-B-ODS-bounded-cell-value'; status='passed'; capturedAt=(Get-Date).ToUniversalTime().ToString('o')
    expected=[ordered]@{ editableTarget='Overview!A1'; value='LongEdit M1C-B desktop value'; sourceUnchanged=$true; undoRedo=$true; explicitCopySave=$true; libreOfficeIndependentReopen=$true; responsive960x720=$true; runtimeErrors=0 }
    actual=[ordered]@{ initialValue=$runtime.initialValue; uiReopenedValue=$runtime.uiReopenedValue; libreOfficeA1=$actualA1; sourceBeforeSha256=$runtime.sourceBeforeSha256; sourceAfterSha256=$runtime.sourceAfterSha256; targetSha256=$runtime.targetSha256; sourceUnchanged=($runtime.sourceBeforeSha256 -eq $runtime.sourceAfterSha256); undoRedo=$runtime.undoRedo; explicitCopySave=$runtime.explicitCopySave; responsive960x720=$runtime.responsive960x720; runtimeErrors=$runtime.runtimeErrors; libreOfficePdfBytes=(Get-Item $pdf).Length }
    differences=@('Before M1C-B, ODS was read-only in LongEdit; the same real fixture now supports a bounded A1 draft and verified new-copy save.', 'Formula B2, merged cells, repeated cells and complex text remain read-only by design.', 'The source package digest remains identical; only the new copy carries the edited value.')
    decision=[ordered]@{ stageAccepted=$true; nextStage='M1C-C-ODS-formula-and-style-feasibility'; odpRemainsReadOnly=$true; releaseCandidate=$false }
    privacy=[ordered]@{ projectAuthoredFixture=$true; localAbsolutePathsIncluded=$false; userDocumentBodiesIncluded=$false; rawOfficeOutputCommitted=$false }
    evidenceFiles=@('ods-cell-draft.jpg','ods-saved-copy-reopen.jpg')
  }
  [System.IO.File]::WriteAllText((Join-Path $output 'audit.json'), ($evidence | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process $vite.Id -Force }
  Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "M1C-B real desktop and LibreOffice audit completed: $output"
