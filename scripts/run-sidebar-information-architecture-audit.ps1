$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cdpPort = 14527
if (Get-NetTCPConnection -LocalPort 9000,$cdpPort -State Listen -ErrorAction SilentlyContinue) { throw "Sidebar audit requires free ports 9000 and $cdpPort" }
$auditRoot = Join-Path $env:TEMP ("longedit-sidebar-ia-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
New-Item -ItemType Directory -Path $library,$webviewData -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$sample = Join-Path $library "Relation Entry Test.md"
$linked = Join-Path $library "Linked Note.md"
[IO.File]::WriteAllText($sample,"# Relation Entry Test`r`n`r`nThis note uses #product.`r`n`r`nOpen [[Linked Note]].`r`n",$utf8)
[IO.File]::WriteAllText($linked,"# Linked Note`r`n`r`nReturn to [[Relation Entry Test]].`r`n",$utf8)
function Wait-Port([int]$Port,[bool]$Listening) {
  for ($index=0;$index -lt 600;$index++) {
    $found=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $found) -or (-not $Listening -and -not $found)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Port wait failed: $Port"
}
try {
  $vite=Start-Process -FilePath "npm.cmd" -ArgumentList @("run","dev","--","--host","127.0.0.1","--port","9000","--strictPort") -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
  Wait-Port 9000 $true
  $appPath=Join-Path $workspace "src-tauri\target\debug\tauri-app.exe"
  if (-not (Test-Path -LiteralPath $appPath)) {
    & cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
    if ($LASTEXITCODE -ne 0) { throw "Tauri debug build failed" }
  }
  $env:LONGEDIT_E2E_LIBRARY=$library
  $env:WEBVIEW2_USER_DATA_FOLDER=$webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app=Start-Process -FilePath $appPath -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-Port $cdpPort $true
    $env:LONGEDIT_CDP_ENDPOINT="http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_SIDEBAR_SAMPLE_PATH=$sample
    & node (Join-Path $workspace "scripts\capture-sidebar-information-architecture.mjs")
    if ($LASTEXITCODE -ne 0) { throw "Sidebar information architecture audit failed" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue }
    Wait-Port $cdpPort $false
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue }
  Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
  Wait-Port 9000 $false
  $tempRoot=[IO.Path]::GetFullPath($env:TEMP)
  if ([IO.Path]::GetFullPath($auditRoot).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "Sidebar information architecture audit completed."
