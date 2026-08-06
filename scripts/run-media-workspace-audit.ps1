param([string]$OutputDirectory = "docs\evidence\ux43-media-workspace")
$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expected = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux43-media-workspace"))
if ($output -ne $expected) { throw "Media audit output must remain inside $expected" }
$appPort = 9000; $cdpPort = 14430
$existingVite = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
if (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "Media audit requires free CDP port $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-media-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"; $webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$image = Join-Path $library "UX43 Transparent Image.png"; $video = Join-Path $library "UX43 Video.webm"
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(960,540,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(235,19,92,126)),80,70,800,400)
  $graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245,246,196,83)),120,110,220,220)
  $graphics.DrawString("LongEdit Image",[System.Drawing.Font]::new("Segoe UI",42,[System.Drawing.FontStyle]::Bold),[System.Drawing.Brushes]::White,380,190)
  $bitmap.Save($image,[System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
$imageHash = (Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash
$vite = if ($existingVite) { $null } else { Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -PassThru }
function Wait-Port([int]$Port,[bool]$Listening) { for ($i=0;$i -lt 300;$i++) { $found=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue; if (($Listening -and $found)-or(-not $Listening -and -not $found)){return}; Start-Sleep -Milliseconds 100 }; throw "Port wait failed: $Port" }
try {
  Wait-Port $appPort $true
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME="white"; $env:LONGEDIT_E2E_STYLE="minimal"; $env:LONGEDIT_E2E_MOTION="reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER=$webviewData; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app=Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_MEDIA_OUTPUT=$output; $env:LONGEDIT_MEDIA_IMAGE=$image; $env:LONGEDIT_MEDIA_VIDEO=$video
    & node (Join-Path $workspace "scripts\capture-media-workspace.mjs")
    if ($LASTEXITCODE -ne 0) { throw "Media capture failed" }
    $imageUnchanged = $imageHash -eq (Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash
    if (-not $imageUnchanged) { throw "Image fixture changed during preview" }
    $evidencePath = Join-Path $output "runtime-evidence.json"
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName imageFixtureUnchanged -NotePropertyValue $imageUnchanged -Force
    [IO.File]::WriteAllText($evidencePath,(($evidence | ConvertTo-Json -Depth 10)+"`n"),[Text.UTF8Encoding]::new($false))
  } finally { if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }; Wait-Port $cdpPort $false }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  if (-not $existingVite) { $listener=Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue; if($listener){Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue} }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "UX-43 media workspace audit completed: $output"
