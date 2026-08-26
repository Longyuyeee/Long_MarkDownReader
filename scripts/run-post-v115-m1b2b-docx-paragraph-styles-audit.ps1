param([switch]$SkipBuild)
$ErrorActionPreference = "Stop"
function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $workspace "docs\evidence\post-v115-m1b2b-docx-paragraph-styles"
$appPort = 14200
$cdpPort = 14530
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M1B2B requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null
if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "M1B2B production build failed" }
  $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
  & cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw "M1B2B Tauri build failed" }
}
$root = Join-Path $env:TEMP ("longedit-m1b2b-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $root "library"
$webview = Join-Path $root "webview"
New-Item -ItemType Directory -Path $library,$webview -Force | Out-Null
$definitions = @(
  @{ id="microsoft-word-16"; file="microsoft-word-16.docx" },
  @{ id="wps-writer"; file="wps-writer.docx" },
  @{ id="libreoffice-writer"; file="libreoffice-writer.docx" }
)
$fixtures = @()
foreach ($definition in $definitions) {
  $source = Join-Path $workspace ("fixtures\docx\producers\{0}" -f $definition.file)
  $target = Join-Path $library $definition.file
  Copy-Item -LiteralPath $source -Destination $target -Force
  $fixtures += @{ id=$definition.id; path=$target; sha256=(Get-Sha256 $source) }
}
$vite = Start-Process npm.cmd -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
try {
  for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME="white"; $env:LONGEDIT_E2E_STYLE="minimal"; $env:LONGEDIT_E2E_CODE_THEME="github"; $env:LONGEDIT_E2E_MOTION="reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER=$webview; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    for ($i=0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_M1B2B_APP_ORIGIN="http://127.0.0.1:$appPort"; $env:LONGEDIT_M1B2B_AUDIT_OUTPUT=$output; $env:LONGEDIT_M1B2B_FIXTURES=($fixtures|ConvertTo-Json -Compress); $env:LONGEDIT_M1B2B_SOURCE_COMMIT=$sourceCommit
    & node (Join-Path $workspace "scripts\capture-post-v115-m1b2b-docx-paragraph-styles.mjs")
    if ($LASTEXITCODE -ne 0) { throw "M1B2B desktop audit failed" }
  } finally { if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force } }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process $vite.Id -Force }
  Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "M1B2B DOCX paragraph style audit completed: $output"
