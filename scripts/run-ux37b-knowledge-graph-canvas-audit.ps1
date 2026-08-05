param(
  [string]$OutputDirectory = "docs\evidence\ux37b-knowledge-graph-canvas"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux37b-knowledge-graph-canvas"))
if ($output -ne $expectedOutput) { throw "UX-37B audit output must remain inside $expectedOutput" }

$appPort = 14200
$cdpPort = 14380
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) {
  throw "UX-37B desktop audit requires free local ports $appPort and $cdpPort"
}

$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve the source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-ux37b-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null

$fixtures = [ordered]@{
  "Product.md" = "# Product`n`n[[Research]] [[Roadmap]] [[Architecture]]`n"
  "Research.md" = "# Research`n`n[[Product]] [[Evidence]]`n"
  "Roadmap.md" = "# Roadmap`n`n[[Product]] [[Release]]`n"
  "Architecture.md" = "# Architecture`n`n[[Product]] [[Evidence]]`n"
  "Evidence.md" = "# Evidence`n`n[[Research]] [[Architecture]] [[Release]]`n"
  "Release.md" = "# Release`n`n[[Roadmap]] [[Evidence]]`n"
}
$utf8 = New-Object Text.UTF8Encoding($false)
foreach ($entry in $fixtures.GetEnumerator()) {
  [IO.File]::WriteAllText((Join-Path $library $entry.Key), $entry.Value, $utf8)
}
$before = @{}
Get-ChildItem -LiteralPath $library -Filter *.md | ForEach-Object { $before[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }

$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" `
  -WorkingDirectory $workspace -WindowStyle Hidden `
  -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru

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
    -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort -Port $cdpPort -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_UX37B_APP_ORIGIN = "http://127.0.0.1:$appPort"
    $env:LONGEDIT_UX37B_AUDIT_OUTPUT = $output
    $env:LONGEDIT_UX37B_SOURCE_COMMIT = $sourceCommit
    & node (Join-Path $workspace "scripts\capture-ux37b-knowledge-graph-canvas.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-37B desktop audit capture failed" }

    $sourceFilesUnchanged = $true
    Get-ChildItem -LiteralPath $library -Filter *.md | ForEach-Object {
      if (-not $before.ContainsKey($_.Name) -or $before[$_.Name] -ne (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash) {
        $sourceFilesUnchanged = $false
      }
    }
    $evidencePath = Join-Path $output "interaction-evidence.json"
    $manifestPath = Join-Path $output "manifest.json"
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName sourceFilesUnchanged -NotePropertyValue $sourceFilesUnchanged -Force
    [IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifest.evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    if (-not $sourceFilesUnchanged) { throw "Knowledge graph interaction changed a source fixture" }
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

Write-Output "UX-37B knowledge graph canvas audit completed: $output"
