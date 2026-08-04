param(
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$defaultRoot = Join-Path $workspace "fixtures\docx\hyperlinks"
if (-not $OutputRoot) {
  $OutputRoot = $defaultRoot
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$defaultRoot = [System.IO.Path]::GetFullPath($defaultRoot)
if ($OutputRoot -ne $defaultRoot) {
  throw "UX-33H fixtures must be generated in $defaultRoot"
}

$wordPath = "C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"
$sofficePath = "C:\Program Files\LibreOffice\program\soffice.com"
$wpsPath = Get-ChildItem -Path @(
  "C:\Program Files\WPS Office\*\office6\wps.exe",
  "C:\Program Files (x86)\WPS Office\*\office6\wps.exe",
  (Join-Path $env:LOCALAPPDATA "Kingsoft\WPS Office\*\office6\wps.exe")
) -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName

foreach ($path in @($wordPath, $wpsPath, $sofficePath)) {
  if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "UX-33H requires Microsoft Word, WPS Writer, and LibreOffice Writer"
  }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-ux33h-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$manifests = @()

function Release-ComObject {
  param([object]$Value)
  if ($null -ne $Value -and [Runtime.InteropServices.Marshal]::IsComObject($Value)) {
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) | Out-Null
  }
}

function Add-NativeHyperlinkContent {
  param(
    [object]$Document,
    [object]$Selection,
    [string]$Producer
  )
  $missing = [Type]::Missing
  $Selection.Style = -2
  $Selection.TypeText("$Producer UX33H Hyperlink Fixture")
  $Selection.TypeParagraph()
  $Selection.Style = -1

  $bookmarkStart = $Selection.Start
  $Selection.TypeText("LongEdit bookmark destination")
  $bookmarkEnd = $Selection.Start
  $bookmarkRange = $Document.Range($bookmarkStart, $bookmarkEnd)
  $Document.Bookmarks.Add("LongEditAnchor", $bookmarkRange) | Out-Null
  Release-ComObject $bookmarkRange
  $Selection.TypeParagraph()

  $external = $Document.Hyperlinks.Add(
    $Selection.Range,
    "https://example.com/longedit-ux33h",
    "",
    $missing,
    "$Producer external link",
    $missing
  )
  $Selection.SetRange($external.Range.End, $external.Range.End)
  $Selection.TypeParagraph()

  $internal = $Document.Hyperlinks.Add(
    $Selection.Range,
    "",
    "LongEditAnchor",
    $missing,
    "$Producer internal link",
    $missing
  )
  $Selection.SetRange($internal.Range.End, $internal.Range.End)
  $Selection.TypeParagraph()

  $complex = $Document.Hyperlinks.Add(
    $Selection.Range,
    "https://example.com/longedit-ux33h-complex",
    "",
    $missing,
    "$Producer complex styled link",
    $missing
  )
  $complex.Range.Characters.Item(1).Bold = 1
  $Selection.SetRange($complex.Range.End, $complex.Range.End)
  $Selection.TypeParagraph()

  $Selection.TypeText("Prefix ")
  $mixed = $Document.Hyperlinks.Add(
    $Selection.Range,
    "https://example.com/longedit-ux33h-mixed",
    "",
    $missing,
    "$Producer mixed link",
    $missing
  )
  $Selection.SetRange($mixed.Range.End, $mixed.Range.End)
  $Selection.TypeText(" suffix")
  $Selection.TypeParagraph()

  foreach ($value in @($external, $internal, $complex, $mixed)) {
    Release-ComObject $value
  }
}

function New-ComProducerFixture {
  param(
    [string]$Id,
    [string]$Producer,
    [string]$ProgId,
    [string]$Executable,
    [string]$OutputPath
  )
  $application = $null
  $document = $null
  $oldUserName = ""
  try {
    $application = New-Object -ComObject $ProgId
    $application.Visible = $false
    $application.DisplayAlerts = 0
    try {
      $oldUserName = [string]$application.UserName
      $application.UserName = "LongEdit UX33H Audit"
    } catch {}
    $document = $application.Documents.Add()
    Add-NativeHyperlinkContent -Document $document -Selection $application.Selection -Producer $Producer
    $document.SaveAs2($OutputPath, 16)
    $document.Close(0)
    Release-ComObject $document
    $document = $null
    if ($oldUserName) {
      try { $application.UserName = $oldUserName } catch {}
    }
    $application.Quit()
    Release-ComObject $application
    $application = $null
  }
  finally {
    if ($document) {
      try { $document.Close(0) } catch {}
      Release-ComObject $document
    }
    if ($application) {
      if ($oldUserName) {
        try { $application.UserName = $oldUserName } catch {}
      }
      try { $application.Quit() } catch {}
      Release-ComObject $application
    }
  }

  $verificationApplication = $null
  $verificationDocument = $null
  try {
    $verificationApplication = New-Object -ComObject $ProgId
    $verificationApplication.Visible = $false
    $verificationApplication.DisplayAlerts = 0
    $verificationDocument = $verificationApplication.Documents.Open($OutputPath, $false, $true)
    $text = [string]$verificationDocument.Content.Text
    if (-not $text.Contains("$Producer external link") -or $verificationDocument.Hyperlinks.Count -lt 4) {
      throw "$Producer did not recover the UX-33H links in a new application instance"
    }
    $version = if ($Id -eq "wps-writer") {
      [string]$verificationApplication.Build
    } else {
      [string]$verificationApplication.Version
    }
  }
  finally {
    if ($verificationDocument) {
      try { $verificationDocument.Close(0) } catch {}
      Release-ComObject $verificationDocument
    }
    if ($verificationApplication) {
      try { $verificationApplication.Quit() } catch {}
      Release-ComObject $verificationApplication
    }
  }

  return [ordered]@{
    id = $Id
    producer = $Producer
    executable = $Executable
    version = $version
    file = [System.IO.Path]::GetFileName($OutputPath)
    producerCreated = $true
    producerReopenVerified = $true
    expectedEditableLabels = if ($Id -eq "wps-writer") { 0 } else { 2 }
    expectedReadOnlyLabels = if ($Id -eq "wps-writer") { 4 } else { 2 }
  }
}

function Invoke-LibreOffice {
  param(
    [string[]]$Arguments,
    [string]$Name
  )
  $stdout = Join-Path $tempRoot "$Name.stdout.log"
  $stderr = Join-Path $tempRoot "$Name.stderr.log"
  $process = Start-Process -FilePath $sofficePath -ArgumentList $Arguments `
    -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $output = ((Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue) + "`n" +
    (Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)).Trim()
  if ($process.ExitCode -ne 0) {
    throw "LibreOffice $Name failed with exit code $($process.ExitCode): $output"
  }
  return $output
}

function New-LibreOfficeFixture {
  param([string]$OutputPath)
  $sourcePath = Join-Path $tempRoot "libreoffice-writer-hyperlinks.fodt"
  $profile = Join-Path $tempRoot "lo-create-profile"
  $reopenProfile = Join-Path $tempRoot "lo-reopen-profile"
  $reopenOutput = Join-Path $tempRoot "lo-reopen-output"
  New-Item -ItemType Directory -Path $profile, $reopenProfile, $reopenOutput -Force | Out-Null
  $fodt = @'
<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
  <office:meta><dc:creator>LongEdit UX33H Audit</dc:creator></office:meta>
  <office:styles><style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:styles>
  <office:body><office:text>
    <text:h text:outline-level="1">LibreOffice Writer UX33H Hyperlink Fixture</text:h>
    <text:p><text:bookmark-start text:name="LongEditAnchor"/>LongEdit bookmark destination<text:bookmark-end text:name="LongEditAnchor"/></text:p>
    <text:p><text:a xlink:type="simple" xlink:href="https://example.com/longedit-ux33h">LibreOffice Writer external link</text:a></text:p>
    <text:p><text:a xlink:type="simple" xlink:href="#LongEditAnchor">LibreOffice Writer internal link</text:a></text:p>
    <text:p><text:a xlink:type="simple" xlink:href="https://example.com/longedit-ux33h-complex"><text:span text:style-name="Bold">L</text:span>ibreOffice Writer complex styled link</text:a></text:p>
    <text:p>Prefix <text:a xlink:type="simple" xlink:href="https://example.com/longedit-ux33h-mixed">LibreOffice Writer mixed link</text:a> suffix</text:p>
  </office:text></office:body>
</office:document>
'@
  [System.IO.File]::WriteAllText($sourcePath, $fodt, [System.Text.UTF8Encoding]::new($false))
  $profileUri = ([System.Uri]$profile).AbsoluteUri
  Invoke-LibreOffice -Name "create" -Arguments @(
    "--headless", "--nologo", "--nodefault", "--nofirststartwizard",
    "-env:UserInstallation=$profileUri", "--convert-to", '"docx:Office Open XML Text"',
    "--outdir", $tempRoot, $sourcePath
  ) | Out-Null
  $converted = Join-Path $tempRoot "libreoffice-writer-hyperlinks.docx"
  if (-not (Test-Path -LiteralPath $converted -PathType Leaf)) {
    throw "LibreOffice did not create the UX-33H DOCX"
  }
  Copy-Item -LiteralPath $converted -Destination $OutputPath -Force

  $reopenProfileUri = ([System.Uri]$reopenProfile).AbsoluteUri
  Invoke-LibreOffice -Name "reopen" -Arguments @(
    "--headless", "--nologo", "--nodefault", "--nofirststartwizard",
    "-env:UserInstallation=$reopenProfileUri", "--convert-to", "txt:Text",
    "--outdir", $reopenOutput, $OutputPath
  ) | Out-Null
  $textPath = Join-Path $reopenOutput "libreoffice-writer-hyperlinks.txt"
  if (-not (Test-Path -LiteralPath $textPath -PathType Leaf) -or
      -not [System.IO.File]::ReadAllText($textPath).Contains("LibreOffice Writer external link")) {
    throw "LibreOffice did not recover the UX-33H links in a new profile"
  }
  return [ordered]@{
    id = "libreoffice-writer"
    producer = "LibreOffice Writer"
    executable = $sofficePath
    version = ([string](& $sofficePath "--version")).Trim()
    file = [System.IO.Path]::GetFileName($OutputPath)
    producerCreated = $true
    producerReopenVerified = $true
    expectedEditableLabels = 2
    expectedReadOnlyLabels = 2
  }
}

function Test-HyperlinkPackage {
  param(
    [string]$Path,
    [System.Collections.IDictionary]$Manifest
  )
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $documentEntry = $archive.GetEntry("word/document.xml")
    $relsEntry = $archive.GetEntry("word/_rels/document.xml.rels")
    if (-not $documentEntry -or -not $relsEntry) {
      throw "$($Manifest.producer) package is missing hyperlink OOXML parts"
    }
    $reader = [System.IO.StreamReader]::new($documentEntry.Open(), [System.Text.Encoding]::UTF8)
    try { $documentXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $reader = [System.IO.StreamReader]::new($relsEntry.Open(), [System.Text.Encoding]::UTF8)
    try { $relsXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $hyperlinkCount = [regex]::Matches($documentXml, "<w:hyperlink").Count
    $fieldHyperlinkCount = [regex]::Matches($documentXml, "HYPERLINK").Count
    $linkStructureCount = $hyperlinkCount + $fieldHyperlinkCount
    $externalTargetVerified = $relsXml.Contains("https://example.com/longedit-ux33h") -or
      $documentXml.Contains("https://example.com/longedit-ux33h")
    if (($linkStructureCount -lt 4) -or
        -not $documentXml.Contains("LongEditAnchor") -or
        -not $externalTargetVerified) {
      throw "$($Manifest.producer) package did not retain the expected native hyperlink structures"
    }
    foreach ($candidate in @($env:USERNAME, $env:USERPROFILE, $tempRoot)) {
      if (-not $candidate) { continue }
      foreach ($entry in $archive.Entries | Where-Object {
        $_.FullName.EndsWith(".xml") -or $_.FullName.EndsWith(".rels")
      }) {
        $entryReader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
        try { $entryText = $entryReader.ReadToEnd() } finally { $entryReader.Dispose() }
        if ($entryText.IndexOf($candidate, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
          throw "$($Manifest.producer) package leaked local identity or a temporary path in $($entry.FullName)"
        }
      }
    }
    $Manifest["nativeHyperlinkCount"] = $hyperlinkCount
    $Manifest["fieldHyperlinkCount"] = $fieldHyperlinkCount
    $Manifest["externalTargetVerified"] = $true
    $Manifest["internalAnchorVerified"] = $true
    $Manifest["sha256"] = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    $Manifest["bytes"] = (Get-Item -LiteralPath $Path).Length
  }
  finally {
    $archive.Dispose()
  }
}

try {
  $wordOutput = Join-Path $OutputRoot "microsoft-word-hyperlinks.docx"
  $wpsOutput = Join-Path $OutputRoot "wps-writer-hyperlinks.docx"
  $libreOfficeOutput = Join-Path $OutputRoot "libreoffice-writer-hyperlinks.docx"
  $manifests += New-ComProducerFixture -Id "microsoft-word-16" -Producer "Microsoft Word" `
    -ProgId "Word.Application" -Executable $wordPath -OutputPath $wordOutput
  $manifests += New-ComProducerFixture -Id "wps-writer" -Producer "WPS Writer" `
    -ProgId "KWPS.Application" -Executable $wpsPath -OutputPath $wpsOutput
  $manifests += New-LibreOfficeFixture -OutputPath $libreOfficeOutput

  foreach ($manifest in $manifests) {
    Test-HyperlinkPackage -Path (Join-Path $OutputRoot $manifest.file) -Manifest $manifest
  }
  $matrix = [ordered]@{
    schemaVersion = 1
    stage = "UX-33H"
    status = "verified"
    generatedAt = [DateTime]::UtcNow.ToString("o")
    lifecycle = "producer-created-saved-exited-new-instance-reopened"
    producers = $manifests
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $OutputRoot "matrix.json"),
    ($matrix | ConvertTo-Json -Depth 6) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Output "UX-33H native hyperlink producer matrix generated: $OutputRoot"
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
