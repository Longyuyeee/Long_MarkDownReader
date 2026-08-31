param([string]$OutputDirectory = "docs\evidence\post-v119-m8-2-graph-usability")
$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expected = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v119-m8-2-graph-usability"))
if ($output -ne $expected) { throw "M8-2 output must remain inside $expected" }
$appPort = 14200
$cdpPort = 14382
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M8-2 requires free ports $appPort and $cdpPort" }
$auditPolicy = Get-Content -LiteralPath (Join-Path $workspace "shared\post-v119-m8-2-knowledge-graph-real-tauri-visual-interaction-audit-policy.json") -Raw | ConvertFrom-Json
$sourceCommit = [string]$auditPolicy.productSourceCommit
if ($sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve frozen product source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri debug build failed" }
$auditRoot = Join-Path $env:TEMP ("longedit-m8-2-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$resolvedTemp = [IO.Path]::GetFullPath($env:TEMP)
$resolvedAudit = [IO.Path]::GetFullPath($auditRoot)
if (-not $resolvedAudit.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe audit root: $resolvedAudit" }
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
for ($index = 1; $index -le 540; $index += 1) {
  $name = "Knowledge-{0:D3}.md" -f $index
  [IO.File]::WriteAllText((Join-Path $library $name), ("# Knowledge {0:D3}`n`nSynthetic isolated audit node.`n" -f $index), $utf8)
}
$before = Get-ChildItem -LiteralPath $library -Filter *.md | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
$viteOut = Join-Path $auditRoot "vite.stdout.log"; $viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
function Wait-ForPort([int]$Port,[bool]$Listening) {
  for ($attempt = 0; $attempt -lt 400; $attempt += 1) { $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue; if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }; Start-Sleep -Milliseconds 100 }
  throw "Timed out waiting for port $Port listening=$Listening"
}
try {
  Wait-ForPort $appPort $true
  $env:LONGEDIT_E2E_LIBRARY = $library; $env:LONGEDIT_E2E_THEME = "dark"; $env:LONGEDIT_E2E_STYLE = "minimal"; $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"; $env:LONGEDIT_M8_AUDIT_OUTPUT = $output; $env:LONGEDIT_M8_SOURCE_COMMIT = $sourceCommit
    & node (Join-Path $workspace "scripts\capture-post-v119-m8-2-graph-usability.mjs")
    if ($LASTEXITCODE -ne 0) { throw "M8-2 desktop capture failed" }
    $after = Get-ChildItem -LiteralPath $library -Filter *.md | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    if ((Compare-Object $before $after).Count -ne 0) { throw "M8-2 changed a source fixture" }
    $evidencePath = Join-Path $output "desktop-evidence.json"
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName sourceFilesUnchanged -NotePropertyValue $true -Force
    [IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    $screenshotPath = Join-Path $output "large-orphan-graph.png"
    $manifest = [ordered]@{
      schemaVersion = 1; stage = "M8-2"; status = "accepted"; productSourceCommit = $sourceCommit
      evidenceFile = "desktop-evidence.json"; evidenceBytes = (Get-Item -LiteralPath $evidencePath).Length
      evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
      screenshots = @([ordered]@{ file = "large-orphan-graph.png"; bytes = (Get-Item -LiteralPath $screenshotPath).Length; sha256 = (Get-FileHash -LiteralPath $screenshotPath -Algorithm SHA256).Hash.ToLowerInvariant() })
      visualReview = "pending-manual-review"; sourceUserContentIncluded = $false; releaseCandidate = $false
    }
    [IO.File]::WriteAllText((Join-Path $output "manifest.json"), (($manifest | ConvertTo-Json -Depth 10) + "`n"), $utf8)
  } finally { if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }; Wait-ForPort $cdpPort $false }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
  if ([IO.Path]::GetFullPath($auditRoot).StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "M8-2 knowledge graph usability audit completed: $output"
