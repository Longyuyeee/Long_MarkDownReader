param(
  [string]$OutputDirectory = "docs\evidence\ux33i-docx-hyperlink-desktop"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux33i-docx-hyperlink-desktop"))
if ($output -ne $expectedOutput) { throw "UX-33I audit output must remain inside $expectedOutput" }

$appPort = 14200
$cdpPort = 14330
$busyPorts = Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "UX-33I desktop audit requires free local ports $appPort and $cdpPort" }

$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve the source commit" }

$e2eTauriConfig = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
$env:TAURI_CONFIG = $e2eTauriConfig
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-ux33i-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null

$fixtureDefinitions = @(
  @{ id = "microsoft-word"; source = "fixtures\docx\hyperlinks\microsoft-word-hyperlinks.docx"; copy = "UX33I Microsoft Word Hyperlinks.docx" },
  @{ id = "wps-writer"; source = "fixtures\docx\hyperlinks\wps-writer-hyperlinks.docx"; copy = "UX33I WPS Writer Hyperlinks.docx" },
  @{ id = "libreoffice-writer"; source = "fixtures\docx\hyperlinks\libreoffice-writer-hyperlinks.docx"; copy = "UX33I LibreOffice Writer Hyperlinks.docx" }
)
$fixtures = @()
foreach ($definition in $fixtureDefinitions) {
  $source = Join-Path $workspace $definition.source
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "UX-33I fixture is missing: $source" }
  $copy = Join-Path $library $definition.copy
  Copy-Item -LiteralPath $source -Destination $copy -Force
  $fixtures += @{
    id = $definition.id
    source = $source
    path = $copy
    sourceSha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

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
    $env:LONGEDIT_UX33I_APP_ORIGIN = "http://127.0.0.1:$appPort"
    $env:LONGEDIT_UX33I_FIXTURES = ($fixtures | ConvertTo-Json -Compress)
    $env:LONGEDIT_UX33I_AUDIT_OUTPUT = $output
    $env:LONGEDIT_UX33I_SOURCE_COMMIT = $sourceCommit
    & node (Join-Path $workspace "scripts\capture-ux33i-docx-hyperlink-desktop-audit.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-33I desktop audit capture failed" }
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

Write-Output "UX-33I DOCX hyperlink desktop audit completed: $output"
