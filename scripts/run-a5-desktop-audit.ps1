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

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Add-DocxTextEntry(
  [System.IO.Compression.ZipArchive]$Archive,
  [string]$Name,
  [string]$Content
) {
  $entry = $Archive.CreateEntry($Name, [System.IO.Compression.CompressionLevel]::Optimal)
  $stream = $entry.Open()
  $writer = [System.IO.StreamWriter]::new($stream, $utf8)
  try {
    $writer.Write($Content)
  }
  finally {
    $writer.Dispose()
  }
}

function Add-DocxBytesEntry(
  [System.IO.Compression.ZipArchive]$Archive,
  [string]$Name,
  [byte[]]$Content
) {
  $entry = $Archive.CreateEntry($Name, [System.IO.Compression.CompressionLevel]::Optimal)
  $stream = $entry.Open()
  try {
    $stream.Write($Content, 0, $Content.Length)
  }
  finally {
    $stream.Dispose()
  }
}

$docxFixture = Join-Path $library "C1 Product Brief.docx"
if (Test-Path -LiteralPath $docxFixture -PathType Leaf) {
  Remove-Item -LiteralPath $docxFixture -Force
}
$docxArchive = [System.IO.Compression.ZipFile]::Open(
  $docxFixture,
  [System.IO.Compression.ZipArchiveMode]::Create
)
try {
  Add-DocxTextEntry $docxArchive "[Content_Types].xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
  <Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>
</Types>
'@
  Add-DocxTextEntry $docxArchive "docProps/core.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>LongEdit C1 Audit</dc:creator>
</cp:coreProperties>
'@
  Add-DocxTextEntry $docxArchive "docProps/app.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Microsoft Office Word compatible fixture</Application>
</Properties>
'@
  Add-DocxTextEntry $docxArchive "word/document.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="BriefHeading"/></w:pPr><w:r><w:t>Product Brief</w:t></w:r></w:p>
    <w:p><w:commentRangeStart w:id="7"/><w:r><w:t>DOCX Daily Management keeps Word content inside the original Library work area.</w:t></w:r><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Review structured content and compatibility warnings.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Capability matrix</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Structured reading</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Available</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>Before explicit page break.</w:t><w:br w:type="page"/><w:lastRenderedPageBreak/><w:t>After explicit page break.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Related note anchors</w:t><w:footnoteReference w:id="2"/><w:endnoteReference w:id="4"/></w:r></w:p>
    <w:p><w:ins><w:r><w:t>Tracked text remains visible and read-only.</w:t></w:r></w:ins><w:r><w:drawing><a:graphic><a:blip r:embed="rId5"/></a:graphic></w:drawing></w:r></w:p>
    <w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>DATE</w:instrText></w:r></w:p>
    <w:sectPr>
      <w:type w:val="continuous"/>
      <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080" w:header="720" w:footer="720"/>
      <w:cols w:num="2"/>
    </w:sectPr>
  </w:body>
</w:document>
'@
  Add-DocxTextEntry $docxArchive "word/styles.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="BriefHeading"><w:name w:val="Product section"/><w:basedOn w:val="Heading1"/></w:style>
</w:styles>
'@
  Add-DocxTextEntry $docxArchive "word/numbering.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>
'@
  Add-DocxTextEntry $docxArchive "word/_rels/document.xml.rels" @'
<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>
'@
  Add-DocxTextEntry $docxArchive "word/comments.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="7" w:author="C1 Reviewer" w:date="2026-07-27"><w:p><w:r><w:t>C1-2B review evidence</w:t></w:r></w:p></w:comment>
</w:comments>
'@
  Add-DocxTextEntry $docxArchive "word/footnotes.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:id="2"><w:p><w:r><w:t>C1-2B footnote evidence</w:t></w:r></w:p></w:footnote>
</w:footnotes>
'@
  Add-DocxTextEntry $docxArchive "word/endnotes.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:endnote w:id="4"><w:p><w:r><w:t>C1-2B endnote evidence</w:t></w:r></w:p></w:endnote>
</w:endnotes>
'@
  Add-DocxTextEntry $docxArchive "word/header1.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>C1-2B header evidence</w:t></w:r></w:p></w:hdr>
'@
  Add-DocxTextEntry $docxArchive "word/footer1.xml" @'
<?xml version="1.0" encoding="UTF-8"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>C1-2B footer evidence</w:t></w:r></w:p></w:ftr>
'@
  Add-Type -AssemblyName System.Drawing
  $mediaBitmap = [System.Drawing.Bitmap]::new(480, 150)
  $mediaGraphics = [System.Drawing.Graphics]::FromImage($mediaBitmap)
  $mediaStream = [System.IO.MemoryStream]::new()
  try {
    $mediaGraphics.Clear([System.Drawing.Color]::FromArgb(235, 243, 255))
    $mediaPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(67, 114, 196), 4)
    $mediaFont = [System.Drawing.Font]::new("Segoe UI", 22, [System.Drawing.FontStyle]::Bold)
    $mediaBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(35, 62, 112))
    try {
      $mediaGraphics.DrawRectangle($mediaPen, 2, 2, 475, 145)
      $mediaGraphics.DrawString("DOCX embedded media", $mediaFont, $mediaBrush, 62, 53)
      $mediaBitmap.Save($mediaStream, [System.Drawing.Imaging.ImageFormat]::Png)
      Add-DocxBytesEntry $docxArchive "word/media/image1.png" $mediaStream.ToArray()
    }
    finally {
      $mediaPen.Dispose()
      $mediaFont.Dispose()
      $mediaBrush.Dispose()
    }
  }
  finally {
    $mediaGraphics.Dispose()
    $mediaBitmap.Dispose()
    $mediaStream.Dispose()
  }
}
finally {
  $docxArchive.Dispose()
}

$wordProducerFixture = Join-Path $workspace "fixtures\docx\producers\microsoft-word-16.docx"
if (-not (Test-Path -LiteralPath $wordProducerFixture -PathType Leaf)) {
  throw "C0-2A Microsoft Word producer fixture is missing"
}
Copy-Item -LiteralPath $wordProducerFixture -Destination (Join-Path $library "C0 Microsoft Word Fixture.docx") -Force

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
