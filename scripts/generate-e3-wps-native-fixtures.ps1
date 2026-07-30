param(
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot
$fixedOutput = Join-Path $repoRoot "src-tauri\tests\fixtures\wps-native"
if (-not $OutputDirectory) { $OutputDirectory = $fixedOutput }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if ($OutputDirectory -ne [IO.Path]::GetFullPath($fixedOutput)) {
  throw "E3 fixtures must remain in src-tauri\tests\fixtures\wps-native"
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Close-ComObject($value) {
  if ($null -ne $value) {
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($value) } catch {}
  }
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($stream)
    return ([BitConverter]::ToString($hash)).Replace("-", "")
  } finally {
    $stream.Dispose()
  }
}

function Read-ZipText([string]$Path, [string]$EntryName) {
  $archive = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $archive.GetEntry($EntryName)
    if ($null -eq $entry) { throw "Missing ZIP entry $EntryName" }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally {
    $archive.Dispose()
  }
}

function Set-ZipText([IO.Compression.ZipArchive]$Archive, [string]$EntryName, [string]$Text) {
  $entry = $Archive.GetEntry($EntryName)
  if ($null -eq $entry) { throw "Missing ZIP entry $EntryName" }
  $entry.Delete()
  $replacement = $Archive.CreateEntry($EntryName, [IO.Compression.CompressionLevel]::Optimal)
  $writer = [IO.StreamWriter]::new($replacement.Open(), [Text.UTF8Encoding]::new($false))
  try { $writer.Write($Text) } finally { $writer.Dispose() }
}

function Sanitize-ZipMetadata([string]$Path) {
  $archive = [IO.Compression.ZipFile]::Open($Path, [IO.Compression.ZipArchiveMode]::Update)
  try {
    $coreEntry = $archive.GetEntry("docProps/core.xml")
    $reader = [IO.StreamReader]::new($coreEntry.Open())
    try { [xml]$core = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $namespaces = [Xml.XmlNamespaceManager]::new($core.NameTable)
    $namespaces.AddNamespace("dc", "http://purl.org/dc/elements/1.1/")
    $namespaces.AddNamespace("cp", "http://schemas.openxmlformats.org/package/2006/metadata/core-properties")
    foreach ($selector in "//dc:creator", "//cp:lastModifiedBy") {
      $node = $core.SelectSingleNode($selector, $namespaces)
      if ($node) { $node.InnerText = "LongEdit Fixture" }
    }
    Set-ZipText $archive "docProps/core.xml" $core.OuterXml

    $appEntry = $archive.GetEntry("docProps/app.xml")
    if ($appEntry) {
      $appReader = [IO.StreamReader]::new($appEntry.Open())
      try { [xml]$appXml = $appReader.ReadToEnd() } finally { $appReader.Dispose() }
      $application = $appXml.SelectSingleNode("//*[local-name()='Application']")
      if ($application) { $application.InnerText = "WPS Office 12.1.0.26895" }
      Set-ZipText $archive "docProps/app.xml" $appXml.OuterXml
    }

    $customEntry = $archive.GetEntry("docProps/custom.xml")
    if ($customEntry) {
      $customReader = [IO.StreamReader]::new($customEntry.Open())
      try { [xml]$customXml = $customReader.ReadToEnd() } finally { $customReader.Dispose() }
      @($customXml.SelectNodes("//*[local-name()='property' and @name='ICV']")) | ForEach-Object {
        [void]$_.ParentNode.RemoveChild($_)
      }
      Set-ZipText $archive "docProps/custom.xml" $customXml.OuterXml
    }
  } finally {
    $archive.Dispose()
  }
}

function Replace-BytePattern([byte[]]$Bytes, [byte[]]$Pattern, [byte[]]$Replacement) {
  if (-not $Pattern.Length -or $Pattern.Length -ne $Replacement.Length) { return }
  for ($offset = 0; $offset -le $Bytes.Length - $Pattern.Length; $offset++) {
    $matched = $true
    for ($index = 0; $index -lt $Pattern.Length; $index++) {
      if ($Bytes[$offset + $index] -ne $Pattern[$index]) { $matched = $false; break }
    }
    if ($matched) {
      [Array]::Copy($Replacement, 0, $Bytes, $offset, $Replacement.Length)
      $offset += $Pattern.Length - 1
    }
  }
}

function Sanitize-CompoundMetadata([string]$Path, [string[]]$PrivateMarkers) {
  [byte[]]$bytes = [IO.File]::ReadAllBytes($Path)
  foreach ($marker in $PrivateMarkers | Where-Object { $_ }) {
    $utf8 = [Text.Encoding]::UTF8.GetBytes($marker)
    $utf8Replacement = [Text.Encoding]::ASCII.GetBytes(("LongEditFixture" * 8).Substring(0, $utf8.Length))
    Replace-BytePattern $bytes $utf8 $utf8Replacement
    $utf16 = [Text.Encoding]::Unicode.GetBytes($marker)
    $replacementText = ("E3Fixture" * 8).Substring(0, $marker.Length)
    Replace-BytePattern $bytes $utf16 ([Text.Encoding]::Unicode.GetBytes($replacementText))
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

$documentPath = Join-Path $OutputDirectory "longedit-e3-document.wps"
$spreadsheetPath = Join-Path $OutputDirectory "longedit-e3-spreadsheet.et"
$presentationPath = Join-Path $OutputDirectory "longedit-e3-presentation.dps"
Remove-Item -LiteralPath $documentPath,$spreadsheetPath,$presentationPath -Force -ErrorAction SilentlyContinue

$writer = $document = $sheetApp = $workbook = $sheet = $presentationApp = $presentation = $null
$originalUserName = ""
$writerVersion = $sheetVersion = $presentationVersion = ""
try {
  $writer = New-Object -ComObject KWps.Application
  $writer.Visible = $false
  $writer.DisplayAlerts = 0
  $originalUserName = [string]$writer.UserName
  $writer.UserName = "LongEdit Fixture"
  $writerVersion = [string]$writer.Version
  $document = $writer.Documents.Add()
  $document.Content.Text = "LongEdit E3 WPS native document fixture"
  $document.SaveAs($documentPath)
  $document.Close()
  Close-ComObject $document
  $document = $null
  $writer.Quit()
  Close-ComObject $writer
  $writer = $null

  $sheetApp = New-Object -ComObject KET.Application
  $sheetApp.Visible = $false
  $sheetApp.DisplayAlerts = $false
  $sheetVersion = [string]$sheetApp.Version
  $workbook = $sheetApp.Workbooks.Add()
  $sheet = $workbook.Worksheets.Item(1)
  $sheet.Name = "E3 Native"
  $sheet.Cells.Item(1, 1).Value2 = "LongEdit E3 WPS native spreadsheet fixture"
  $sheet.Cells.Item(2, 1).Value2 = 42
  $workbook.SaveAs($spreadsheetPath)
  $workbook.Close($false)
  Close-ComObject $sheet
  Close-ComObject $workbook
  $sheet = $null
  $workbook = $null
  $sheetApp.Quit()
  Close-ComObject $sheetApp
  $sheetApp = $null

  $privateIdentity = ([xml](Read-ZipText $documentPath "docProps/core.xml")).coreProperties.lastModifiedBy
  Sanitize-ZipMetadata $documentPath
  Sanitize-ZipMetadata $spreadsheetPath

  $presentationApp = New-Object -ComObject KWPP.Application
  $presentationApp.DisplayAlerts = 0
  try { $presentationVersion = [string]$presentationApp.Build } catch { $presentationVersion = "unknown" }
  $presentation = $presentationApp.Presentations.Add()
  $slide = $presentation.Slides.Add(1, 1)
  $slide.Shapes.Title.TextFrame.TextRange.Text = "LongEdit E3 WPS native presentation fixture"
  $presentation.SaveAs($presentationPath)
  $presentation.Close()
  Close-ComObject $presentation
  $presentation = $null
  $presentationApp.Quit()
  Close-ComObject $presentationApp
  $presentationApp = $null
  Sanitize-CompoundMetadata $presentationPath @($env:USERNAME, $originalUserName, [string]$privateIdentity)
} finally {
  if ($document) { try { $document.Close() } catch {}; Close-ComObject $document }
  if ($writer) { try { $writer.UserName = $originalUserName } catch {}; try { $writer.Quit() } catch {}; Close-ComObject $writer }
  if ($workbook) { try { $workbook.Close($false) } catch {}; Close-ComObject $workbook }
  if ($sheetApp) { try { $sheetApp.Quit() } catch {}; Close-ComObject $sheetApp }
  if ($presentation) { try { $presentation.Close() } catch {}; Close-ComObject $presentation }
  if ($presentationApp) { try { $presentationApp.Quit() } catch {}; Close-ComObject $presentationApp }
  if ($originalUserName) {
    try {
      $restore = New-Object -ComObject KWps.Application
      $restore.UserName = $originalUserName
      $restore.Quit()
      Close-ComObject $restore
    } catch {}
  }
}

$verifyWriter = $verifyDocument = $verifySheetApp = $verifyWorkbook = $verifyPresentationApp = $verifyPresentation = $null
try {
  $verifyWriter = New-Object -ComObject KWps.Application
  $verifyWriter.Visible = $false
  $verifyWriter.DisplayAlerts = 0
  $verifyDocument = $verifyWriter.Documents.Open($documentPath, $false, $true)
  if (-not ([string]$verifyDocument.Content.Text).Contains("LongEdit E3 WPS native document fixture")) {
    throw "Independent WPS Writer reopen did not recover fixture text"
  }
  $verifyDocument.Close()
  Close-ComObject $verifyDocument
  $verifyDocument = $null
  $verifyWriter.Quit()
  Close-ComObject $verifyWriter
  $verifyWriter = $null

  $verifySheetApp = New-Object -ComObject KET.Application
  $verifySheetApp.Visible = $false
  $verifySheetApp.DisplayAlerts = $false
  $verifyWorkbook = $verifySheetApp.Workbooks.Open($spreadsheetPath, 0, $true)
  if ([string]$verifyWorkbook.Worksheets.Item(1).Cells.Item(1, 1).Value2 -ne "LongEdit E3 WPS native spreadsheet fixture") {
    throw "Independent WPS Spreadsheets reopen did not recover fixture text"
  }
  $verifyWorkbook.Close($false)
  Close-ComObject $verifyWorkbook
  $verifyWorkbook = $null
  $verifySheetApp.Quit()
  Close-ComObject $verifySheetApp
  $verifySheetApp = $null

  $verifyPresentationApp = New-Object -ComObject KWPP.Application
  $verifyPresentationApp.DisplayAlerts = 0
  $verifyPresentation = $verifyPresentationApp.Presentations.Open($presentationPath, -1, -1, 0)
  if (-not ([string]$verifyPresentation.Slides.Item(1).Shapes.Title.TextFrame.TextRange.Text).Contains("LongEdit E3 WPS native presentation fixture")) {
    throw "Independent WPS Presentation reopen did not recover fixture title"
  }
  $verifyPresentation.Close()
  Close-ComObject $verifyPresentation
  $verifyPresentation = $null
  $verifyPresentationApp.Quit()
  Close-ComObject $verifyPresentationApp
  $verifyPresentationApp = $null
} finally {
  if ($verifyDocument) { try { $verifyDocument.Close() } catch {}; Close-ComObject $verifyDocument }
  if ($verifyWriter) { try { $verifyWriter.Quit() } catch {}; Close-ComObject $verifyWriter }
  if ($verifyWorkbook) { try { $verifyWorkbook.Close($false) } catch {}; Close-ComObject $verifyWorkbook }
  if ($verifySheetApp) { try { $verifySheetApp.Quit() } catch {}; Close-ComObject $verifySheetApp }
  if ($verifyPresentation) { try { $verifyPresentation.Close() } catch {}; Close-ComObject $verifyPresentation }
  if ($verifyPresentationApp) { try { $verifyPresentationApp.Quit() } catch {}; Close-ComObject $verifyPresentationApp }
}

$manifest = [ordered]@{
  schemaVersion = 1
  stage = "E3"
  producer = "WPS Office"
  producerVersion = "12.1.0.26895"
  directNativeSave = $true
  independentNativeReopen = $true
  metadataSanitized = $true
  conversionQualified = $false
  files = @(
    [ordered]@{ formatId = "wps-document"; file = "longedit-e3-document.wps"; container = "zip-ooxml-word"; size = (Get-Item $documentPath).Length; sha256 = (Get-Sha256 $documentPath); automationProgId = "KWps.Application"; producerVersion = $writerVersion },
    [ordered]@{ formatId = "wps-spreadsheet"; file = "longedit-e3-spreadsheet.et"; container = "zip-ooxml-spreadsheet"; size = (Get-Item $spreadsheetPath).Length; sha256 = (Get-Sha256 $spreadsheetPath); automationProgId = "KET.Application"; producerVersion = $sheetVersion },
    [ordered]@{ formatId = "wps-presentation"; file = "longedit-e3-presentation.dps"; container = "compound-binary-presentation"; size = (Get-Item $presentationPath).Length; sha256 = (Get-Sha256 $presentationPath); automationProgId = "KWPP.Application"; producerVersion = $presentationVersion }
  )
}
$manifestJson = $manifest | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText(
  (Join-Path $OutputDirectory "manifest.json"),
  $manifestJson,
  [Text.UTF8Encoding]::new($false)
)
Write-Output "E3 WPS native fixtures generated, sanitized, and independently reopened: $OutputDirectory"
