param([string]$OutputDirectory = "docs\evidence\post-v115-m4c4-graph-project-note-disclosure")
$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v115-m4c4-graph-project-note-disclosure"))
if ($output -ne $expectedOutput) { throw "M4C-4 output must remain inside $expectedOutput" }
$appPort = 14200; $cdpPort = 14532
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M4C-4 requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-m4c4-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"; $webviewData = Join-Path $auditRoot "webview"
$firstDir = Join-Path $library "First"; $collisionDir = Join-Path $library "Collision"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $firstDir,$collisionDir,$webviewData,$output -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$firstLinks = [Text.StringBuilder]::new("# Graph First`n`nCENTER BODY MUST NOT COPY FIRST`n`n")
$collisionLinks = [Text.StringBuilder]::new("# Graph Collision`n`nCENTER BODY MUST NOT COPY COLLISION`n`n")
for ($index = 0; $index -lt 102; $index += 1) {
  $number = $index.ToString("000")
  [void]$firstLinks.AppendLine("[[First Related $number]]")
  [void]$collisionLinks.AppendLine("[[Collision Related $number]]")
  [IO.File]::WriteAllText((Join-Path $firstDir "First Related $number.md"), "# First Related $number`n", $utf8)
  [IO.File]::WriteAllText((Join-Path $collisionDir "Collision Related $number.md"), "# Collision Related $number`n", $utf8)
}
[IO.File]::WriteAllText((Join-Path $firstDir "Graph First.md"), $firstLinks.ToString(), $utf8)
[IO.File]::WriteAllText((Join-Path $collisionDir "Graph Collision.md"), $collisionLinks.ToString(), $utf8)

$viteOut = Join-Path $auditRoot "vite.stdout.log"; $viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
function Wait-ForPort([int]$Port,[bool]$Listening) {
  for ($attempt = 0; $attempt -lt 300; $attempt += 1) { $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue; if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }; Start-Sleep -Milliseconds 100 }
  throw "Timed out waiting for port $Port listening=$Listening"
}
try {
  Wait-ForPort -Port $appPort -Listening $true
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME="white"; $env:LONGEDIT_E2E_STYLE="minimal"; $env:LONGEDIT_E2E_CODE_THEME="github"; $env:LONGEDIT_E2E_MOTION="reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER=$webviewData; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort -Port $cdpPort -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_M4C4_AUDIT_OUTPUT=$output; $env:LONGEDIT_M4C4_AUDIT_LIBRARY=$library; $env:LONGEDIT_M4C4_SOURCE_COMMIT=$sourceCommit
    & node (Join-Path $workspace "scripts\capture-post-v115-m4c4-graph-project-note-disclosure-audit.mjs")
    if ($LASTEXITCODE -ne 0) { throw "M4C-4 desktop capture failed" }
  } finally { if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }; Wait-ForPort -Port $cdpPort -Listening $false }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "M4C-4 graph project-note disclosure audit completed: $output"
