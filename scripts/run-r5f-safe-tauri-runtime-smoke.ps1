param(
  [string]$OutputDirectory = "docs\evidence\r5f-safe-tauri-runtime",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\r5f-safe-tauri-runtime"))
if ($output -ne $expectedOutput) { throw "R5F audit output must remain inside docs\evidence\r5f-safe-tauri-runtime" }

$previewPort = 4175
$cdpPort = 9340
if (Get-NetTCPConnection -LocalPort $previewPort, $cdpPort -State Listen -ErrorAction SilentlyContinue) {
  throw "R5F browser audit requires free local ports $previewPort and $cdpPort"
}
if (-not $SkipBuild) {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "R5F production build failed" }
}

$edgeCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
)
$edge = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $edge) {
  $edge = Get-ChildItem -LiteralPath (Join-Path ${env:ProgramFiles(x86)} "Microsoft\EdgeCore") `
    -Filter "msedge.exe" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $edge) { throw "Microsoft Edge executable was not found" }

$auditRoot = Join-Path $env:TEMP ("longedit-r5f-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$profile = Join-Path $auditRoot "edge-profile"
New-Item -ItemType Directory -Path $profile, $output -Force | Out-Null
$previewOut = Join-Path $auditRoot "preview.stdout.log"
$previewErr = Join-Path $auditRoot "preview.stderr.log"

function Wait-ForPort([int]$Port, [bool]$Listening) {
  for ($attempt = 0; $attempt -lt 300; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}

$preview = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "preview", "--", "--host", "127.0.0.1", "--port", "$previewPort", "--strictPort" `
  -WorkingDirectory $workspace `
  -WindowStyle Hidden `
  -RedirectStandardOutput $previewOut `
  -RedirectStandardError $previewErr `
  -PassThru
try {
  Wait-ForPort -Port $previewPort -Listening $true
  $browser = Start-Process -FilePath $edge `
    -ArgumentList "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=$cdpPort", "--user-data-dir=$profile", "http://127.0.0.1:$previewPort/#/workspace" `
    -WindowStyle Hidden `
    -PassThru
  try {
    Wait-ForPort -Port $cdpPort -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_R5F_OUTPUT = $output
    & node (Join-Path $workspace "scripts\capture-r5f-safe-tauri-runtime-smoke.mjs")
    if ($LASTEXITCODE -ne 0) { throw "R5F browser preview smoke capture failed" }
  }
  finally {
    if ($browser -and -not $browser.HasExited) { Stop-Process -Id $browser.Id -Force }
  }
}
finally {
  if ($preview -and -not $preview.HasExited) { Stop-Process -Id $preview.Id -Force }
  Get-NetTCPConnection -LocalPort $previewPort, $cdpPort -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Output "R5F browser preview smoke completed: $output"
