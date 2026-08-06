param(
  [Parameter(Mandatory = $true)]
  [string]$SourceTable,
  [string]$OutputDirectory = "docs\evidence\ux42-table-board"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$source = (Resolve-Path $SourceTable).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux42-table-board"))
if ($output -ne $expectedOutput) { throw "UX-42 output must remain inside $expectedOutput" }
$appPort = 14200
$cdpPort = 14420
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "UX-42 requires free ports $appPort and $cdpPort" }

$auditRoot = Join-Path $env:TEMP ("longedit-ux42-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$fixture = Join-Path $library "UX42 Board Stress.table.json"
Copy-Item -LiteralPath $source -Destination $fixture
$sourceHashBefore = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$fixtureHashBefore = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash
$sourceSha = (Get-FileHash -LiteralPath (Join-Path $workspace "src\views\TableView.vue") -Algorithm SHA256).Hash.ToLowerInvariant()

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
    $env:LONGEDIT_UX42_OUTPUT = $output
    $env:LONGEDIT_UX42_TABLE = $fixture
    $env:LONGEDIT_UX42_SOURCE_SHA = $sourceSha
    & node (Join-Path $workspace "scripts\capture-ux42-table-board.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-42 desktop capture failed" }
    $sourceUnchanged = $sourceHashBefore -eq (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    $fixtureUnchanged = $fixtureHashBefore -eq (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash
    if (-not $sourceUnchanged -or -not $fixtureUnchanged) { throw "UX-42 changed a source or isolated fixture" }
    $evidencePath = Join-Path $output "interaction-evidence.json"
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName sourceFileUnchanged -NotePropertyValue $sourceUnchanged -Force
    $evidence | Add-Member -NotePropertyName isolatedFixtureUnchanged -NotePropertyValue $fixtureUnchanged -Force
    $utf8 = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
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
Write-Output "UX-42 Table board audit completed: $output"
