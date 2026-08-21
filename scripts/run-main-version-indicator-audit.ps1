$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cdpPort = 14522
if (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "Version indicator audit requires free CDP port $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-version-indicator-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData -Force | Out-Null
Set-Content -LiteralPath (Join-Path $library "版本显示验收.md") -Value "# LongEdit version indicator audit" -Encoding UTF8
function Wait-Port([int]$Port,[bool]$Listening) {
  for ($index=0;$index -lt 600;$index++) {
    $found = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $found) -or (-not $Listening -and -not $found)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Port wait failed: $Port"
}
try {
  $env:LONGEDIT_E2E_LIBRARY=$library
  $env:LONGEDIT_E2E_THEME="dark"
  $env:LONGEDIT_E2E_STYLE="sharp"
  $env:LONGEDIT_E2E_MOTION="reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER=$webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $devServer = $null
  try {
    if (-not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue)) {
      $vite = Join-Path $workspace "node_modules\vite\bin\vite.js"
      $devServer = Start-Process -FilePath "node" -ArgumentList @($vite,"--host","127.0.0.1","--port","9000","--strictPort") -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
      Wait-Port 9000 $true
    }
    $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"
    & node (Join-Path $workspace "scripts\capture-main-version-indicator.mjs")
    if ($LASTEXITCODE -ne 0) { throw "Main version indicator desktop capture failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-Port $cdpPort $false
    if ($devServer -and -not $devServer.HasExited) { Stop-Process -Id $devServer.Id -Force }
    if ($devServer) { Wait-Port 9000 $false }
  }
} finally {
  $tempRoot = [IO.Path]::GetFullPath($env:TEMP)
  if ([IO.Path]::GetFullPath($auditRoot).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "Main version indicator audit completed."
