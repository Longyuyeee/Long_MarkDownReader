param(
  [string]$OutputDirectory = "docs\evidence\x3-b4-xlsx-array-conflict-desktop"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\x3-b4-xlsx-array-conflict-desktop"))
if ($output -ne $expectedOutput) { throw "X3-B4 audit output must remain inside $expectedOutput" }
$appPort = 14200
$cdpPort = 14320
$busyPorts = Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "X3-B4 desktop audit requires free local ports $appPort and $cdpPort" }

$e2eTauriConfig = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
$env:TAURI_CONFIG = $e2eTauriConfig
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-x3-b4-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-conflict-diagnostic.xlsx"
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "X3-B4 diagnostic fixture is missing: $source" }
$fixture = Join-Path $library "array-formula-conflict-diagnostic.xlsx"
Copy-Item -LiteralPath $source -Destination $fixture -Force

$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" `
  -WorkingDirectory $workspace `
  -WindowStyle Hidden `
  -RedirectStandardOutput $viteOut `
  -RedirectStandardError $viteErr `
  -PassThru

function Wait-ForPort([int]$Port,[bool]$Listening) {
  for ($attempt = 0; $attempt -lt 240; $attempt += 1) {
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
    $env:LONGEDIT_X3_B4_APP_ORIGIN = "http://127.0.0.1:$appPort"
    $env:LONGEDIT_X3_B4_FIXTURE = $fixture
    $env:LONGEDIT_X3_B4_SOURCE = $source
    $env:LONGEDIT_X3_B4_AUDIT_OUTPUT = $output
    & node (Join-Path $workspace "scripts\capture-x3-b4-array-conflict-desktop-audit.mjs")
    if ($LASTEXITCODE -ne 0) { throw "X3-B4 desktop audit capture failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort -Port $cdpPort -Listening $false
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $viteListener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($viteListener) { Stop-Process -Id $viteListener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "X3-B4 XLSX array conflict desktop audit completed: $output"
