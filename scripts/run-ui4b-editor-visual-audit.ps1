param(
  [string]$OutputDirectory = "docs\evidence\ui4b-editors"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\ui4b-editors"))
if ($output -ne $expectedOutput) { throw "UI-4B output must remain inside docs\evidence\ui4b-editors" }

$busyPorts = Get-NetTCPConnection -LocalPort 9000, 9333 -State Listen -ErrorAction SilentlyContinue
if ($busyPorts) { throw "UI-4B audit requires free local ports 9000 and 9333" }

& cargo build --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin tauri-app
if ($LASTEXITCODE -ne 0) { throw "Tauri Debug build failed" }

$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve the source commit" }

$auditRoot = Join-Path $env:TEMP ("longedit-ui4b-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $auditRoot "library"
New-Item -ItemType Directory -Path $library, $output -Force | Out-Null

$utf8 = [System.Text.UTF8Encoding]::new($false)
function Write-Utf8([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$samples = [ordered]@{
  markdown = Join-Path $library "UI4B Product Brief.md"
  txt = Join-Path $library "UI4B Release Notes.txt"
  json = Join-Path $library "UI4B Workspace.json"
  pdf = Join-Path $library "UI4B Two Page Review.pdf"
  docx = Join-Path $library "UI4B Word Review.docx"
  pptx = Join-Path $library "UI4B Presentation Review.pptx"
  csv = Join-Path $library "UI4B Delivery Metrics.csv"
  xlsx = Join-Path $library "UI4B Workbook Review.xlsx"
  diagram = Join-Path $library "UI4B Release Flow.mmd"
  mindmap = Join-Path $library "UI4B Product Map.opml"
  canvas = Join-Path $library "UI4B Planning Board.canvas"
}

Write-Utf8 $samples.markdown @"
# LongEdit 1.0.2 readiness

## Product goals

- Keep managed file navigation inside the library shell.
- Verify professional light, professional dark, and high contrast themes.
- Check Windows-equivalent 100%, 125%, and 150% display scales.

## Acceptance

| Surface | Owner | State |
| --- | --- | --- |
| Editors | Desktop | In review |
| Release gate | Engineering | Pending |

> Evidence is accepted only after automated geometry checks and manual screenshot review.
"@
Write-Utf8 $samples.txt "LongEdit UI-4B desktop review`r`n`r`nScope: editor layout, loading state, save receipt, and keyboard focus.`r`nStatus: ready for visual audit.`r`n"
Write-Utf8 $samples.json @"
{
  "release": "1.0.2",
  "stage": "UI-4B",
  "themes": ["professional-light", "professional-dark", "high-contrast"],
  "scales": [100, 125, 150],
  "checks": {
    "managedNavigation": true,
    "saveReceipt": "pending",
    "visualEvidence": 99
  }
}
"@
Write-Utf8 $samples.csv @"
Workstream,Owner,Planned,Completed,Status
Core shell,Desktop,5,5,Accepted
Editors,Desktop,11,0,In review
Release gate,Engineering,4,1,Pending
Documentation,Product,3,2,In review
"@
Write-Utf8 $samples.diagram @"
flowchart LR
  A[Managed file route] --> B[Real Tauri editor]
  B --> C{Geometry checks}
  C -->|Pass| D[Manual review]
  C -->|Fail| E[Fix and recapture]
  D --> F[Quality Gate]
"@
Write-Utf8 $samples.mindmap @"
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>LongEdit UI-4B</title></head>
  <body>
    <outline text="Editor visual closure" _longeditId="root">
      <outline text="Text and structured data" _longeditId="text"><outline text="Markdown"/><outline text="JSON"/><outline text="CSV"/></outline>
      <outline text="Office formats" _longeditId="office"><outline text="DOCX"/><outline text="PPTX"/><outline text="XLSX"/></outline>
      <outline text="Visual formats" _longeditId="visual"><outline text="Mermaid"/><outline text="Canvas"/></outline>
    </outline>
  </body>
</opml>
"@
Write-Utf8 $samples.canvas @"
{
  "nodes": [
    { "id": "goal", "type": "text", "text": "UI-4B editor closure", "x": 80, "y": 100, "width": 260, "height": 120, "color": "4" },
    { "id": "audit", "type": "text", "text": "Automated geometry audit", "x": 430, "y": 40, "width": 260, "height": 110, "color": "2" },
    { "id": "review", "type": "text", "text": "Manual visual review", "x": 430, "y": 230, "width": 260, "height": 110, "color": "5" }
  ],
  "edges": [
    { "id": "e1", "fromNode": "goal", "fromSide": "right", "toNode": "audit", "toSide": "left", "label": "machine gate" },
    { "id": "e2", "fromNode": "goal", "fromSide": "right", "toNode": "review", "toSide": "left", "label": "human gate" }
  ]
}
"@

$indexCommandSource = [System.IO.File]::ReadAllText((Join-Path $workspace "src-tauri\src\commands\index.rs"))
$pdfFixtureMatch = [regex]::Match($indexCommandSource, 'const TWO_PAGE_PDF: &str = "([^"]+)";')
if (-not $pdfFixtureMatch.Success) { throw "Unable to locate the versioned two-page PDF fixture" }
[System.IO.File]::WriteAllBytes($samples.pdf, [Convert]::FromBase64String($pdfFixtureMatch.Groups[1].Value))

$fixtureCopies = @(
  @{ Source = "fixtures\docx\producers\microsoft-word-16.docx"; Destination = $samples.docx },
  @{ Source = "fixtures\pptx\producers\microsoft-powerpoint-16.pptx"; Destination = $samples.pptx },
  @{ Source = "fixtures\xlsx\output-reopen\s8-7e3g-longedit-multi-axis.xlsx"; Destination = $samples.xlsx }
)
foreach ($copy in $fixtureCopies) {
  $source = Join-Path $workspace $copy.Source
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "UI-4B fixture is missing: $source" }
  Copy-Item -LiteralPath $source -Destination $copy.Destination -Force
}

$sampleMap = $samples | ConvertTo-Json -Compress
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
      $env:LONGEDIT_UI4B_AUDIT_OUTPUT = $output
      $env:LONGEDIT_UI4B_AUDIT_SCENARIO = $scenario.Id
      $env:LONGEDIT_UI4B_SOURCE_COMMIT = $sourceCommit
      $env:LONGEDIT_UI4B_SAMPLE_MAP = $sampleMap
      & node (Join-Path $workspace "scripts\capture-ui4b-editor-visual-audit.mjs")
      if ($LASTEXITCODE -ne 0) { throw "UI-4B capture failed for $($scenario.Id)" }
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

Write-Output "UI-4B editor visual audit completed: $output"
