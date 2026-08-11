param([string]$OutputDirectory = "docs\evidence\ux51-external-window-lifecycle")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expected = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux51-external-window-lifecycle"))
if ($output -ne $expected) { throw "UX-51 output must remain inside $expected" }
$appPort = 14200
$cdpPort = 14420
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "UX-51 requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }

$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$root = Join-Path $env:TEMP ("longedit-ux51-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $root "library"
$webviewData = Join-Path $root "webview"
$textFile = Join-Path $root "external notes.txt"
$jsonFile = Join-Path $root "external config.json"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
[IO.File]::WriteAllText($textFile, "EXTERNAL_WINDOW_TEXT_MARKER`r`nIndependent floating editor", [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($jsonFile, "{`n  `"marker`": `"EXTERNAL_WINDOW_JSON_MARKER`"`n}", [Text.UTF8Encoding]::new($false))
$viteOut = Join-Path $root "vite.stdout.log"
$viteErr = Join-Path $root "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru

function Wait-ForPort([int]$Port,[bool]$Listening) {
  for ($attempt = 0; $attempt -lt 300; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}

try {
  Wait-ForPort $appPort $true
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_SINGLE_INSTANCE = "1"
  $env:LONGEDIT_E2E_THEME = "white"
  $env:LONGEDIT_E2E_STYLE = "minimal"
  $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $executable = Join-Path $workspace "src-tauri\target\debug\tauri-app.exe"
  $app = Start-Process -FilePath $executable -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_EXTERNAL_WINDOW_EXECUTABLE = $executable
    $env:LONGEDIT_EXTERNAL_WINDOW_TEXT = $textFile
    $env:LONGEDIT_EXTERNAL_WINDOW_JSON = $jsonFile
    $env:LONGEDIT_EXTERNAL_WINDOW_OUTPUT = $output
    $env:LONGEDIT_EXTERNAL_WINDOW_SOURCE_COMMIT = $sourceCommit
    & node (Join-Path $workspace "scripts\capture-external-window-lifecycle.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-51 desktop capture failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort $cdpPort $false
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "UX-51 external-window lifecycle audit completed: $output"
