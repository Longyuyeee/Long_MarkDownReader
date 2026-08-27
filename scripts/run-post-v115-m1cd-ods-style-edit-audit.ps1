param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v115-m1cd-ods-style-edit'
$fixture = Join-Path $workspace 'src-tauri\tests\fixtures\odf-content\longedit-e1c-spreadsheet.ods'
$soffice = @((Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'), (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $soffice) { throw 'LibreOffice is required for M1C-D' }
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-ZipText([string]$Path, [string]$EntryName) {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $archive.GetEntry($EntryName)
    if (-not $entry) { throw "$Path is missing $EntryName" }
    $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally { $archive.Dispose() }
}

function Invoke-LibreOffice([string]$ProfilePath, [string[]]$Arguments) {
  New-Item -ItemType Directory -Path $ProfilePath -Force | Out-Null
  $profileUri = ([uri]$ProfilePath).AbsoluteUri
  $process = Start-Process -FilePath $soffice -WindowStyle Hidden -PassThru -ArgumentList (@(
    "-env:UserInstallation=$profileUri", '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore'
  ) + $Arguments)
  if (-not $process.WaitForExit(90000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw 'LibreOffice style reopen timed out after 90 seconds'
  }
  if ($process.ExitCode -ne 0) { throw "LibreOffice style reopen failed with exit code $($process.ExitCode)" }
}

$appPort = 14200; $cdpPort = 14531
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M1C-D requires free ports $appPort and $cdpPort" }
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null
if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'M1C-D production build failed' }
  $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.e2e.conf.json') -Raw
  & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw 'M1C-D Tauri build failed' }
}
$root = Join-Path $env:TEMP ("longedit-m1cd-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $root 'library'; $webview = Join-Path $root 'webview'; $loOut = Join-Path $root 'lo-output'; $loProfile = Join-Path $root 'lo-profile'
New-Item -ItemType Directory -Path $library,$webview,$loOut,$loProfile -Force | Out-Null
$source = Join-Path $library 'real-ods-style-source.ods'; $target = Join-Path $library 'm1cd-styled-copy.ods'; $bridge = Join-Path $root 'runtime-result.json'
Copy-Item -LiteralPath $fixture -Destination $source
$vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port',"$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
try {
  for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME='white'; $env:LONGEDIT_E2E_STYLE='minimal'; $env:LONGEDIT_E2E_MOTION='reduced'
  $env:WEBVIEW2_USER_DATA_FOLDER=$webview; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process (Join-Path $workspace 'src-tauri\target\debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  try {
    for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_M1CD_APP_ORIGIN="http://127.0.0.1:$appPort"; $env:LONGEDIT_M1CD_AUDIT_OUTPUT=$output
    $env:LONGEDIT_M1CD_SOURCE=$source; $env:LONGEDIT_M1CD_TARGET=$target; $env:LONGEDIT_M1CD_RESULT_BRIDGE=$bridge
    & node (Join-Path $workspace 'scripts\capture-post-v115-m1cd-ods-style-edit.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'M1C-D desktop audit failed' }
  } finally { if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force } }

  Invoke-LibreOffice $loProfile @('--convert-to', 'xlsx', '--outdir', $loOut, $target)
  $xlsx = Join-Path $loOut 'm1cd-styled-copy.xlsx'
  $sheet = [xml](Get-ZipText $xlsx 'xl/worksheets/sheet1.xml')
  $styles = [xml](Get-ZipText $xlsx 'xl/styles.xml')
  $a1 = $sheet.SelectSingleNode("//*[local-name()='c' and @r='A1']")
  if (-not $a1 -or $null -eq $a1.s) { throw 'LibreOffice output did not retain an A1 style index' }
  $formats = $styles.SelectNodes("//*[local-name()='cellXfs']/*[local-name()='xf']")
  $format = $formats[[int]$a1.s]
  $fills = $styles.SelectNodes("//*[local-name()='fills']/*[local-name()='fill']")
  $fonts = $styles.SelectNodes("//*[local-name()='fonts']/*[local-name()='font']")
  $fillColor = $fills[[int]$format.fillId].SelectSingleNode(".//*[local-name()='fgColor']").rgb
  $fontColor = $fonts[[int]$format.fontId].SelectSingleNode(".//*[local-name()='color']").rgb
  if ($fillColor -ne 'FFCCFFCC' -or $fontColor -ne 'FF006600') { throw "LibreOffice A1 style mismatch: $fillColor / $fontColor" }

  $runtime = Get-Content -LiteralPath $bridge -Raw | ConvertFrom-Json
  $evidence = [ordered]@{
    schemaVersion=1; stage='M1C-D-ODS-existing-named-style'; status='passed'; capturedAt=(Get-Date).ToUniversalTime().ToString('o')
    expected=[ordered]@{ target='Overview!A1'; initialStyle='Default'; savedStyle='Good'; sourceUnchanged=$true; undoRedo=$true; explicitCopySave=$true; libreOfficeFill='FFCCFFCC'; libreOfficeFont='FF006600'; responsive960x720=$true; runtimeErrors=0 }
    actual=[ordered]@{ initialStyle=$runtime.initialStyle; uiReopenedStyle=$runtime.uiReopenedStyle; uiBackgroundColor=$runtime.uiBackgroundColor; uiTextColor=$runtime.uiTextColor; libreOfficeFill=$fillColor; libreOfficeFont=$fontColor; sourceBeforeSha256=$runtime.sourceBeforeSha256; sourceAfterSha256=$runtime.sourceAfterSha256; targetSha256=$runtime.targetSha256; sourceUnchanged=($runtime.sourceBeforeSha256 -eq $runtime.sourceAfterSha256); undoRedo=$runtime.undoRedo; explicitCopySave=$runtime.explicitCopySave; responsive960x720=$runtime.responsive960x720; runtimeErrors=$runtime.runtimeErrors }
    differences=@('Before M1C-D, the real ODS exposed named styles only as an audit candidate and had no user style workflow.', 'The current desktop flow previews Good, supports undo/redo, saves a verified copy, and reopens with the same visual style.', 'LibreOffice independently exports the saved A1 style as FFCCFFCC fill and FF006600 text while the source digest remains identical.', 'Formula editing, custom style creation, mixed value/style transactions, source overwrite, external ODS and ODP remain closed.')
    decision=[ordered]@{ stageAccepted=$true; m1cClosed=$true; nextStage='M1D-media-and-structured-text-selection-audit'; formulaEditingRemainsReadOnly=$true; customStyleCreation=$false; odpRemainsReadOnly=$true; releaseCandidate=$false }
    privacy=[ordered]@{ projectAuthoredFixture=$true; localAbsolutePathsIncluded=$false; userDocumentBodiesIncluded=$false; rawOfficeOutputCommitted=$false }
    evidenceFiles=@('ods-style-draft.jpg','ods-style-copy-reopen.jpg')
  }
  [System.IO.File]::WriteAllText((Join-Path $output 'audit.json'), ($evidence | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process $vite.Id -Force }
  Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "M1C-D real desktop and LibreOffice audit completed: $output"
