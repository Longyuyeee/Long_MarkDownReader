param(
  [string]$OutputDirectory = "docs\evidence\ui4a-shell"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$library = (Resolve-Path (Join-Path $workspace "docs")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ui4a-shell"))
if ($output -ne $expectedOutput) {
  throw "UI-4A output must remain inside docs\evidence\ui4a-shell"
}

$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) {
  throw "UI-4A audit requires free local ports 9000 and 9333"
}

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') {
  throw "Unable to resolve the source commit"
}

$auditRoot = Join-Path $env:TEMP "longedit-ui4a-shell-audit"
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
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
  @{ Id = "professional-light"; Theme = "white"; Style = "minimal"; Code = "github"; Motion = "swift" },
  @{ Id = "professional-dark"; Theme = "dark"; Style = "minimal"; Code = "tokyo-night-dark"; Motion = "calm" },
  @{ Id = "high-contrast"; Theme = "contrast"; Style = "sharp"; Code = "github-dark"; Motion = "reduced" }
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
      -WindowStyle Hidden `
      -PassThru
    try {
      Wait-ForPort -Port 9333 -Listening $true
      $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9333"
      $env:LONGEDIT_UI4_AUDIT_OUTPUT = $output
      $env:LONGEDIT_UI4_AUDIT_SCENARIO = $scenario.Id
      $env:LONGEDIT_UI4_SOURCE_COMMIT = $sourceCommit
      & node (Join-Path $workspace "scripts\capture-ui4a-shell-visual-audit.mjs")
      if ($LASTEXITCODE -ne 0) { throw "UI-4A capture failed for $($scenario.Id)" }
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
  if ($viteListener) { Stop-Process -Id $viteListener.OwningProcess -Force }
}

Write-Output "UI-4A shell visual audit completed: $output"
