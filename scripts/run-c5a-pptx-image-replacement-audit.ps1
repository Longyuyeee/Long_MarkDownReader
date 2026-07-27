param(
  [string]$OutputDirectory = "docs\evidence\c5a-pptx-image-replacement"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\c5a-pptx-image-replacement"))
if ($output -ne $expectedOutput) { throw "C5A audit output must remain inside docs\evidence\c5a-pptx-image-replacement" }
$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "C5A desktop audit requires free local ports 9000 and 9333" }

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }
$auditRoot = Join-Path $env:TEMP ("longedit-c5a-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library, $webviewData, $output -Force | Out-Null
$source = Join-Path $workspace "fixtures\pptx\producers\wps-presentation.pptx"
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "C5A WPS fixture is missing: $source" }
$fixture = Join-Path $library "wps-presentation.pptx"
Copy-Item -LiteralPath $source -Destination $fixture -Force

Add-Type -AssemblyName System.Drawing
$png = Join-Path $auditRoot "c5a-replacement.png"
$jpeg = Join-Path $auditRoot "c5a-replacement.jpg"
$bitmap = [System.Drawing.Bitmap]::new(360, 220)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(34, 53, 88))
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(74, 222, 180))
  $font = [System.Drawing.Font]::new("Arial", 24, [System.Drawing.FontStyle]::Bold)
  try {
    $graphics.FillEllipse($brush, 24, 24, 172, 172)
    $graphics.DrawString("C5A", $font, [System.Drawing.Brushes]::White, 212, 72)
    $graphics.DrawString("LongEdit", [System.Drawing.Font]::new("Arial", 13), [System.Drawing.Brushes]::White, 212, 112)
    $bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Save($jpeg, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  }
  finally {
    $font.Dispose()
    $brush.Dispose()
  }
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "9000" `
  -WorkingDirectory $workspace `
  -WindowStyle Hidden `
  -RedirectStandardOutput $viteOut `
  -RedirectStandardError $viteErr `
  -PassThru
function Wait-ForPort([int]$Port, [bool]$Listening) {
  for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}
try {
  Wait-ForPort -Port 9000 -Listening $true
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = "white"
  $env:LONGEDIT_E2E_STYLE = "minimal"
  $env:LONGEDIT_E2E_CODE_THEME = "github"
  $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333 --remote-allow-origins=*"
  $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") `
    -WorkingDirectory (Join-Path $workspace "src-tauri") `
    -PassThru
  try {
    Wait-ForPort -Port 9333 -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9333"
    $env:LONGEDIT_C5A_WPS = $fixture
    $env:LONGEDIT_C5A_PNG = $png
    $env:LONGEDIT_C5A_JPEG = $jpeg
    $env:LONGEDIT_C5A_AUDIT_OUTPUT = $output
    & node (Join-Path $workspace "scripts\capture-c5a-pptx-image-replacement-audit.mjs")
    if ($LASTEXITCODE -ne 0) { throw "C5A desktop audit capture failed" }
    $artifactDirectory = Join-Path $workspace "fixtures\pptx\output-reopen"
    New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $library "wps-c5a-image-copy.pptx") `
      -Destination (Join-Path $artifactDirectory "c5a-image-copy.pptx") `
      -Force
  }
  finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort -Port 9333 -Listening $false
  }
}
finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $viteListener = Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue
  if ($viteListener) { Stop-Process -Id $viteListener.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Write-Output "C5A PPTX image replacement desktop audit completed: $output"
