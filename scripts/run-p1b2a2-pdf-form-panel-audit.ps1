$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $workspace "docs\evidence\p1b2a2-pdf-form-panel"
if (Test-Path -LiteralPath (Join-Path $output "manifest.json")) { throw "P1-B2A2 accepted evidence already exists" }
$cdpPort = 14514
if (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "P1-B2A2 audit requires free CDP port $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-p1b2a2-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $library "P1B2A2 AcroForm.pdf"
& node (Join-Path $workspace "scripts\create-p1b2a2-pdf-form-fixture.mjs") $source
if ($LASTEXITCODE -ne 0) { throw "P1-B2A2 fixture generation failed" }
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
function Wait-Port([int]$Port,[bool]$Listening) {
  for ($index=0;$index -lt 300;$index++) {
    $found = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $found) -or (-not $Listening -and -not $found)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Port wait failed: $Port"
}
try {
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
    $env:LONGEDIT_PDF_FORM_LIBRARY=$library
    $env:LONGEDIT_PDF_FORM_SOURCE=$source
    & node (Join-Path $workspace "scripts\capture-p1b2a2-pdf-form-panel.mjs")
    if ($LASTEXITCODE -ne 0) { throw "P1-B2A2 capture failed" }
    if ($sourceHash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) { throw "P1-B2A2 source fixture changed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-Port $cdpPort $false
  }
} finally {
  $tempRoot = [IO.Path]::GetFullPath($env:TEMP)
  if ([IO.Path]::GetFullPath($auditRoot).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "P1-B2A2 PDF form panel audit completed: $output"
