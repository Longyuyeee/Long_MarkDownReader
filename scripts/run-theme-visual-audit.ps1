param(
  [string]$OutputDirectory = "docs\evidence\t8-1b"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$library = (Resolve-Path (Join-Path $workspace "docs")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutputRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\t8-1b"))
if ($output -ne $expectedOutputRoot) {
  throw "Theme audit output must remain inside docs\evidence\t8-1b"
}

$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) {
  throw "Theme audit requires free local ports 9000 and 9333"
}

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) {
  throw "Tauri Debug build failed"
}

$auditRoot = Join-Path $env:TEMP "longedit-theme-audit"
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
$viteOut = Join-Path $auditRoot "vite-audit.stdout.log"
$viteErr = Join-Path $auditRoot "vite-audit.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "9000" `
  -WorkingDirectory $workspace `
  -WindowStyle Hidden `
  -RedirectStandardOutput $viteOut `
  -RedirectStandardError $viteErr `
  -PassThru

function Wait-ForPort([int]$Port, [bool]$Listening) {
  for ($attempt = 0; $attempt -lt 150; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) {
      return
    }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}

$scenarios = @(
  @{ Id = "cloud-paper"; Theme = "white"; Style = "airy"; Code = "github"; Motion = "reduced" },
  @{ Id = "forest-green"; Theme = "green"; Style = "soft"; Code = "github"; Motion = "calm" },
  @{ Id = "dark-neon"; Theme = "dark"; Style = "neo"; Code = "native"; Motion = "swift" },
  @{ Id = "purple-dream"; Theme = "purple"; Style = "glass"; Code = "github"; Motion = "expressive" }
)

try {
  Wait-ForPort -Port 9000 -Listening $true
  foreach ($scenario in $scenarios) {
    $scenarioData = Join-Path $auditRoot "webview-$($scenario.Id)"
    New-Item -ItemType Directory -Path $scenarioData -Force | Out-Null
    $env:LONGEDIT_E2E_LIBRARY = $library
    $env:LONGEDIT_E2E_THEME = $scenario.Theme
    $env:LONGEDIT_E2E_STYLE = $scenario.Style
    $env:LONGEDIT_E2E_CODE_THEME = $scenario.Code
    $env:LONGEDIT_E2E_MOTION = $scenario.Motion
    $env:WEBVIEW2_USER_DATA_FOLDER = $scenarioData
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333 --remote-allow-origins=*"
    $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") `
      -WorkingDirectory (Join-Path $workspace "src-tauri") `
      -PassThru
    try {
      Wait-ForPort -Port 9333 -Listening $true
      $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9333"
      $env:LONGEDIT_THEME_AUDIT_OUTPUT = $output
      $env:LONGEDIT_THEME_AUDIT_SCENARIO = $scenario.Id
      & node (Join-Path $workspace "scripts\capture-theme-visual-audit.mjs")
      if ($LASTEXITCODE -ne 0) {
        throw "Theme audit capture failed for $($scenario.Id)"
      }
    }
    finally {
      if ($app -and -not $app.HasExited) {
        Stop-Process -Id $app.Id -Force
      }
      Wait-ForPort -Port 9333 -Listening $false
    }
  }
}
finally {
  if ($vite -and -not $vite.HasExited) {
    Stop-Process -Id $vite.Id -Force
  }
  $viteListener = Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue
  if ($viteListener) {
    Stop-Process -Id $viteListener.OwningProcess -Force
  }
}

Write-Output "Theme visual audit completed: $output"
