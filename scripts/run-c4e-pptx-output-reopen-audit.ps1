param()

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "C4E desktop audit requires free local ports 9000 and 9333" }
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-c4e-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
$evidence = Join-Path $workspace "docs\evidence\c4e-pptx-output-reopen"
$artifacts = Join-Path $workspace "fixtures\pptx\output-reopen"
New-Item -ItemType Directory -Path $library, $webviewData, $evidence, $artifacts -Force | Out-Null
$fixtureSource = Join-Path $workspace "fixtures\pptx\producers\wps-presentation.pptx"
$fixture = Join-Path $library "c4e-source-wps.pptx"
Copy-Item -LiteralPath $fixtureSource -Destination $fixture

$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "9000" `
  -WorkingDirectory $workspace -WindowStyle Hidden `
  -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
function Wait-ForPort([int]$Port, [bool]$Listening) {
  for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}
try {
  Wait-ForPort -Port 9000 -Listening $true
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = "white"
  $env:LONGEDIT_E2E_STYLE = "minimal"
  $env:LONGEDIT_E2E_CODE_THEME = "github"
  $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333 --remote-allow-origins=*"
  $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") `
    -WorkingDirectory (Join-Path $workspace "src-tauri") -PassThru
  try {
    Wait-ForPort -Port 9333 -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9333"
    $env:LONGEDIT_C4E_SOURCE = $fixture
    $env:LONGEDIT_C4E_GENERATION_REPORT = Join-Path $evidence "generation.json"
    & node (Join-Path $workspace "scripts\capture-c4e-pptx-output-copies.mjs")
    if ($LASTEXITCODE -ne 0) { throw "C4E output generation failed" }
  }
  finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort -Port 9333 -Listening $false
  }
}
finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $viteListener = Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue
  if ($viteListener) { Stop-Process -Id $viteListener.OwningProcess -Force -ErrorAction SilentlyContinue }
}

foreach ($file in @("c4e-text-copy.pptx", "c4e-style-copy.pptx", "c4e-alt-text-copy.pptx")) {
  $generated = Join-Path $library $file
  $published = Join-Path $artifacts $file
  if (Test-Path -LiteralPath $published -PathType Leaf) {
    if ((Get-FileHash -LiteralPath $generated -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $published -Algorithm SHA256).Hash) {
      throw "Existing C4E artifact differs and will not be overwritten automatically: $published"
    }
  }
  else {
    Copy-Item -LiteralPath $generated -Destination $published
  }
}
& (Join-Path $workspace "scripts\verify-c4e-pptx-producer-reopen.ps1") `
  -OutputDirectory $artifacts `
  -ReportPath (Join-Path $evidence "matrix.json")
Write-Output "C4E PPTX output-reopen audit completed: $evidence"
