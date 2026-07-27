param(
  [string]$OutputDirectory = "docs\evidence\c3d-pptx-producer-visual"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\c3d-pptx-producer-visual"))
if ($output -ne $expectedOutput) { throw "C3D audit output must remain inside docs\evidence\c3d-pptx-producer-visual" }
$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "C3D desktop audit requires free local ports 9000 and 9333" }

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }
$auditRoot = Join-Path $env:TEMP ("longedit-c3d-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library -Force | Out-Null
New-Item -ItemType Directory -Path $webviewData -Force | Out-Null
New-Item -ItemType Directory -Path $output -Force | Out-Null

$fixtureRoot = Join-Path $workspace "fixtures\pptx\producers"
$fixtureMap = [ordered]@{
  POWERPOINT = "microsoft-powerpoint-16.pptx"
  WPS = "wps-presentation.pptx"
  LIBREOFFICE = "libreoffice-impress.pptx"
}
$auditFiles = @{}
foreach ($entry in $fixtureMap.GetEnumerator()) {
  $source = Join-Path $fixtureRoot $entry.Value
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "C3D fixture is missing: $source" }
  $destination = Join-Path $library $entry.Value
  Copy-Item -LiteralPath $source -Destination $destination -Force
  $auditFiles[$entry.Key] = $destination
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
    $env:LONGEDIT_C3D_POWERPOINT = $auditFiles.POWERPOINT
    $env:LONGEDIT_C3D_WPS = $auditFiles.WPS
    $env:LONGEDIT_C3D_LIBREOFFICE = $auditFiles.LIBREOFFICE
    $env:LONGEDIT_C3D_AUDIT_OUTPUT = $output
    & node (Join-Path $workspace "scripts\capture-c3d-pptx-producer-visual-audit.mjs")
    if ($LASTEXITCODE -ne 0) { throw "C3D desktop audit capture failed" }
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
Write-Output "C3D PPTX producer visual audit completed: $output"
