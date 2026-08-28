param(
  [switch]$SkipBuild,
  [ValidateSet(0,100,1000,5000)][int]$Tier = 0,
  [ValidateSet('M3C-0','M3C-1')][string]$Stage = 'M3C-0'
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stageSlug = $Stage.ToLowerInvariant().Replace('-','')
$evidenceName = if ($Stage -eq 'M3C-1') { 'post-v115-m3c1-settled-dirty-frame-and-lifecycle-loop' } else { 'post-v115-m3c0-large-graph-performance-baseline' }
$output = Join-Path $workspace ("docs\evidence\{0}" -f $evidenceName)
$auditRoot = Join-Path $env:TEMP ("longedit-{0}-{1}-{2}" -f $stageSlug,$PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$appPort = 14200
$utf8 = [Text.UTF8Encoding]::new($false)
$previousTarget = $env:CARGO_TARGET_DIR
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'longedit-mdreader-cargo-target' }
if (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue) { throw "Port $appPort is already in use" }
$tiers = if ($Tier) { @($Tier) } else { @(100,1000,5000) }
if (-not $Tier) { Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $output,$auditRoot -Force | Out-Null

try {
  foreach ($tier in $tiers) {
    $library = Join-Path $auditRoot ("library-{0}" -f $tier)
    New-Item -ItemType Directory -Path $library -Force | Out-Null
    for ($index = 1; $index -le $tier; $index += 1) {
      $name = 'node-{0:D6}.md' -f $index
      $next = if ($index -lt $tier) { 'node-{0:D6}' -f ($index + 1) } else { '' }
      $body = if ($next) { "# Node $index`n`n[[$next]]`n" } else { "# Node $index`n" }
      [IO.File]::WriteAllText((Join-Path $library $name), $body, $utf8)
    }
  }

  if (-not $SkipBuild) {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
    $env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.e2e.conf.json') -Raw
    & cargo build --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') --bin tauri-app
    if ($LASTEXITCODE -ne 0) { throw 'Tauri Debug build failed' }
  }

  $vite = Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port',"$appPort",'--strictPort' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
  function Wait-ForPort([int]$Port,[bool]$Listening) {
    for ($attempt = 0; $attempt -lt 1200; $attempt += 1) {
      $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
      if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
      Start-Sleep -Milliseconds 100
    }
    throw "Timed out waiting for port $Port listening=$Listening"
  }

  try {
    Wait-ForPort $appPort $true
    $offset = 0
    foreach ($tier in $tiers) {
      $offset += 1
      $cdpPort = 14700 + $offset
      $library = Join-Path $auditRoot ("library-{0}" -f $tier)
      $webview = Join-Path $auditRoot ("webview-{0}" -f $tier)
      New-Item -ItemType Directory -Path $webview -Force | Out-Null
      $env:LONGEDIT_E2E_LIBRARY = $library
      $env:LONGEDIT_E2E_THEME = 'dark'
      $env:LONGEDIT_E2E_STYLE = 'sharp'
      $env:LONGEDIT_E2E_MOTION = 'reduced'
      $env:WEBVIEW2_USER_DATA_FOLDER = $webview
      $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
      $targetRoot = [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)
      $app = Start-Process (Join-Path $targetRoot 'debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
      try {
        Wait-ForPort $cdpPort $true
        $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
        $env:LONGEDIT_M3C_STAGE = $Stage
        $env:LONGEDIT_M3C_OUTPUT = $output
        $env:LONGEDIT_M3C_LIBRARY = $library
        $env:LONGEDIT_M3C_TIER = "$tier"
        $env:LONGEDIT_M3C_CYCLES = if ($tier -eq 1000) { '20' } else { '0' }
        & node (Join-Path $workspace 'scripts\capture-post-v115-m3c0-large-graph-performance.mjs')
        if ($LASTEXITCODE -ne 0) { throw "$Stage tier $tier capture failed" }
      } finally {
        if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
        Wait-ForPort $cdpPort $false
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

$checker = if ($Stage -eq 'M3C-1') { 'scripts\check-post-v115-m3c1-settled-dirty-frame-and-lifecycle-loop.mjs' } else { 'scripts\check-post-v115-m3c0-large-graph-performance-baseline.mjs' }
& node (Join-Path $workspace $checker)
if ($LASTEXITCODE -ne 0) { throw "$Stage evidence contract failed" }
Write-Output "$Stage real desktop baseline completed: $output"
