param(
  [string]$OutputDirectory = "docs\evidence\b2c-pdf-insert"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\b2c-pdf-insert"))
if ($output -ne $expectedOutput) { throw "B2C audit output must remain inside docs\evidence\b2c-pdf-insert" }
$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "B2C desktop audit requires free local ports 9000 and 9333" }

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }
$auditRoot = Join-Path $env:TEMP ("longedit-b2c-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library, $webviewData, $output -Force | Out-Null
$indexCommandSource = [System.IO.File]::ReadAllText((Join-Path $workspace "src-tauri\src\commands\index.rs"))
$pdfFixtureMatch = [regex]::Match($indexCommandSource, 'const TWO_PAGE_PDF: &str = "([^"]+)";')
if (-not $pdfFixtureMatch.Success) { throw "Unable to locate the versioned two-page PDF fixture" }
$base = Join-Path $library "B2C Base.pdf"
$source = Join-Path $library "B2C Source.pdf"
$fixtureBytes = [Convert]::FromBase64String($pdfFixtureMatch.Groups[1].Value)
[System.IO.File]::WriteAllBytes($base, $fixtureBytes)
$latin1 = [System.Text.Encoding]::GetEncoding(28591)
$sourceContent = $latin1.GetString($fixtureBytes)
$sourceContent = $sourceContent.Replace("Knowledge Graph Alpha", "Inserted Source Gamma")
[System.IO.File]::WriteAllBytes($source, $latin1.GetBytes($sourceContent))

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
    -WindowStyle Hidden `
    -PassThru
  try {
    Wait-ForPort -Port 9333 -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9333"
    $env:LONGEDIT_B2C_BASE_PDF = $base
    $env:LONGEDIT_B2C_SOURCE_PDF = $source
    $env:LONGEDIT_B2C_AUDIT_OUTPUT = $output
    & node (Join-Path $workspace "scripts\capture-b2c-pdf-insert-audit.mjs")
    if ($LASTEXITCODE -ne 0) { throw "B2C desktop audit capture failed" }
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
Write-Output "B2C PDF insert desktop audit completed: $output"
