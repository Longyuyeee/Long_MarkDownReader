param(
  [string]$OutputDirectory = "docs\evidence\ux38c-table-grid"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux38c-table-grid"))
if ($output -ne $expectedOutput) { throw "UX-38C output must remain inside $expectedOutput" }
$appPort = 14200
$cdpPort = 14410
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "UX-38C requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-ux38c-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$headers = "Identifier,Product,Region,Owner,Status,Priority,Quarter,Revenue,Cost,Notes"
$rows = 1..40 | ForEach-Object { "$_,LongEdit $_,Region $($_ % 5),Owner $($_ % 7),Active,$($_ % 3),Q$($_ % 4 + 1),$($_ * 125),$($_ * 48),UX38C row $_" }
$csv = Join-Path $library "UX38C Professional Grid.csv"
$tsv = Join-Path $library "UX38C Tabular Review.tsv"
[IO.File]::WriteAllText($csv, (($headers + "`n" + ($rows -join "`n")) + "`n"), $utf8)
[IO.File]::WriteAllText($tsv, (($headers.Replace(',', "`t") + "`n" + (($rows | ForEach-Object { $_.Replace(',', "`t") }) -join "`n")) + "`n"), $utf8)
$before = @{ csv=(Get-FileHash -LiteralPath $csv -Algorithm SHA256).Hash; tsv=(Get-FileHash -LiteralPath $tsv -Algorithm SHA256).Hash }

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
    $env:LONGEDIT_UX38C_AUDIT_OUTPUT = $output
    $env:LONGEDIT_UX38C_SOURCE_COMMIT = $sourceCommit
    $env:LONGEDIT_UX38C_CSV = $csv
    $env:LONGEDIT_UX38C_TSV = $tsv
    $env:LONGEDIT_UX38C_LIBRARY = $library
    & node (Join-Path $workspace "scripts\capture-ux38c-table-grid.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-38C desktop capture failed" }
    $unchanged = $before.csv -eq (Get-FileHash -LiteralPath $csv -Algorithm SHA256).Hash -and $before.tsv -eq (Get-FileHash -LiteralPath $tsv -Algorithm SHA256).Hash
    $evidencePath = Join-Path $output "interaction-evidence.json"
    $manifestPath = Join-Path $output "manifest.json"
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName sourceFilesUnchanged -NotePropertyValue $unchanged -Force
    [IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifest.evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    if (-not $unchanged) { throw "UX-38C changed a source fixture" }
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
Write-Output "UX-38C table grid audit completed: $output"
