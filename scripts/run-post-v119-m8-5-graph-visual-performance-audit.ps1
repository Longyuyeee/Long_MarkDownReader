param([string]$OutputDirectory = "docs\evidence\post-v119-m8-5-graph-visual-performance")
$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expected = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v119-m8-5-graph-visual-performance"))
if ($output -ne $expected) { throw "M8-5 output must remain inside $expected" }
$appPort = 14200
$cdpPort = 14387
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "M8-5 requires free ports $appPort and $cdpPort" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve M8-5 source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri debug build failed" }
$auditRoot = Join-Path $env:TEMP ("longedit-m8-5-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$safeTemp = [IO.Path]::GetFullPath($env:TEMP)
$safeAudit = [IO.Path]::GetFullPath($auditRoot)
if (-not $safeAudit.StartsWith($safeTemp,[StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe M8-5 audit root" }
$library = Join-Path $auditRoot "library"
$webview = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webview,$output -Force | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-","").ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}
for ($index=0; $index -lt 180; $index+=1) {
  $cluster=[Math]::Floor($index/30); $next=($index+1)%180; $near=($index+7)%180; $bridge=(($cluster+1)%6)*30+($index%5)
  $body="# Topic $index`n`nCluster $cluster knowledge node.`n`n[[Topic-$next]] [[Topic-$near]] [[Topic-$bridge]]`n"
  [IO.File]::WriteAllText((Join-Path $library ("Topic-{0}.md" -f $index)),$body,$utf8)
}
$before = Get-ChildItem -LiteralPath $library -Filter *.md | ForEach-Object { Get-Sha256 $_.FullName }
$viteOut=Join-Path $auditRoot "vite.out.log"; $viteErr=Join-Path $auditRoot "vite.err.log"
$vite=Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
function Wait-Port([int]$Port,[bool]$Listening){for($i=0;$i-lt500;$i+=1){$c=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue;if(($Listening-and$c)-or(-not$Listening-and-not$c)){return};Start-Sleep -Milliseconds 100};throw "port timeout $Port"}
try {
  Wait-Port $appPort $true
  $env:LONGEDIT_E2E_LIBRARY=$library; $env:LONGEDIT_E2E_THEME="dark"; $env:LONGEDIT_E2E_STYLE="minimal"; $env:LONGEDIT_E2E_MOTION="calm"
  $env:WEBVIEW2_USER_DATA_FOLDER=$webview; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app=Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"; $env:LONGEDIT_M8_5_OUTPUT=$output; $env:LONGEDIT_M8_5_SOURCE_COMMIT=$sourceCommit
    & node (Join-Path $workspace "scripts\capture-post-v119-m8-5-graph-visual-performance.mjs")
    if ($LASTEXITCODE -ne 0) { throw "M8-5 desktop capture failed" }
    $after = Get-ChildItem -LiteralPath $library -Filter *.md | ForEach-Object { Get-Sha256 $_.FullName }
    if ((Compare-Object $before $after).Count -ne 0) { throw "M8-5 changed a source fixture" }
    $evidencePath=Join-Path $output "desktop-evidence.json"
    $evidence=Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName sourceFilesUnchanged -NotePropertyValue $true -Force
    [IO.File]::WriteAllText($evidencePath,(($evidence|ConvertTo-Json -Depth 20)+"`n"),$utf8)
    $screens=@("settled-overview.png","selected-feedback.png") | ForEach-Object { $file=Join-Path $output $_; [ordered]@{file=$_;bytes=(Get-Item -LiteralPath $file).Length;sha256=Get-Sha256 $file} }
    $manifest=[ordered]@{schemaVersion=1;stage="M8-5";status="accepted";productSourceCommit=$sourceCommit;evidenceFile="desktop-evidence.json";evidenceBytes=(Get-Item -LiteralPath $evidencePath).Length;evidenceSha256=Get-Sha256 $evidencePath;screenshots=$screens;visualReview="pending-manual-review";sourceUserContentIncluded=$false;releaseCandidate=$false}
    [IO.File]::WriteAllText((Join-Path $output "manifest.json"),(($manifest|ConvertTo-Json -Depth 10)+"`n"),$utf8)
  } finally { if($app-and-not$app.HasExited){Stop-Process -Id $app.Id -Force}; Wait-Port $cdpPort $false }
} finally {
  if($vite-and-not$vite.HasExited){Stop-Process -Id $vite.Id -Force}
  $listener=Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if($listener){Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue}
  if($safeAudit.StartsWith($safeTemp,[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue}
}
Write-Output "M8-5 graph visual/performance audit completed: $output"
