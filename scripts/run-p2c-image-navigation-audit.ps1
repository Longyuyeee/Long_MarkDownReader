$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $workspace "docs\evidence\p2c-image-navigation"
$cdpPort = 14521
if (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "P2-C audit requires free CDP port $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-p2c-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $library "P2C Large Navigation Source.png"
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(2400,1600,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(255,238,243,247))
  for ($x=0;$x -lt 2400;$x+=200) { $graphics.DrawLine([System.Drawing.Pens]::LightSteelBlue,$x,0,$x,1600) }
  for ($y=0;$y -lt 1600;$y+=200) { $graphics.DrawLine([System.Drawing.Pens]::LightSteelBlue,0,$y,2400,$y) }
  $graphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,24,84,118)),160,140,2080,1320)
  $graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,226,177,72)),260,260,520,520)
  $graphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,90,173,130)),1580,840,460,380)
  $graphics.DrawString("LongEdit Pan + Zoom",[System.Drawing.Font]::new("Segoe UI",74,[System.Drawing.FontStyle]::Bold),[System.Drawing.Brushes]::White,820,620)
  $bitmap.Save($source,[System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
function Wait-Port([int]$Port,[bool]$Listening) {
  for ($index=0;$index -lt 600;$index++) {
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
  $devServer = $null
  try {
    if (-not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue)) {
      $vite = Join-Path $workspace "node_modules\vite\bin\vite.js"
      $devServer = Start-Process -FilePath "node" -ArgumentList @($vite,"--host","127.0.0.1","--port","9000","--strictPort") -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
      Wait-Port 9000 $true
    }
    $app=Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_IMAGE_NAVIGATION_SOURCE=$source
    & node (Join-Path $workspace "scripts\capture-p2c-image-navigation.mjs")
    if ($LASTEXITCODE -ne 0) { throw "P2-C desktop capture failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-Port $cdpPort $false
    if ($devServer -and -not $devServer.HasExited) { Stop-Process -Id $devServer.Id -Force }
    if ($devServer) { Wait-Port 9000 $false }
  }
} finally {
  $tempRoot = [IO.Path]::GetFullPath($env:TEMP)
  if ([IO.Path]::GetFullPath($auditRoot).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "P2-C image navigation audit completed: $output"
