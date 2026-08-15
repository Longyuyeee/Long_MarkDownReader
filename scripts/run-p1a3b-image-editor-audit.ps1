$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $workspace "docs\evidence\p1a3b-image-editor"
if (Test-Path -LiteralPath (Join-Path $output "manifest.json")) { throw "P1-A3B accepted evidence already exists" }
$cdpPort = 14513
if (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "P1-A3B audit requires free CDP port $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-p1a3b-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $library "P1A3B Source Image.png"
$target = Join-Path $library "P1A3B Cropped Private Copy.jpg"
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(960,540,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(255,244,247,250))
  $graphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,30,92,132)),48,48,864,444)
  $graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,212,169,72)),120,105,210,210)
  $graphics.DrawString("LongEdit Crop + Privacy",[System.Drawing.Font]::new("Segoe UI",36,[System.Drawing.FontStyle]::Bold),[System.Drawing.Brushes]::White,350,190)
  $bitmap.Save($source,[System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
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
    $env:LONGEDIT_IMAGE_EDITOR_LIBRARY=$library
    $env:LONGEDIT_IMAGE_EDITOR_SOURCE=$source
    $env:LONGEDIT_IMAGE_EDITOR_TARGET=$target
    & node (Join-Path $workspace "scripts\capture-p1a3b-image-editor.mjs")
    if ($LASTEXITCODE -ne 0) { throw "P1-A3B capture failed" }
    if ($sourceHash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) { throw "P1-A3B source fixture changed" }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "P1-A3B output was not created" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-Port $cdpPort $false
  }
} finally {
  $tempRoot = [IO.Path]::GetFullPath($env:TEMP)
  if ([IO.Path]::GetFullPath($auditRoot).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "P1-A3B image editor audit completed: $output"
