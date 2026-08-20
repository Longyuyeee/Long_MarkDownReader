$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $workspace "docs\evidence\p2b-image-color-adjustments"
$cdpPort = 14520
if (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "P2-B audit requires free CDP port $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-p2b-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $library "P2B Color Source.png"
$target = Join-Path $library "P2B Color Adjusted.png"
function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-","").ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(960,540,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(255,244,247,250))
  $graphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,30,92,132)),48,48,864,444)
  $graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,212,169,72)),120,105,210,210)
  $graphics.DrawString("LongEdit Color",[System.Drawing.Font]::new("Segoe UI",36,[System.Drawing.FontStyle]::Bold),[System.Drawing.Brushes]::White,380,190)
  $bitmap.Save($source,[System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
$sourceHash = Get-Sha256 $source
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
    $env:LONGEDIT_IMAGE_EDITOR_LIBRARY=$library
    $env:LONGEDIT_IMAGE_EDITOR_SOURCE=$source
    $env:LONGEDIT_IMAGE_EDITOR_TARGET=$target
    & node (Join-Path $workspace "scripts\capture-p2b-image-color-adjustments.mjs")
    if ($LASTEXITCODE -ne 0) { throw "P2-B desktop capture failed" }
    $actualSourceHash = Get-Sha256 $source
    if ($sourceHash -ne $actualSourceHash) { throw "P2-B source fixture changed" }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "P2-B output was not created" }
    $targetBitmap = [System.Drawing.Bitmap]::new($target)
    try {
      $sample = $targetBitmap.GetPixel(80,80)
      $independent = [ordered]@{
        schemaVersion = 1; stage = "P2-B"; status = "passed"
        expected = [ordered]@{ sourceUnchanged = $true; outputReopens = $true; sampleIsGrayscale = $true; dimensions = @(960,540) }
        actual = [ordered]@{ sourceUnchanged = ($sourceHash -eq $actualSourceHash); outputReopens = $true; sample = @($sample.R,$sample.G,$sample.B,$sample.A); sampleIsGrayscale = ($sample.R -eq $sample.G -and $sample.G -eq $sample.B); dimensions = @($targetBitmap.Width,$targetBitmap.Height) }
        sourceSha256 = $sourceHash; targetSha256 = Get-Sha256 $target; sourceUserContentIncluded = $false
      }
      if (-not $independent.actual.sampleIsGrayscale -or $targetBitmap.Width -ne 960 -or $targetBitmap.Height -ne 540) { throw "P2-B independent pixel verification failed" }
      $independent | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $output "independent-verification.json") -Encoding utf8
    } finally { $targetBitmap.Dispose() }
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
Write-Output "P2-B image color adjustment audit completed: $output"
