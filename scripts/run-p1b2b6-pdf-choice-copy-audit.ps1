param([switch]$Refresh)
$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml")
if ($LASTEXITCODE -ne 0) { throw "P1-B2B6 custom-protocol build failed" }
$output = Join-Path $workspace "docs\evidence\p1b2b6-pdf-choice-copy"
if (Test-Path -LiteralPath (Join-Path $output "manifest.json")) {
  if (-not $Refresh) { throw "P1-B2B6 accepted evidence already exists; pass -Refresh to replace generated evidence" }
  $expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\p1b2b6-pdf-choice-copy"))
  if ([IO.Path]::GetFullPath($output) -ne $expectedOutput) { throw "P1-B2B6 evidence path mismatch" }
  Remove-Item -LiteralPath $output -Recurse -Force
}
$appPort = 14200
$cdpPort = 14518
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "P1-B2B6 audit requires free ports $appPort and $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-p1b2b6-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $library "P1B2B6 Choice AcroForm.pdf"
& node (Join-Path $workspace "scripts\create-p1b2b6-pdf-choice-fixture.mjs") $source
if ($LASTEXITCODE -ne 0) { throw "P1-B2B6 fixture generation failed" }
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
function Wait-Port([int]$Port,[bool]$Listening) { for ($index=0;$index -lt 300;$index++) { $found=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue; if (($Listening -and $found)-or(-not $Listening -and -not $found)){return}; Start-Sleep -Milliseconds 100 }; throw "Port wait failed: $Port" }
try {
  $viteOut=Join-Path $auditRoot "vite.stdout.log"; $viteErr=Join-Path $auditRoot "vite.stderr.log"
  $vite=Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
  Wait-Port $appPort $true
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME="white"; $env:LONGEDIT_E2E_STYLE="minimal"; $env:LONGEDIT_E2E_MOTION="reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER=$webviewData; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  try {
    $app=Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_PDF_FORM_LIBRARY=$library; $env:LONGEDIT_PDF_FORM_SOURCE=$source
    & node (Join-Path $workspace "scripts\capture-p1b2b6-pdf-choice-copy.mjs")
    if ($LASTEXITCODE -ne 0) { throw "P1-B2B6 capture failed" }
    $target = Join-Path $library "P1B2B6 Choice AcroForm-form-filled.pdf"
    $poppler = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe"
    if (-not (Test-Path -LiteralPath $poppler)) { throw "P1-B2B6 Poppler renderer is unavailable" }
    & $poppler -f 1 -l 1 -singlefile -png -r 120 $source (Join-Path $output "choice-pdf-poppler-source")
    & $poppler -f 1 -l 1 -singlefile -png -r 120 $target (Join-Path $output "choice-pdf-poppler")
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $output "choice-pdf-poppler-source.png")) -or -not (Test-Path -LiteralPath (Join-Path $output "choice-pdf-poppler.png"))) { throw "P1-B2B6 Poppler render failed" }
    if ($sourceHash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) { throw "P1-B2B6 source fixture changed" }
  } finally { if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }; Wait-Port $cdpPort $false }
} finally {
  if ($vite -and -not $vite.HasExited) { taskkill /PID $vite.Id /T /F 2>$null | Out-Null }
  Wait-Port $appPort $false
  $tempRoot=[IO.Path]::GetFullPath($env:TEMP); if ([IO.Path]::GetFullPath($auditRoot).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "P1-B2B6 PDF choice copy audit completed: $output"
