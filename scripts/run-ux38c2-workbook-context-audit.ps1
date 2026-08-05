param([string]$OutputDirectory = "docs\evidence\ux38c2-workbook-context")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux38c2-workbook-context"))
if ($output -ne $expectedOutput) { throw "UX-38C2 output must remain inside $expectedOutput" }
$appPort = 14200
$cdpPort = 14411
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "UX-38C2 requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-ux38c2-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$xlsx = Join-Path $library "UX38C2 Workbook.xlsx"
$ods = Join-Path $library "UX38C2 Spreadsheet.ods"
$csv = Join-Path $library "UX38C2 Context.csv"
$tsv = Join-Path $library "UX38C2 Context.tsv"
Copy-Item -LiteralPath (Join-Path $workspace "src-tauri\tests\fixtures\workbook\compatibility-baseline.xlsx") -Destination $xlsx
Copy-Item -LiteralPath (Join-Path $workspace "src-tauri\tests\fixtures\odf-content\longedit-e1c-spreadsheet.ods") -Destination $ods
$utf8 = [Text.UTF8Encoding]::new($false)
$headers = "Identifier,Product,Region,Owner,Status,Priority,Quarter,Revenue,Cost,Notes,Updated,Reference"
$rows = 1..80 | ForEach-Object { "$_,LongEdit $_,Region $($_ % 5),Owner $($_ % 7),Active,$($_ % 3),Q$($_ % 4 + 1),$($_ * 125),$($_ * 48),UX38C2 row $_,2026-08-05,REF-$_" }
[IO.File]::WriteAllText($csv, (($headers + "`n" + ($rows -join "`n")) + "`n"), $utf8)
[IO.File]::WriteAllText($tsv, (($headers.Replace(',', "`t") + "`n" + (($rows | ForEach-Object { $_.Replace(',', "`t") }) -join "`n")) + "`n"), $utf8)
$before = @{ xlsx=(Get-FileHash -LiteralPath $xlsx -Algorithm SHA256).Hash; ods=(Get-FileHash -LiteralPath $ods -Algorithm SHA256).Hash; csv=(Get-FileHash -LiteralPath $csv -Algorithm SHA256).Hash; tsv=(Get-FileHash -LiteralPath $tsv -Algorithm SHA256).Hash }

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
    $env:LONGEDIT_UX38C2_AUDIT_OUTPUT = $output
    $env:LONGEDIT_UX38C2_SOURCE_COMMIT = $sourceCommit
    $env:LONGEDIT_UX38C2_XLSX = $xlsx
    $env:LONGEDIT_UX38C2_ODS = $ods
    $env:LONGEDIT_UX38C2_CSV = $csv
    $env:LONGEDIT_UX38C2_TSV = $tsv
    & node (Join-Path $workspace "scripts\capture-ux38c2-workbook-context.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-38C2 desktop capture failed" }
    $unchanged = $before.xlsx -eq (Get-FileHash -LiteralPath $xlsx -Algorithm SHA256).Hash -and $before.ods -eq (Get-FileHash -LiteralPath $ods -Algorithm SHA256).Hash -and $before.csv -eq (Get-FileHash -LiteralPath $csv -Algorithm SHA256).Hash -and $before.tsv -eq (Get-FileHash -LiteralPath $tsv -Algorithm SHA256).Hash
    $evidencePath = Join-Path $output "interaction-evidence.json"
    $manifestPath = Join-Path $output "manifest.json"
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName sourceFilesUnchanged -NotePropertyValue $unchanged -Force
    [IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifest.evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    if (-not $unchanged) { throw "UX-38C2 changed a source fixture" }
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
Write-Output "UX-38C2 workbook context audit completed: $output"
