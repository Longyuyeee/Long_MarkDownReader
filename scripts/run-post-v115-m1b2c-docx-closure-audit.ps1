param([switch]$SkipBuild)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $workspace "docs\evidence\post-v115-m1b2c-docx-closure"
$appPort = 14200
$cdpPort = 14540
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M1B2C requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null

if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "M1B2C production build failed" }
  $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
  & cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw "M1B2C Tauri build failed" }
}

$root = Join-Path $env:TEMP ("longedit-m1b2c-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$longedit = Join-Path $root "longedit-output"
$roundtrip = Join-Path $root "native-roundtrip"
$m1b2bEvidence = Join-Path $root "m1b2b-evidence"
$webview = Join-Path $root "webview"
New-Item -ItemType Directory -Path $longedit,$roundtrip,$m1b2bEvidence,$webview -Force | Out-Null

function Wait-ForPort([int]$Port, [bool]$Listening) {
  for ($attempt = 0; $attempt -lt 300; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}

try {
  $env:LONGEDIT_M1B2B_ARTIFACT_OUTPUT = $longedit
  $m1b2bPassed = $false
  for ($attempt = 1; $attempt -le 2 -and -not $m1b2bPassed; $attempt += 1) {
    try {
      & (Join-Path $workspace "scripts\run-post-v115-m1b2b-docx-paragraph-styles-audit.ps1") -SkipBuild -AuditOutput $m1b2bEvidence
      $m1b2bPassed = $true
    }
    catch {
      if ($attempt -eq 2) { throw "M1B2C could not generate three LongEdit DOCX outputs after two desktop attempts: $($_.Exception.Message)" }
      Start-Sleep -Seconds 2
    }
  }
  Remove-Item Env:LONGEDIT_M1B2B_ARTIFACT_OUTPUT -ErrorAction SilentlyContinue

  try {
    & (Join-Path $workspace "scripts\verify-post-v115-m1b2c-docx-producer-roundtrip.ps1") `
      -InputDirectory $longedit `
      -OutputDirectory $roundtrip `
      -ReportPath (Join-Path $output "native-roundtrip.json") `
      -RequireComplete
  }
  catch {
    throw "M1B2C native producer matrix failed at $($_.InvocationInfo.PositionMessage); stack: $($_.ScriptStackTrace); message: $($_.Exception.Message)"
  }
  if ($LASTEXITCODE -ne 0) { throw "M1B2C native producer matrix failed" }

  $native = [IO.File]::ReadAllText((Join-Path $output "native-roundtrip.json"), [Text.Encoding]::UTF8) | ConvertFrom-Json
  $styleIds = @{ "microsoft-word-16"="ab"; "wps-writer"="1"; "libreoffice-writer"="BodyText" }
  $files = @()
  foreach ($producer in $native.producers) {
    foreach ($file in $producer.files) {
      $expectedStyleId = $styleIds[$file.sourceId]
      if ($producer.id -eq "libreoffice-writer") {
        if ($file.sourceId -eq "microsoft-word-16") { $expectedStyleId = "IntenseQuote" }
        elseif ($file.sourceId -eq "wps-writer") { $expectedStyleId = "Normal" }
      }
      $files += [ordered]@{
        producerId = $producer.id
        sourceId = $file.sourceId
        path = Join-Path (Join-Path $roundtrip $producer.id) $file.file
        sha256 = $file.sha256
        expectedHeading = $file.expectedHeading
        expectedStyleId = $expectedStyleId
      }
    }
  }
  if ($files.Count -ne 9) { throw "M1B2C reverse-read input count is not 9" }

  $vite = Start-Process npm.cmd -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort $appPort $true
    $env:LONGEDIT_E2E_LIBRARY=$roundtrip; $env:LONGEDIT_E2E_THEME="white"; $env:LONGEDIT_E2E_STYLE="minimal"; $env:LONGEDIT_E2E_CODE_THEME="github"; $env:LONGEDIT_E2E_MOTION="reduced"
    $env:WEBVIEW2_USER_DATA_FOLDER=$webview; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
    $app = Start-Process (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
    try {
      Wait-ForPort $cdpPort $true
      $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"
      $env:LONGEDIT_M1B2C_APP_ORIGIN="http://127.0.0.1:$appPort"
      $env:LONGEDIT_M1B2C_AUDIT_OUTPUT=$output
      $env:LONGEDIT_M1B2C_FILES=($files | ConvertTo-Json -Compress -Depth 6)
      $env:LONGEDIT_M1B2C_SOURCE_COMMIT=$sourceCommit
      & node (Join-Path $workspace "scripts\capture-post-v115-m1b2c-docx-reverse-read.mjs")
      if ($LASTEXITCODE -ne 0) { throw "M1B2C LongEdit reverse-read failed" }
    }
    finally {
      if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
      Wait-ForPort $cdpPort $false
    }
  }
  finally {
    if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
    Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }

  & node (Join-Path $workspace "scripts\check-post-v115-m1b2c-docx-closure.mjs")
  if ($LASTEXITCODE -ne 0) { throw "M1B2C evidence gate failed" }
}
finally {
  Remove-Item Env:LONGEDIT_M1B2B_ARTIFACT_OUTPUT -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "M1B2C DOCX closure audit completed: $output"
