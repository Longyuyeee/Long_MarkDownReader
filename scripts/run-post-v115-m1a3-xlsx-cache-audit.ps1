param([string]$OutputDirectory = "docs\evidence\post-v115-m1a3-xlsx-cache")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v115-m1a3-xlsx-cache"))
if ($output -ne $expectedOutput) { throw "M1A3 output must remain inside $expectedOutput" }
$appPort = 14200
$cdpPort = 14414
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M1A3 requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
$policy = Get-Content -LiteralPath (Join-Path $workspace "shared\post-v115-m1a3-xlsx-cache-policy.json") -Raw | ConvertFrom-Json
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin xlsx-m1a2-fixture --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "M1A3 Rust build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-m1a3-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$files = @()
foreach ($tier in $policy.tiers) {
  $name = "M1A3-$($tier.cells)-cells.xlsx"
  $path = Join-Path $library $name
  & (Join-Path $workspace "src-tauri\target\debug\xlsx-m1a2-fixture.exe") $path $tier.rows $tier.columns
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $path)) { throw "Failed to generate $name" }
  $files += @{ name=$name; path=$path; cells=$tier.cells; rows=$tier.rows; columns=$tier.columns; baselineBottomPageMs=$tier.baselineBottomPageMs; maximumOpenMs=$tier.maximumOpenMs; maximumBottomPageMs=$tier.maximumBottomPageMs; minimumImprovementRatio=$policy.expected.largestTierMinimumImprovementRatio }
}
$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
function Wait-ForPort([int]$Port,[bool]$Listening) {
  for ($attempt = 0; $attempt -lt 400; $attempt += 1) {
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
    $env:LONGEDIT_M1A3_AUDIT_OUTPUT = $output
    $env:LONGEDIT_M1A3_SOURCE_COMMIT = $sourceCommit
    $env:LONGEDIT_M1A3_FILES = ($files | ConvertTo-Json -Compress)
    & node (Join-Path $workspace "scripts\capture-post-v115-m1a3-xlsx-cache.mjs")
    if ($LASTEXITCODE -ne 0) { throw "M1A3 desktop capture failed" }
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
Write-Output "M1A3 XLSX cache audit completed: $output"
