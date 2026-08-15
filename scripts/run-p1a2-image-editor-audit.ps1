param([string]$OutputDirectory = "docs\evidence\p1a2-image-editor")
$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expected = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\p1a2-image-editor"))
if ($output -ne $expected) { throw "P1-A2 audit output must remain inside $expected" }
if (Test-Path -LiteralPath (Join-Path $output "manifest.json")) { throw "P1-A2 accepted evidence already exists; preserve it and choose a deliberate replacement workflow" }
$cdpPort = 14512
if (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "P1-A2 audit requires free CDP port $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-p1a2-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"; $webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $library "P1A2 Source Image.png"; $target = Join-Path $library "P1A2 Edited Copy.webp"
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(960,540,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(255,244,247,250))
  $graphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,30,92,132)),48,48,864,444)
  $graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,212,169,72)),92,105,210,210)
  $graphics.DrawString("LongEdit Image Editor",[System.Drawing.Font]::new("Segoe UI",38,[System.Drawing.FontStyle]::Bold),[System.Drawing.Brushes]::White,330,190)
  $graphics.DrawString("P1-A2 reliable copy",[System.Drawing.Font]::new("Segoe UI",22),[System.Drawing.Brushes]::White,405,255)
  $bitmap.Save($source,[System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
function Wait-Port([int]$Port,[bool]$Listening) { for ($i=0;$i -lt 300;$i++) { $found=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue; if (($Listening -and $found)-or(-not $Listening -and -not $found)){return}; Start-Sleep -Milliseconds 100 }; throw "Port wait failed: $Port" }
try {
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME="white"; $env:LONGEDIT_E2E_STYLE="minimal"; $env:LONGEDIT_E2E_MOTION="reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER=$webviewData; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app=Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_IMAGE_EDITOR_OUTPUT=$output; $env:LONGEDIT_IMAGE_EDITOR_LIBRARY=$library; $env:LONGEDIT_IMAGE_EDITOR_SOURCE=$source; $env:LONGEDIT_IMAGE_EDITOR_TARGET=$target
    & node (Join-Path $workspace "scripts\capture-p1a2-image-editor.mjs")
    if ($LASTEXITCODE -ne 0) { throw "P1-A2 image editor capture failed" }
    if ($sourceHash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) { throw "P1-A2 source fixture changed" }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "P1-A2 verified output was not created" }
  } finally { if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }; Wait-Port $cdpPort $false }
} finally {
  if ($auditRoot.StartsWith([IO.Path]::GetFullPath($env:TEMP),[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "P1-A2 image editor audit completed: $output"
