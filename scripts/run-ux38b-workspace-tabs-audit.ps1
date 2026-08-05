param(
  [string]$OutputDirectory = "docs\evidence\ux38b-workspace-tabs"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux38b-workspace-tabs"))
if ($output -ne $expectedOutput) { throw "UX-38B output must remain inside $expectedOutput" }
$appPort = 14200
$cdpPort = 14400
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "UX-38B requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-ux38b-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$samples = @(
  @{ id="plain-text"; file="01-product-planning-handoff.txt"; content="UX38B text`n" },
  @{ id="javascript"; file="02-frontend-interaction-notes.js"; content="export const stage = 'UX38B'`n" },
  @{ id="typescript"; file="03-desktop-acceptance-automation.ts"; content="export const stage: string = 'UX38B'`n" },
  @{ id="python"; file="04-data-preparation-workflow.py"; content="stage = 'UX38B'`n" },
  @{ id="json"; file="05-release-capability-settings.json"; content="{ `"stage`": `"UX38B`" }`n" },
  @{ id="jsonc"; file="06-development-commented-config.jsonc"; content="{ // stage`n `"value`": `"UX38B`"`n}`n" },
  @{ id="yaml"; file="07-continuous-delivery-config.yaml"; content="stage: UX38B`n" },
  @{ id="xml"; file="08-document-exchange-structure.xml"; content="<audit stage=`"UX38B`"/>`n" },
  @{ id="toml"; file="09-desktop-application-config.toml"; content="stage = `"UX38B`"`n" },
  @{ id="log"; file="10-runtime-status-and-alerts.log"; content="2026-08-05T10:00:00Z INFO UX38B`n" },
  @{ id="web-source"; file="11-safe-web-preview-example.html"; content="<!doctype html><title>UX38B</title>`n" },
  @{ id="sql"; file="12-knowledge-index-query-example.sql"; content="SELECT 'UX38B' AS stage;`n" }
)
$sampleMap = @()
$before = @{}
foreach ($sample in $samples) {
  $filePath = Join-Path $library $sample.file
  [IO.File]::WriteAllText($filePath, $sample.content, $utf8)
  $before[$sample.file] = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
  $sampleMap += @{ id=$sample.id; path=$filePath; file=$sample.file }
}

$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
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
  Wait-ForPort -Port $appPort -Listening $true
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = "white"
  $env:LONGEDIT_E2E_STYLE = "minimal"
  $env:LONGEDIT_E2E_CODE_THEME = "github"
  $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort -Port $cdpPort -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_UX38B_AUDIT_OUTPUT = $output
    $env:LONGEDIT_UX38B_SOURCE_COMMIT = $sourceCommit
    $env:LONGEDIT_UX38B_SAMPLES = ($sampleMap | ConvertTo-Json -Compress)
    & node (Join-Path $workspace "scripts\capture-ux38b-workspace-tabs.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-38B desktop capture failed" }
    $unchanged = $true
    foreach ($sample in $samples) {
      $filePath = Join-Path $library $sample.file
      if ($before[$sample.file] -ne (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash) { $unchanged = $false }
    }
    $evidencePath = Join-Path $output "interaction-evidence.json"
    $manifestPath = Join-Path $output "manifest.json"
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName sourceFilesUnchanged -NotePropertyValue $unchanged -Force
    [IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifest.evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    if (-not $unchanged) { throw "UX-38B changed a source fixture" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort -Port $cdpPort -Listening $false
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "UX-38B workspace tab audit completed: $output"
