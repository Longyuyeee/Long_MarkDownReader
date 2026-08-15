param([switch]$Refresh)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $workspace "docs\evidence\p1b4d-pdf-watermark"
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\p1b4d-pdf-watermark"))
if ([IO.Path]::GetFullPath($output) -ne $expectedOutput) { throw "P1-B4D evidence path mismatch" }
if (Test-Path -LiteralPath $output) {
  if (-not $Refresh) { throw "P1-B4D accepted evidence already exists; pass -Refresh to replace it" }
  Remove-Item -LiteralPath $output -Recurse -Force
}

$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }
$appPort = 14200
$cdpPort = 14520
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "P1-B4D requires free ports $appPort and $cdpPort" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "P1-B4D custom-protocol build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-p1b4d-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $library "P1B4D Watermark Evidence.pdf"
$python = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (-not (Test-Path -LiteralPath $python)) { throw "P1-B4D Python runtime is unavailable" }
& $python (Join-Path $workspace "scripts\create-p1b4d-pdf-watermark-fixture.py") $source
if ($LASTEXITCODE -ne 0) { throw "P1-B4D fixture generation failed" }
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash

function Wait-Port([int]$Port,[bool]$Listening) {
  for ($index=0;$index -lt 300;$index++) {
    $found=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $found)-or(-not $Listening -and -not $found)){return}
    Start-Sleep -Milliseconds 100
  }
  throw "Port wait failed: $Port"
}

try {
  $viteOut=Join-Path $auditRoot "vite.stdout.log"
  $viteErr=Join-Path $auditRoot "vite.stderr.log"
  $vite=Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
  Wait-Port $appPort $true
  $env:LONGEDIT_E2E_LIBRARY=$library
  $env:LONGEDIT_E2E_THEME="white"
  $env:LONGEDIT_E2E_STYLE="minimal"
  $env:LONGEDIT_E2E_MOTION="reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER=$webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  try {
    $app=Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_P1B4D_OUTPUT=$output
    $env:LONGEDIT_P1B4D_LIBRARY=$library
    $env:LONGEDIT_P1B4D_SOURCE=$source
    $env:LONGEDIT_P1B4D_SOURCE_COMMIT=$sourceCommit
    & node (Join-Path $workspace "scripts\capture-p1b4d-pdf-watermark-evidence.mjs")
    if ($LASTEXITCODE -ne 0) { throw "P1-B4D desktop capture failed" }
    $targetFile = Get-ChildItem -LiteralPath $library -Filter "*.pdf" | Where-Object { $_.FullName -ne $source } | Select-Object -First 1
    if (-not $targetFile) { throw "P1-B4D target PDF was not created" }
    $target = $targetFile.FullName
    if ($sourceHash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) { throw "P1-B4D source fixture changed" }

    $popplerRoot="C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin"
    $pdftoppm=Join-Path $popplerRoot "pdftoppm.exe"
    if (-not (Test-Path -LiteralPath $pdftoppm)) { throw "P1-B4D Poppler renderer is unavailable" }
    & $pdftoppm -f 1 -l 1 -singlefile -png -r 144 $source (Join-Path $output "poppler-source-page-1")
    if ($LASTEXITCODE -ne 0) { throw "P1-B4D source Poppler render failed" }
    & $pdftoppm -f 1 -l 1 -singlefile -png -r 144 $target (Join-Path $output "poppler-target-page-1")
    if ($LASTEXITCODE -ne 0) { throw "P1-B4D target page 1 Poppler render failed" }
    & $pdftoppm -f 2 -l 2 -singlefile -png -r 144 $target (Join-Path $output "poppler-target-page-2")
    if ($LASTEXITCODE -ne 0) { throw "P1-B4D target page 2 Poppler render failed" }

    & $python (Join-Path $workspace "scripts\verify-p1b4d-pdf-watermark.py") $source $target (Join-Path $output "poppler-source-page-1.png") (Join-Path $output "poppler-target-page-1.png") (Join-Path $output "poppler-target-page-2.png") (Join-Path $output "independent-verification.json")
    if ($LASTEXITCODE -ne 0) { throw "P1-B4D independent verification failed" }
    & node (Join-Path $workspace "scripts\finalize-p1b4d-pdf-watermark-evidence.mjs") $output
    if ($LASTEXITCODE -ne 0) { throw "P1-B4D evidence manifest failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-Port $cdpPort $false
  }
} finally {
  if ($vite -and -not $vite.HasExited) { taskkill /PID $vite.Id /T /F 2>$null | Out-Null }
  Wait-Port $appPort $false
  $tempRoot=[IO.Path]::GetFullPath($env:TEMP)
  if ([IO.Path]::GetFullPath($auditRoot).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "P1-B4D PDF watermark audit completed: $output"
