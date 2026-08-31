param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v117-m6-1-graph-fullscreen'
$auditRoot = Join-Path $env:TEMP ("longedit-m6-1-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot 'library'
$utf8 = [Text.UTF8Encoding]::new($false)
$appPort = 14200
$previousTarget = $env:CARGO_TARGET_DIR
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'longedit-mdreader-cargo-target' }
if (Get-NetTCPConnection -LocalPort $appPort,14611,14612 -State Listen -ErrorAction SilentlyContinue) { throw 'M6-1 audit ports are already in use' }
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output,$library,(Join-Path $library 'research') -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $library 'NorthStar.md'), "# North Star`n`n[[research/Brief]]`n[[research/Plan]]`n", $utf8)
[IO.File]::WriteAllText((Join-Path $library 'research\Brief.md'), "# Brief`n`n[[../NorthStar]]`n[[Plan]]`n", $utf8)
[IO.File]::WriteAllText((Join-Path $library 'research\Plan.md'), "# Plan`n`n[[../NorthStar]]`n", $utf8)
try {
  if (-not $SkipBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'M6-1 production build failed' }
    $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.e2e.conf.json') -Raw
    & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
    if ($LASTEXITCODE -ne 0) { throw 'M6-1 Tauri debug build failed' }
  }
  $vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port',"$appPort",'--strictPort' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
  function Wait-ForPort([int]$Port,[bool]$Listening) {
    for ($attempt = 0; $attempt -lt 600; $attempt += 1) {
      $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
      if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
      Start-Sleep -Milliseconds 100
    }
    throw "Timed out waiting for port $Port listening=$Listening"
  }
  try {
    Wait-ForPort $appPort $true
    $sessions = @(
      @{ Theme = 'dark'; Motion = 'reduced'; Port = 14611 },
      @{ Theme = 'white'; Motion = 'calm'; Port = 14612 }
    )
    foreach ($session in $sessions) {
      $webview = Join-Path $auditRoot ("webview-{0}-{1}" -f $session.Theme,$session.Motion)
      New-Item -ItemType Directory -Path $webview -Force | Out-Null
      $env:LONGEDIT_E2E_LIBRARY = $library
      $env:LONGEDIT_E2E_THEME = $session.Theme
      $env:LONGEDIT_E2E_STYLE = 'sharp'
      $env:LONGEDIT_E2E_MOTION = $session.Motion
      $env:WEBVIEW2_USER_DATA_FOLDER = $webview
      $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$($session.Port) --remote-allow-origins=*"
      $targetRoot = [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)
      $app = Start-Process (Join-Path $targetRoot 'debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
      try {
        Wait-ForPort $session.Port $true
        $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$($session.Port)"
        $env:LONGEDIT_M6_1_OUTPUT = $output
        $env:LONGEDIT_M6_1_LIBRARY = $library
        $env:LONGEDIT_M6_1_THEME = $session.Theme
        $env:LONGEDIT_M6_1_MOTION = $session.Motion
        & node (Join-Path $workspace 'scripts\capture-post-v117-m6-1-graph-fullscreen.mjs')
        if ($LASTEXITCODE -ne 0) { throw "M6-1 $($session.Theme)/$($session.Motion) desktop capture failed" }
      } finally {
        if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
        Wait-ForPort $session.Port $false
      }
    }
  } finally {
    if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
    $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
    if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
} finally {
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
  $env:CARGO_TARGET_DIR = $previousTarget
}
Write-Output "M6-1 real desktop audit completed: $output"
