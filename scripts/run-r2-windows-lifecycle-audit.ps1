param(
  [string]$OutputDirectory = "docs\evidence\r2-windows-lifecycle"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\r2-windows-lifecycle"))
if ($output -ne $expectedOutput) { throw "R2 audit output must remain inside docs\evidence\r2-windows-lifecycle" }
$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "R2 desktop audit requires free local ports 9000 and 9333" }

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-r2-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
New-Item -ItemType Directory -Path $library -Force | Out-Null
New-Item -ItemType Directory -Path $output -Force | Out-Null
$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "9000" `
  -WorkingDirectory $workspace `
  -WindowStyle Hidden `
  -RedirectStandardOutput $viteOut `
  -RedirectStandardError $viteErr `
  -PassThru

function Wait-ForPort([int]$Port, [bool]$Listening) {
  for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}

$scenarios = @(
  @{ Id = "cloud-paper"; Theme = "white"; Style = "airy"; Code = "github"; Motion = "reduced" },
  @{ Id = "dark-neon"; Theme = "dark"; Style = "neo"; Code = "native"; Motion = "swift" }
)

try {
  Wait-ForPort -Port 9000 -Listening $true
  foreach ($scenario in $scenarios) {
    $webviewData = Join-Path $auditRoot "webview-$($scenario.Id)"
    New-Item -ItemType Directory -Path $webviewData -Force | Out-Null
    $env:LONGEDIT_E2E_LIBRARY = $library
    $env:LONGEDIT_E2E_THEME = $scenario.Theme
    $env:LONGEDIT_E2E_STYLE = $scenario.Style
    $env:LONGEDIT_E2E_CODE_THEME = $scenario.Code
    $env:LONGEDIT_E2E_MOTION = $scenario.Motion
    $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333 --remote-allow-origins=*"
    $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") `
      -WorkingDirectory (Join-Path $workspace "src-tauri") `
      -WindowStyle Hidden `
      -PassThru
    try {
      Wait-ForPort -Port 9333 -Listening $true
      $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9333"
      $env:LONGEDIT_R2_AUDIT_OUTPUT = $output
      $env:LONGEDIT_R2_AUDIT_SCENARIO = $scenario.Id
      & node (Join-Path $workspace "scripts\capture-r2-windows-lifecycle-audit.mjs")
      if ($LASTEXITCODE -ne 0) { throw "R2 desktop audit capture failed for $($scenario.Id)" }
    }
    finally {
      if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
      Wait-ForPort -Port 9333 -Listening $false
    }
  }
}
finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $viteListener = Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue
  if ($viteListener) { Stop-Process -Id $viteListener.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Output "R2 Windows lifecycle desktop audit completed: $output"
