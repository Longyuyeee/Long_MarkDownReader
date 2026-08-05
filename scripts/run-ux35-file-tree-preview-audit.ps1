param(
  [string]$OutputDirectory = "docs\evidence\ux35-file-tree-preview"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux35-file-tree-preview"))
if ($output -ne $expectedOutput) { throw "UX-35 audit output must remain inside $expectedOutput" }

$appPort = 14200
$cdpPort = 14350
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) {
  throw "UX-35 desktop audit requires free local ports $appPort and $cdpPort"
}

$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve the source commit" }

$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-ux35-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $workspace "README.md") -Destination (Join-Path $library "LongEdit UX35 README.md") -Force
Copy-Item -LiteralPath (Join-Path $workspace "src-tauri\tests\fixtures\canvas\valid.canvas") -Destination (Join-Path $library "LongEdit UX35 Canvas.canvas") -Force

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
  for ($attempt = 0; $attempt -lt 300; $attempt += 1) {
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
    $env:LONGEDIT_UX35_APP_ORIGIN = "http://127.0.0.1:$appPort"
    $env:LONGEDIT_UX35_AUDIT_OUTPUT = $output
    $env:LONGEDIT_UX35_SOURCE_COMMIT = $sourceCommit
    & node (Join-Path $workspace "scripts\capture-ux35-file-tree-preview.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-35 desktop audit capture failed" }
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

Write-Output "UX-35 file-tree detail preview audit completed: $output"
