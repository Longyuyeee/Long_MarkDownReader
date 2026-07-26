param(
  [string]$OutputDirectory = "docs\evidence\a5-stage-a"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\a5-stage-a"))
if ($output -ne $expectedOutput) {
  throw "A5 desktop audit output must remain inside docs\evidence\a5-stage-a"
}

$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) {
  throw "A5 desktop audit requires free local ports 9000 and 9333"
}

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) {
  throw "Tauri Debug build failed"
}

$auditRoot = Join-Path $env:TEMP "longedit-a5-stage-a"
$library = Join-Path $auditRoot "library"
$runId = "{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$webviewData = Join-Path $auditRoot "webview-$runId"
New-Item -ItemType Directory -Path $library -Force | Out-Null
New-Item -ItemType Directory -Path $webviewData -Force | Out-Null
New-Item -ItemType Directory -Path $output -Force | Out-Null
$savedPdfFixture = Join-Path $library "G8 Research Saved.pdf"
if (Test-Path -LiteralPath $savedPdfFixture -PathType Leaf) {
  Remove-Item -LiteralPath $savedPdfFixture -Force
}

$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $library "service.ini"), "[service]`nname=initial`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "application.properties"), "app.name=LongEdit`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "index-proof.ts"), "export const A5_PUBLIC_CODE_MARKER = 'searchable';`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "settings.yaml"), "service:`n  name: initial`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "layout.xml"), "<?xml version=`"1.0`" encoding=`"UTF-8`"?>`n<service status=`"initial`" />`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "project.toml"), "[service]`nname = `"initial`"`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library ".env"), "API_TOKEN=A5_PRIVATE_ENV_MARKER`nEMPTY_VALUE=`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "runtime.log"), "2026-07-26 12:00:00 INFO initial-log-entry`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "damaged.json"), "{`"valid`":true}`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "G8 Source.md"), "# G8 Source`n`n[[G8 Target]]`n`nG8_RELATION_SEARCH_MARKER`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "G8 Target.md"), "# G8 Target`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "G8 Plan.opml"), "<?xml version=`"1.0`" encoding=`"UTF-8`"?><opml version=`"2.0`"><head><title>G8 Planning</title></head><body><outline text=`"Goal`" _longeditId=`"goal`"><outline text=`"Evidence`" _longeditId=`"evidence`"/></outline></body></opml>", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "G8 Tag Source.md"), "# G8 Tag Source`n`n#G8SharedContext`n`nG8_TAG_COLLECTION_MARKER`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "G8 Tag Peer.md"), "# G8 Tag Peer`n`n#G8SharedContext`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "G8 Metrics.table.json"), '{"schemaVersion":1,"kind":"longedit.table","data":{"columns":[{"id":"topic","name":"Topic","type":"text"},{"id":"value","name":"Value","type":"number"}],"rows":[{"id":"row-1","values":{"topic":"Graph","value":"8"}}]},"views":[{"id":"grid","name":"Data grid","kind":"grid","config":{"filter":"","frozenColumns":1,"columnWidths":{"topic":160,"value":100}}},{"id":"chart","name":"Relation Coverage","kind":"chart","config":{"categoryColumn":"topic","valueColumn":"value","chartType":"bar"}}],"activeView":"grid"}', $utf8)
[System.IO.File]::WriteAllText((Join-Path $library "G8 Board.canvas"), '{"nodes":[{"id":"idea","type":"text","text":"Relation productization","x":0,"y":0,"width":240,"height":120},{"id":"metrics","type":"file","file":"G8 Metrics.table.json","longeditViewId":"chart","x":320,"y":0,"width":240,"height":120}],"edges":[{"id":"edge-1","fromNode":"idea","toNode":"metrics","relationType":"supports"}]}', $utf8)
$indexCommandSource = Get-Content -Raw -Encoding UTF8 (Join-Path $workspace "src-tauri\src\commands\index.rs")
$pdfFixtureMatch = [regex]::Match($indexCommandSource, 'const TWO_PAGE_PDF: &str = "([^"]+)";')
if (-not $pdfFixtureMatch.Success) {
  throw "Unable to locate the versioned PDF fixture"
}
[System.IO.File]::WriteAllBytes((Join-Path $library "G8 Research.pdf"), [Convert]::FromBase64String($pdfFixtureMatch.Groups[1].Value))
[System.IO.File]::WriteAllText((Join-Path $library "G8 PDF Note.md"), "# G8 PDF Note`n`n[研究资料](longedit://pdf?path=G8%20Research.pdf&page=1)`n", $utf8)

$largePath = Join-Path $library "large.txt"
$largeStream = [System.IO.StreamWriter]::new($largePath, $false, $utf8)
try {
  for ($index = 0; $index -lt 360000; $index += 1) {
    $largeStream.WriteLine("A5 bounded large text fixture line {0:D6} abcdefghijklmnopqrstuvwxyz" -f $index)
  }
}
finally {
  $largeStream.Dispose()
}

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
    if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) {
      return
    }
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
    -WorkingDirectory (Join-Path $workspace "src-tauri") `
    -PassThru
  try {
    Wait-ForPort -Port 9333 -Listening $true
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9333"
    $env:LONGEDIT_A5_AUDIT_LIBRARY = $library
    $env:LONGEDIT_A5_AUDIT_OUTPUT = $output
    & node (Join-Path $workspace "scripts\capture-a5-desktop-audit.mjs")
    if ($LASTEXITCODE -ne 0) {
      throw "A5 desktop audit capture failed"
    }
  }
  finally {
    if ($app -and -not $app.HasExited) {
      Stop-Process -Id $app.Id -Force
    }
    Wait-ForPort -Port 9333 -Listening $false
  }

  $restartedApp = Start-Process -FilePath (Join-Path $workspace "src-tauri\target\debug\tauri-app.exe") `
    -WorkingDirectory (Join-Path $workspace "src-tauri") `
    -PassThru
  try {
    Wait-ForPort -Port 9333 -Listening $true
    & node (Join-Path $workspace "scripts\verify-a5-desktop-restart.mjs")
    if ($LASTEXITCODE -ne 0) {
      throw "A5 desktop restart verification failed"
    }
  }
  finally {
    if ($restartedApp -and -not $restartedApp.HasExited) {
      Stop-Process -Id $restartedApp.Id -Force
    }
    Wait-ForPort -Port 9333 -Listening $false
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

Write-Output "A5 desktop audit completed: $output"
