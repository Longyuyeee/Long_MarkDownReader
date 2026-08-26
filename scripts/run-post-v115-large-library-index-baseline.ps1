param(
  [ValidateSet('baseline','current')][string]$Mode = 'current',
  [ValidateSet('debug','release')][string]$BuildProfile = 'debug',
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v115-large-library-index'
$root = Join-Path $env:TEMP ("longedit-large-index-{0}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $root 'library'
$shellLibrary = Join-Path $root 'shell-library'
$webview = Join-Path $root 'webview'
if ($Mode -eq 'baseline') {
  Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $output,$library,$shellLibrary,$webview -Force | Out-Null

function Get-Sha256Bytes([byte[]]$Bytes,[Security.Cryptography.SHA256]$Algorithm) {
  return ([BitConverter]::ToString($Algorithm.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()
}

$manifestEntries = [Collections.Generic.List[object]]::new()
$fixtureHasher = [Security.Cryptography.SHA256]::Create()
for ($group = 0; $group -lt 100; $group++) {
  $directory = Join-Path $library ("group-{0:D2}" -f $group)
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  for ($item = 0; $item -lt 100; $item++) {
    $number = $group * 100 + $item
    $extension = @('.md','.txt','.json','.yaml')[$number % 4]
    $name = "document-{0:D4}{1}" -f $number,$extension
    $relative = "group-{0:D2}/{1}" -f $group,$name
    $needle = if ($number -eq 9876) { 'longedit-needle-9876' } else { "topic-{0:D4}" -f ($number % 250) }
    $relation = if ($number % 100 -eq 0 -and $number -gt 0) { " [[document-{0:D4}]]" -f ($number - 100) } else { '' }
    $content = switch ($extension) {
      '.md' { "# Document $number`n`n$needle stage index performance.$relation`n" }
      '.txt' { "Document $number`r`n$needle stage index performance.$relation`r`n" }
      '.json' { "{`"id`":$number,`"text`":`"$needle stage index performance`"}`n" }
      '.yaml' { "id: $number`ntext: $needle stage index performance`n" }
    }
    $file = Join-Path $directory $name
    [IO.File]::WriteAllText($file,$content,[Text.UTF8Encoding]::new($false))
    $contentBytes = [Text.Encoding]::UTF8.GetBytes($content)
    $manifestEntries.Add([ordered]@{ path=$relative; bytes=$contentBytes.Length; sha256=(Get-Sha256Bytes $contentBytes $fixtureHasher) })
  }
}
$fixtureHasher.Dispose()
$manifest = [ordered]@{ schemaVersion=1; fileCount=10000; directoryCount=100; generatedAt=(Get-Date).ToUniversalTime().ToString('o'); entries=$manifestEntries }
[IO.File]::WriteAllText((Join-Path $library 'fixture-manifest.json'),($manifest | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
# Let Windows finish filesystem notifications and antivirus bookkeeping before timing the app.
Start-Sleep -Seconds 5

if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
  $cargoArguments = @('build','--locked','--manifest-path',(Join-Path $workspace 'src-tauri\Cargo.toml'),'--bin','tauri-app')
  if ($BuildProfile -eq 'release') { $cargoArguments += '--release' }
  & cargo @cargoArguments
  if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed' }
}

function Stop-Port([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
function Invoke-Capture([string]$Phase,[int]$CdpPort,[string]$WebviewPath) {
  $env:LONGEDIT_E2E_LIBRARY = $shellLibrary
  $env:LONGEDIT_E2E_THEME = 'dark'
  $env:LONGEDIT_E2E_STYLE = 'sharp'
  $env:LONGEDIT_E2E_MOTION = 'reduced'
  $env:WEBVIEW2_USER_DATA_FOLDER = $WebviewPath
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$CdpPort --remote-allow-origins=*"
  $app = Start-Process (Join-Path $workspace "src-tauri\target\$BuildProfile\tauri-app.exe") -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  try {
    for ($i = 0; $i -lt 300 -and -not (Get-NetTCPConnection -LocalPort $CdpPort -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$CdpPort"
    $env:LONGEDIT_LARGE_INDEX_OUTPUT = $output
    $env:LONGEDIT_LARGE_INDEX_LIBRARY = $library
    $env:LONGEDIT_LARGE_INDEX_PHASE = $Phase
    $env:LONGEDIT_LARGE_INDEX_BUILD_PROFILE = $BuildProfile
    $env:LONGEDIT_LARGE_INDEX_SOURCE_COMMIT = (& git rev-parse HEAD)
    & node (Join-Path $workspace 'scripts\capture-post-v115-large-library-index.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Large-library $Phase capture failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force }
    Stop-Port $CdpPort
  }
}

$vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','9000','--strictPort' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
try {
  for ($i = 0; $i -lt 180 -and -not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  if ($Mode -eq 'baseline') {
    Invoke-Capture 'baseline' 9351 $webview
    Invoke-Capture 'restart' 9352 $webview
  } else {
    Invoke-Capture 'current' 9351 $webview
    Invoke-Capture 'restart-current' 9352 $webview
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process $vite.Id -Force }
  Stop-Port 9000
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "Large-library $Mode evidence captured: $output"
