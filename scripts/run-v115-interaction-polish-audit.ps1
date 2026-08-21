param([string]$OutputDirectory = "docs\evidence\v115-interaction-polish")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\v115-interaction-polish"))
if ($output -ne $expectedOutput) { throw "v1.0.15 output must remain inside $expectedOutput" }
$appPort = 14315
$cdpPort = 14515
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "v1.0.15 audit requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }
$cargoTarget = if ($env:CARGO_TARGET_DIR) { [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR) } else { Join-Path $workspace "src-tauri\target" }
$appExecutable = Join-Path $cargoTarget "debug\tauri-app.exe"
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }
if (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) { throw "Tauri executable was not produced at $appExecutable" }

$auditRoot = Join-Path $env:TEMP ("longedit-v115-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$samples = @(
  @{ file="01-v115-tooltip-audit.txt"; content="v1.0.15 tooltip audit`n" },
  @{ file="02-v115-context-policy.json"; content="{ `"stage`": `"v1.0.15`" }`n" },
  @{ file="03-v115-dialog-policy.yaml"; content="stage: v1.0.15`n" }
)
$sampleMap = foreach ($sample in $samples) { $filePath = Join-Path $library $sample.file; [IO.File]::WriteAllText($filePath, $sample.content, $utf8); @{ path=$filePath; file=$sample.file } }
$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
function Wait-ForPort([int]$Port,[bool]$Listening) { for ($attempt = 0; $attempt -lt 300; $attempt += 1) { $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue; if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }; Start-Sleep -Milliseconds 100 }; throw "Timed out waiting for port $Port listening=$Listening" }
try {
  Wait-ForPort -Port $appPort -Listening $true
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = "white"
  $env:LONGEDIT_E2E_STYLE = "minimal"
  $env:LONGEDIT_E2E_CODE_THEME = "github"
  $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process -FilePath $appExecutable -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort -Port $cdpPort -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_V115_AUDIT_OUTPUT = $output
    $env:LONGEDIT_V115_SOURCE_COMMIT = $sourceCommit
    $env:LONGEDIT_V115_SAMPLES = ($sampleMap | ConvertTo-Json -Compress)
    & node (Join-Path $workspace "scripts\capture-v115-interaction-polish.mjs")
    if ($LASTEXITCODE -ne 0) { throw "v1.0.15 desktop capture failed" }
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
Write-Output "v1.0.15 interaction polish audit completed: $output"
