param(
  [string]$OutputDirectory = "docs\evidence\ux38a-lightweight-formats"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ux38a-lightweight-formats"))
if ($output -ne $expectedOutput) { throw "UX-38A output must remain inside $expectedOutput" }

$appPort = 14200
$cdpPort = 14390
if (Get-NetTCPConnection -LocalPort $appPort,$cdpPort -State Listen -ErrorAction SilentlyContinue) {
  throw "UX-38A desktop audit requires free local ports $appPort and $cdpPort"
}
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }
$env:TAURI_CONFIG = Get-Content -LiteralPath (Join-Path $workspace "src-tauri\tauri.e2e.conf.json") -Raw
& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$auditRoot = Join-Path $env:TEMP ("longedit-ux38a-{0}-{1}" -f $PID,[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
$webviewData = Join-Path $auditRoot "webview"
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $library,$webviewData,$output -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$samples = @(
  @{ id="markdown"; file="UX38A-markdown.md"; content="# UX38A Markdown`n`nExplicit save workspace.`n" },
  @{ id="plain-text"; file="UX38A-plain-text.txt"; content="UX38A plain text`nSecond line`n" },
  @{ id="env"; file="UX38A.env"; content="LONGEDIT_TOKEN=redacted`nLONGEDIT_STAGE=UX38A`n" },
  @{ id="ini"; file="UX38A-ini.ini"; content="[workspace]`nstage=UX38A`n" },
  @{ id="properties"; file="UX38A-properties.properties"; content="workspace.stage=UX38A`n" },
  @{ id="editorconfig"; file="UX38A.editorconfig"; content="root = true`n[*]`ncharset = utf-8`n" },
  @{ id="gitignore"; file="UX38A.gitignore"; content="dist/`ntarget/`n" },
  @{ id="javascript"; file="UX38A-javascript.js"; content="export const stage = 'UX38A'`n" },
  @{ id="typescript"; file="UX38A-typescript.ts"; content="export const stage: string = 'UX38A'`n" },
  @{ id="python"; file="UX38A-python.py"; content="stage = 'UX38A'`n" },
  @{ id="rust"; file="UX38A-rust.rs"; content="const STAGE: &str = `"UX38A`";`n" },
  @{ id="go"; file="UX38A-go.go"; content="package main`nconst stage = `"UX38A`"`n" },
  @{ id="jvm-code"; file="UX38A-java.java"; content="final class UX38A { static final String STAGE = `"UX38A`"; }`n" },
  @{ id="c-family"; file="UX38A-c.c"; content="const char *stage = `"UX38A`";`n" },
  @{ id="shell"; file="UX38A-shell.sh"; content="#!/bin/sh`nstage='UX38A'`n" },
  @{ id="sql"; file="UX38A-sql.sql"; content="SELECT 'UX38A' AS stage;`n" },
  @{ id="web-source"; file="UX38A-web.html"; content="<!doctype html><title>UX38A</title><main>Safe preview</main>`n" },
  @{ id="json"; file="UX38A-json.json"; content="{ `"stage`": `"UX38A`", `"accepted`": true }`n" },
  @{ id="log"; file="UX38A-log.log"; content="2026-08-05T10:00:00Z INFO UX38A started`n2026-08-05T10:00:01Z WARN sample warning`n" },
  @{ id="jsonc"; file="UX38A-jsonc.jsonc"; content="{ // audit`n  `"stage`": `"UX38A`"`n}`n" },
  @{ id="yaml"; file="UX38A-yaml.yaml"; content="stage: UX38A`naccepted: true`n" },
  @{ id="xml"; file="UX38A-xml.xml"; content="<?xml version=`"1.0`"?><audit stage=`"UX38A`"/>`n" },
  @{ id="svg"; file="UX38A-svg.svg"; content="<svg xmlns=`"http://www.w3.org/2000/svg`" width=`"120`" height=`"40`"><rect width=`"120`" height=`"40`" fill=`"#2f6fed`"/></svg>`n" },
  @{ id="toml"; file="UX38A-toml.toml"; content="stage = `"UX38A`"`naccepted = true`n" }
)
$sampleMap = @()
$before = @{}
foreach ($sample in $samples) {
  $filePath = Join-Path $library $sample.file
  [IO.File]::WriteAllText($filePath, $sample.content, $utf8)
  $before[$sample.file] = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
  $sampleMap += @{ id=$sample.id; path=$filePath; file=$sample.file }
}

$viteOut = Join-Path $auditRoot "vite.stdout.log"
$viteErr = Join-Path $auditRoot "vite.stderr.log"
$vite = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","--host","127.0.0.1","--port","$appPort" `
  -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
function Wait-ForPort([int]$Port,[bool]$Listening) {
  for ($attempt = 0; $attempt -lt 300; $attempt += 1) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for port $Port listening=$Listening"
}

try {
  Wait-ForPort -Port $appPort -Listening $true
  $env:LONGEDIT_E2E_LIBRARY = $library
  $env:LONGEDIT_E2E_THEME = "white"
  $env:LONGEDIT_E2E_STYLE = "minimal"
  $env:LONGEDIT_E2E_CODE_THEME = "github"
  $env:LONGEDIT_E2E_MOTION = "reduced"
  $env:WEBVIEW2_USER_DATA_FOLDER = $webviewData
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
  $app = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") -WorkingDirectory (Join-Path $workspace "src-tauri") -WindowStyle Hidden -PassThru
  try {
    Wait-ForPort -Port $cdpPort -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort"
    $env:LONGEDIT_UX38A_AUDIT_OUTPUT = $output
    $env:LONGEDIT_UX38A_SOURCE_COMMIT = $sourceCommit
    $env:LONGEDIT_UX38A_SAMPLES = ($sampleMap | ConvertTo-Json -Compress)
    & node (Join-Path $workspace "scripts\capture-ux38a-lightweight-formats.mjs")
    if ($LASTEXITCODE -ne 0) { throw "UX-38A desktop capture failed" }

    $unchanged = $true
    foreach ($sample in $samples) {
      $filePath = Join-Path $library $sample.file
      if ($before[$sample.file] -ne (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash) { $unchanged = $false }
    }
    $evidencePath = Join-Path $output "interaction-evidence.json"
    $manifestPath = Join-Path $output "manifest.json"
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName sourceFilesUnchanged -NotePropertyValue $unchanged -Force
    [IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifest.evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 10) + "`n"), $utf8)
    if (-not $unchanged) { throw "UX-38A route audit changed a source fixture" }
  } finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    Wait-ForPort -Port $cdpPort -Listening $false
  }
} finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force }
  $viteListener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($viteListener) { Stop-Process -Id $viteListener.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $auditRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "UX-38A lightweight format audit completed: $output"
