param([string]$OutputDirectory = "docs\evidence\post-v115-m1a4a-xlsx-conditional-editor")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v115-m1a4a-xlsx-conditional-editor"))
if ($output -ne $expectedOutput) { throw "M1A4A output must remain inside $expectedOutput" }
$appPort = 14200
$cdpPort = 14415
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M1A4A requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-m1a4a-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$source = Join-Path $workspace "src-tauri\tests\fixtures\workbook\compatibility-baseline.xlsx"
$xlsx = Join-Path $library "M1A4A Conditional Format.xlsx"
Copy-Item -LiteralPath $source -Destination $xlsx
function Get-Sha256Hex([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "") }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}
$sourceHash = Get-Sha256Hex $source
$targetBeforeHash = Get-Sha256Hex $xlsx
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
  $env:LONGEDIT_E2E_THEME = "obsidian"
  $env:LONGEDIT_E2E_STYLE = "sharp"
  $env:LONGEDIT_E2E_CODE_THEME = "github-dark"
  $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort -Port $cdpPort -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_M1A4A_AUDIT_OUTPUT = $output
    $env:LONGEDIT_M1A4A_SOURCE_COMMIT = $sourceCommit
    $env:LONGEDIT_M1A4A_XLSX = $xlsx
    & node (Join-Path $workspace "scripts\capture-post-v115-m1a4a-xlsx-conditional-editor.mjs")
    if ($LASTEXITCODE -ne 0) { throw "M1A4A desktop capture failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort -Port $cdpPort -Listening $false
  }
  $sourceUnchanged = $sourceHash -eq (Get-Sha256Hex $source)
  $targetChanged = $targetBeforeHash -ne (Get-Sha256Hex $xlsx)
  $evidencePath = Join-Path $output "interaction-evidence.json"
  $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
  $evidence.afterActual | Add-Member -NotePropertyName repositoryFixtureUnchanged -NotePropertyValue $sourceUnchanged -Force
  $evidence.afterActual | Add-Member -NotePropertyName temporaryTargetChanged -NotePropertyValue $targetChanged -Force
  $evidence.differenceResolved = $evidence.differenceResolved -and $sourceUnchanged -and $targetChanged
  $utf8 = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
  $manifestPath = Join-Path $output "manifest.json"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $manifest.status = if ($evidence.differenceResolved) { "accepted" } else { "rejected" }
  $manifest.evidenceSha256 = (Get-Sha256Hex $evidencePath).ToLowerInvariant()
  [IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 10) + "`n"), $utf8)
  if (-not $evidence.differenceResolved) { throw "M1A4A expected/actual difference was not resolved" }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "M1A4A XLSX conditional-format editor audit completed: $output"
