param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace 'docs\evidence\post-v115-m3-baseline'
$auditRoot = Join-Path $env:TEMP ("longedit-m3-baseline-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$appPort = 14200
$utf8 = [Text.UTF8Encoding]::new($false)
if (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue) { throw "Port $appPort is already in use" }
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output,$auditRoot -Force | Out-Null

foreach ($tier in 100,1000,5000) {
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
  for ($attempt = 0; $attempt -lt 600; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}

try {
  Wait-ForPort $appPort $true
  $offset = 0
  foreach ($tier in 100,1000,5000) {
    $offset += 1
    $cdpPort = 14500 + $offset
    $library = Join-Path $auditRoot ("library-{0}" -f $tier)
    $webview = Join-Path $auditRoot ("webview-{0}" -f $tier)
    New-Item -ItemType Directory -Path $webview -Force | Out-Null
    $env:LONGEDIT_E2E_LIBRARY = $library
    $env:LONGEDIT_E2E_THEME = 'dark'
    $env:LONGEDIT_E2E_STYLE = 'sharp'
    $env:LONGEDIT_E2E_MOTION = 'reduced'
    $env:WEBVIEW2_USER_DATA_FOLDER = $webview
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
    $app = Start-Process (Join-Path $workspace 'src-tauri\target\debug\tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
    try {
      Wait-ForPort $cdpPort $true
      $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
      $env:LONGEDIT_M3_BASELINE_OUTPUT = $output
      $env:LONGEDIT_M3_BASELINE_LIBRARY = $library
      $env:LONGEDIT_M3_BASELINE_TIER = "$tier"
      $env:LONGEDIT_M3_BASELINE_CYCLES = if ($tier -eq 1000) { '20' } else { '0' }
      & node (Join-Path $workspace 'scripts\capture-post-v115-m3-baseline.mjs')
      if ($LASTEXITCODE -ne 0) { throw "M3-0 tier $tier capture failed" }
    } finally {
      if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
      Wait-ForPort $cdpPort $false
    }
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}

& node (Join-Path $workspace 'scripts\check-post-v115-m3-baseline.mjs')
if ($LASTEXITCODE -ne 0) { throw 'M3-0 evidence contract failed' }
Write-Output "M3-0 real desktop baseline completed: $output"
