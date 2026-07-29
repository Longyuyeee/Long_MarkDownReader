param(
  [string]$OutputDirectory = "docs\evidence\e1b-odt-desktop"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\e1b-odt-desktop"))
if ($output -ne $expectedOutput) { throw "E1B audit output must remain inside docs\evidence\e1b-odt-desktop" }
$appPort = 14200
$cdpPort = 14300
$busyPorts = Get-NetTCPConnection -LocalPort $appPort, $cdpPort -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "E1B desktop audit requires free local ports $appPort and $cdpPort" }

$e2eTauriConfig = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
$env:TAURI_CONFIG = $e2eTauriConfig
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }
$auditRoot = Join-Path $env:TEMP ("longedit-e1b-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library, $webviewData, $output -Force | Out-Null

$fixtureRoot = Join-Path $workspace "fixtures\odt\producers"
$fixtureMap = [ordered]@{
  WORD = "microsoft-word-16.odt"
  LIBREOFFICE = "libreoffice-writer.odt"
}
$auditFiles = @{}
foreach ($entry in $fixtureMap.GetEnumerator()) {
  $source = Join-Path $fixtureRoot $entry.Value
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "E1B fixture is missing: $source" }
  $destination = Join-Path $library $entry.Value
  Copy-Item -LiteralPath $source -Destination $destination -Force
  $auditFiles[$entry.Key] = $destination
}
$wpsFixture = Join-Path $fixtureRoot "wps-writer.odt"
$wpsManifest = Join-Path $fixtureRoot "wps-writer.json"
if ((Test-Path -LiteralPath $wpsFixture -PathType Leaf) -xor (Test-Path -LiteralPath $wpsManifest -PathType Leaf)) {
  throw "E1B WPS fixture and manifest must either both exist or both remain absent"
}
if ((Test-Path -LiteralPath $wpsFixture -PathType Leaf) -and (Test-Path -LiteralPath $wpsManifest -PathType Leaf)) {
  $wpsEvidence = Get-Content -LiteralPath $wpsManifest -Raw | ConvertFrom-Json
  $wpsDigest = (Get-FileHash -LiteralPath $wpsFixture -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($wpsEvidence.schemaVersion -ne 1 `
    -or $wpsEvidence.stage -ne "E1B" `
    -or $wpsEvidence.id -ne "wps-writer" `
    -or $wpsEvidence.file -ne "wps-writer.odt" `
    -or $wpsEvidence.producer -ne "WPS Writer" `
    -or [string]::IsNullOrWhiteSpace([string]$wpsEvidence.productVersion) `
    -or $wpsEvidence.sourceFixture -ne "wps-writer.docx" `
    -or $wpsEvidence.expectedText -ne "WPS Writer Producer Fixture" `
    -or -not $wpsEvidence.nativeOdtSave `
    -or -not $wpsEvidence.sameProducerReopenVerified `
    -or -not $wpsEvidence.privacySanitized `
    -or $wpsEvidence.sha256 -ne $wpsDigest `
    -or [int64]$wpsEvidence.size -ne (Get-Item -LiteralPath $wpsFixture).Length) {
    throw "E1B WPS fixture manifest failed the producer evidence contract"
  }
  $wpsDestination = Join-Path $library "wps-writer.odt"
  Copy-Item -LiteralPath $wpsFixture -Destination $wpsDestination -Force
  $auditFiles.WPS = $wpsDestination
}

$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "$appPort" `
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
  Wait-ForPort -Port $appPort -Listening $true
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = "white"
  $env:LONGEDIT_E2E_STYLE = "minimal"
  $env:LONGEDIT_E2E_CODE_THEME = "github"
  $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") `
    -WorkingDirectory (Join-Path $workspace "src-tauri") `
    -WindowStyle Hidden `
    -PassThru
  try {
    Wait-ForPort -Port $cdpPort -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_E1B_APP_ORIGIN = "http://127.0.0.1:$appPort"
    $env:LONGEDIT_E1B_WORD = $auditFiles.WORD
    $env:LONGEDIT_E1B_LIBREOFFICE = $auditFiles.LIBREOFFICE
    $env:LONGEDIT_E1B_WPS = if ($auditFiles.ContainsKey("WPS")) { $auditFiles.WPS } else { "" }
    $env:LONGEDIT_E1B_AUDIT_OUTPUT = $output
    & node (Join-Path $workspace "scripts\capture-e1b-odt-desktop-audit.mjs")
    if ($LASTEXITCODE -ne 0) { throw "E1B desktop audit capture failed" }
  }
  finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort -Port $cdpPort -Listening $false
  }
}
finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $viteListener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($viteListener) { Stop-Process -Id $viteListener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "E1B ODT desktop audit completed: $output"
