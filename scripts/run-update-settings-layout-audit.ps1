$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cdpPort = 14524
if (Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "Update/settings audit requires free CDP port $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-update-settings-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData -Force | Out-Null
Set-Content -LiteralPath (Join-Path $library "界面验收.md") -Value "# LongEdit update and settings layout audit" -Encoding UTF8
function Wait-Port([int]$Port,[bool]$Listening) {
  for ($index=0;$index -lt 600;$index++) {
    $found = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $found) -or (-not $Listening -and -not $found)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Port wait failed: $Port"
}
try {
  $devServer = $null
  $browser = $null
  try {
    if (-not (Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue)) {
      $vite = Join-Path $workspace "node_modules\vite\bin\vite.js"
      $devServer = Start-Process -FilePath "node" -ArgumentList @($vite,"--host","127.0.0.1","--port","9000","--strictPort") -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
      Wait-Port 9000 $true
    }
    $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    if (-not (Test-Path -LiteralPath $edge)) { throw "Microsoft Edge was not found for isolated UI audit" }
    $browser = Start-Process -FilePath $edge -ArgumentList @(
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--remote-debugging-port=$cdpPort",
      "--remote-allow-origins=*",
      "--user-data-dir=$webviewData",
      "--window-size=1280,800",
      "about:blank"
    ) -WindowStyle Hidden -PassThru
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"
    & node (Join-Path $workspace "scripts\capture-update-settings-layout.mjs")
    if ($LASTEXITCODE -ne 0) { throw "Update/settings desktop audit failed" }
  } finally {
    Get-NetTCPConnection -LocalPort $cdpPort -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Wait-Port $cdpPort $false
    if ($devServer -and -not $devServer.HasExited) { Stop-Process -Id $devServer.Id -Force }
    if ($devServer) { Wait-Port 9000 $false }
  }
} finally {
  $tempRoot = [IO.Path]::GetFullPath($env:TEMP)
  if ([IO.Path]::GetFullPath($auditRoot).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "Update modal and settings navigation audit completed."
