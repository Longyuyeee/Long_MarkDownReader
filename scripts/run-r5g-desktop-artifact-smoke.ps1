param(
  [string]$OutputDirectory = "docs\evidence\r5g-desktop-artifact-smoke",
  [switch]$SkipReleaseBuild
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\r5g-desktop-artifact-smoke"))
if ($output -ne $expectedOutput) { throw "R5G audit output must remain inside docs\evidence\r5g-desktop-artifact-smoke" }

$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9341 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "R5G desktop audit requires free local ports 9000 and 9341" }

if (-not $SkipReleaseBuild) {
  & npm.cmd run tauri -- build --no-bundle
  if ($LASTEXITCODE -ne 0) { throw "R5G current Release build failed" }
}

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "R5G current Debug build failed" }

$releaseExecutable = Join-Path $workspace "src-tauri\target\release\tauri-app.exe"
$debugExecutable = Join-Path $workspace "src-tauri\target\debug\tauri-app.exe"
if (-not (Test-Path -LiteralPath $releaseExecutable -PathType Leaf)) { throw "R5G Release executable is missing" }
if (-not (Test-Path -LiteralPath $debugExecutable -PathType Leaf)) { throw "R5G Debug executable is missing" }

$auditRoot = Join-Path $env:TEMP ("longedit-r5g-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library, $webviewData, $output -Force | Out-Null
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $library "r5g-notes.txt"), "R5G_TEXT_INITIAL`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "r5g-config.json"), "{`"marker`":`"R5G_JSON_INITIAL`"}`n", $utf8)

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
  for ($attempt = 0; $attempt -lt 240; $attempt += 1) {
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
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9341 --remote-allow-origins=*"
  $app = Start-Process -FilePath $debugExecutable `
    -WorkingDirectory (Join-Path $workspace "src-tauri") `
    -WindowStyle Hidden `
    -PassThru
  try {
    Wait-ForPort -Port 9341 -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9341"
    $env:LONGEDIT_R5G_LIBRARY = $library
    $env:LONGEDIT_R5G_OUTPUT = $output
    $env:LONGEDIT_R5G_DEBUG_EXECUTABLE = $debugExecutable
    $env:LONGEDIT_R5G_RELEASE_EXECUTABLE = $releaseExecutable
    & node (Join-Path $workspace "scripts\capture-r5g-desktop-artifact-smoke.mjs")
    if ($LASTEXITCODE -ne 0) { throw "R5G desktop artifact smoke capture failed" }
  }
  finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort -Port 9341 -Listening $false
  }
}
finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $viteListener = Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue
  if ($viteListener) { Stop-Process -Id $viteListener.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Output "R5G desktop artifact smoke completed: $output"
