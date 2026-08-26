param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v115-m2-closure'
$root = Join-Path $env:TEMP ("longedit-m2-closure-{0}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$largeName = -join ([char[]](0x5927,0x578B,0x771F,0x5B9E,0x8D44,0x6599,0x5E93))
$emptyName = -join ([char[]](0x7A7A,0x8D44,0x6599,0x5E93))
$largeLibrary = Join-Path $root $largeName
$emptyLibrary = Join-Path $root $emptyName
$webviewLarge = Join-Path $root 'webview-large'
$webviewEmpty = Join-Path $root 'webview-empty'
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output,$largeLibrary,$emptyLibrary,$webviewLarge,$webviewEmpty -Force | Out-Null
Copy-Item -Path (Join-Path $workspace 'fixtures\post-v115-m0\workspace\*') -Destination $largeLibrary -Recurse -Force
$bulk = Join-Path $largeLibrary 'bulk'
New-Item -ItemType Directory -Path $bulk -Force | Out-Null
for ($index = 1; $index -le 1000; $index++) {
  $name = 'record-{0:D4}.txt' -f $index
  [IO.File]::WriteAllText((Join-Path $bulk $name), "Record $index`r`n", [Text.UTF8Encoding]::new($false))
}
if (-not $SkipBuild) {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
  & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
  if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed' }
}
if (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 9000 is already in use' }
$vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','9000','--strictPort' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
function Invoke-DesktopScenario([string]$Library, [string]$Webview, [int]$Port, [string]$Script) {
  $env:LONGEDIT_E2E_LIBRARY = $Library
  $env:LONGEDIT_E2E_THEME = 'dark'
  $env:LONGEDIT_E2E_STYLE = 'sharp'
  $env:LONGEDIT_E2E_MOTION = 'reduced'
  $env:WEBVIEW2_USER_DATA_FOLDER = $Webview
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port --remote-allow-origins=*"
  $app = Start-Process (Join-Path $workspace 'src-tauri\target\debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
  try {
    for ($i = 0; $i -lt 240 -and -not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$Port"
    $env:LONGEDIT_M2_CLOSURE_OUTPUT = $output
    $env:LONGEDIT_M2_CLOSURE_LIBRARY = $Library
    & node (Join-Path $workspace $Script)
    if ($LASTEXITCODE -ne 0) { throw "M2 closure scenario failed: $Script" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process $app.Id -Force }
  }
}
try {
  for ($i = 0; $i -lt 180 -and -not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
  Invoke-DesktopScenario $largeLibrary $webviewLarge 9337 'scripts\capture-post-v115-m2-closure-large.mjs'
  Invoke-DesktopScenario $emptyLibrary $webviewEmpty 9338 'scripts\capture-post-v115-m2-closure-states.mjs'
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process $vite.Id -Force }
  Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
& node (Join-Path $workspace 'scripts\check-post-v115-m2-closure.mjs')
if ($LASTEXITCODE -ne 0) { throw 'M2 closure evidence check failed' }
Write-Output "M2 closure audit completed: $output"
