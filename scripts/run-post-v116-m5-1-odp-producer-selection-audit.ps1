param(
  [string]$EvidenceOutput = (Join-Path $PSScriptRoot '..\docs\evidence\post-v116-m5-1-odp-producer-selection\producer-selection.json'),
  [switch]$KeepWorkRoot
)

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evidenceRoot = [IO.Path]::GetFullPath((Join-Path $workspace 'docs\evidence\post-v116-m5-1-odp-producer-selection'))
$EvidenceOutput = [IO.Path]::GetFullPath($EvidenceOutput)
if (-not $EvidenceOutput.StartsWith($evidenceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "M5-1 evidence must stay inside $evidenceRoot"
}

$soffice = @(
  (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'),
  (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $soffice) { throw 'LibreOffice Impress is required for M5-1' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$workRoot = Join-Path ([IO.Path]::GetTempPath()) ('longedit-m5-1-odp-' + [guid]::NewGuid().ToString('N'))
$libreOfficeOdp = Join-Path $workRoot 'libreoffice-m5-1.odp'
$powerPointOdp = Join-Path $workRoot 'powerpoint-m5-1.odp'

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Invoke-LibreOfficeConversion {
  param([string]$InputPath, [string]$OutputDirectory, [string]$Filter, [string]$ProfileId)
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  $profile = Join-Path $workRoot $ProfileId
  New-Item -ItemType Directory -Path $profile -Force | Out-Null
  $profileUri = ([Uri]$profile).AbsoluteUri
  $process = Start-Process -FilePath $soffice -ArgumentList @(
    "-env:UserInstallation=$profileUri", '--headless', '--convert-to', $Filter,
    '--outdir', $OutputDirectory, $InputPath
  ) -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "LibreOffice conversion failed for $InputPath with $($process.ExitCode)" }
}

function New-LibreOfficeOdp {
  $fodpPath = Join-Path $workRoot 'libreoffice-m5-1.fodp'
  $fodp = @'
<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:mimetype="application/vnd.oasis.opendocument.presentation" office:version="1.3">
 <office:styles><style:style style:name="M5Title" style:family="presentation"><style:text-properties fo:font-size="28pt" fo:font-weight="bold"/></style:style><style:style style:name="M5Body" style:family="presentation"><style:text-properties fo:font-size="18pt"/></style:style></office:styles>
 <office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="13.333in" fo:page-height="7.5in"/></style:page-layout><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:automatic-styles>
 <office:body><office:presentation>
  <draw:page draw:name="M5 LO Overview" draw:master-page-name="Default">
   <draw:frame draw:name="M5 LO Title" svg:x="1in" svg:y="0.8in" svg:width="11in" svg:height="1in"><draw:text-box><text:p>M5_LO_TITLE</text:p></draw:text-box></draw:frame>
   <draw:frame draw:name="M5 LO Body" svg:x="1in" svg:y="2.0in" svg:width="8in" svg:height="3in"><draw:text-box><text:p>M5_LO_BODY_A</text:p><text:p>M5_LO_BODY_B</text:p></draw:text-box></draw:frame>
   <presentation:notes><draw:page><draw:frame><draw:text-box><text:p>M5_LO_NOTE</text:p></draw:text-box></draw:frame></draw:page></presentation:notes>
  </draw:page>
  <draw:page draw:name="M5 LO Closure" draw:master-page-name="Default"><draw:frame draw:name="M5 LO Closure Title"><draw:text-box><text:p>M5_LO_CLOSURE</text:p></draw:text-box></draw:frame></draw:page>
 </office:presentation></office:body>
</office:document>
'@
  [IO.File]::WriteAllText($fodpPath, $fodp, [Text.UTF8Encoding]::new($false))
  $output = Join-Path $workRoot 'lo-producer-output'
  Invoke-LibreOfficeConversion $fodpPath $output 'odp:impress8' 'lo-producer-profile'
  Copy-Item -LiteralPath (Join-Path $output 'libreoffice-m5-1.odp') -Destination $libreOfficeOdp
}

function Close-ComObject($Value) {
  if ($null -ne $Value) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) | Out-Null }
}

function New-PowerPointOdp {
  $application = $null
  $presentation = $null
  try {
    $application = New-Object -ComObject PowerPoint.Application
    $application.DisplayAlerts = 1
    $presentation = $application.Presentations.Add()
    $presentation.PageSetup.SlideWidth = 960
    $presentation.PageSetup.SlideHeight = 540
    $slide1 = $presentation.Slides.Add(1, 12)
    $title = $slide1.Shapes.AddTextbox(1, 72, 50, 816, 70)
    $title.Name = 'M5 PPT Title'; $title.TextFrame.TextRange.Text = 'M5_PPT_TITLE'
    $body = $slide1.Shapes.AddTextbox(1, 76, 145, 520, 180)
    $body.Name = 'M5 PPT Body'; $body.TextFrame.TextRange.Text = "M5_PPT_BODY_A`rM5_PPT_BODY_B"
    $shape = $slide1.Shapes.AddShape(5, 650, 170, 190, 110)
    $shape.Name = 'M5 PPT Complex Shape'; $shape.TextFrame.TextRange.Text = 'M5_PPT_SHAPE'
    $slide1.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'M5_PPT_NOTE'
    $slide2 = $presentation.Slides.Add(2, 12)
    $closure = $slide2.Shapes.AddTextbox(1, 72, 50, 816, 70)
    $closure.Name = 'M5 PPT Closure'; $closure.TextFrame.TextRange.Text = 'M5_PPT_CLOSURE'
    $presentation.SaveAs($powerPointOdp, 35)
    return [string]$application.Version
  }
  finally {
    if ($presentation) { try { $presentation.Close() } catch {}; Close-ComObject $presentation }
    if ($application) { try { $application.Quit() } catch {}; Close-ComObject $application }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
}

function Get-OdpInventory([string]$Path, [string[]]$ExpectedMarkers) {
  $archive = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $archive.GetEntry('content.xml')
    if (-not $entry) { throw "$Path has no content.xml" }
    $reader = [IO.StreamReader]::new($entry.Open(), [Text.Encoding]::UTF8)
    try { $xmlText = $reader.ReadToEnd() } finally { $reader.Dispose() }
    [xml]$xml = $xmlText
    $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('draw', 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0')
    $ns.AddNamespace('presentation', 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0')
    $ns.AddNamespace('text', 'urn:oasis:names:tc:opendocument:xmlns:text:1.0')
    $pages = @($xml.SelectNodes('//draw:page[not(ancestor::presentation:notes)]', $ns))
    $simpleParagraphs = @($xml.SelectNodes('//draw:page[not(ancestor::presentation:notes)]/draw:frame/draw:text-box/text:p', $ns) | ForEach-Object { $_.InnerText })
    $complexShapeParagraphs = @($xml.SelectNodes('//draw:page[not(ancestor::presentation:notes)]/draw:custom-shape//text:p', $ns) | ForEach-Object { $_.InnerText })
    $notes = @($xml.SelectNodes('//presentation:notes//text:p', $ns) | ForEach-Object { $_.InnerText })
    $missing = @($ExpectedMarkers | Where-Object { -not $xmlText.Contains($_) })
    return [ordered]@{
      bytes = (Get-Item -LiteralPath $Path).Length
      sha256 = Get-Sha256 $Path
      zipEntries = $archive.Entries.Count
      slideCount = $pages.Count
      simpleParagraphCount = $simpleParagraphs.Count
      simpleParagraphs = $simpleParagraphs
      complexShapeParagraphCount = $complexShapeParagraphs.Count
      complexShapeParagraphs = $complexShapeParagraphs
      notesParagraphCount = $notes.Count
      notes = $notes
      expectedMarkerCount = $ExpectedMarkers.Count
      missingMarkers = $missing
    }
  }
  finally { $archive.Dispose() }
}

function Test-PowerPointReopen([string]$Path, [string[]]$ExpectedBodyMarkers, [string]$ExpectedNoteMarker) {
  $application = $null
  $presentation = $null
  try {
    $application = New-Object -ComObject PowerPoint.Application
    $application.DisplayAlerts = 1
    $presentation = $application.Presentations.Open($Path, -1, -1, 0)
    $bodyText = New-Object Text.StringBuilder
    $noteText = New-Object Text.StringBuilder
    $shapeInventory = @()
    foreach ($slide in $presentation.Slides) {
      foreach ($shape in $slide.Shapes) {
        $shapeText = ''
        try { if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) { $shapeText = [string]$shape.TextFrame.TextRange.Text; [void]$bodyText.AppendLine($shapeText) } } catch {}
        $shapeInventory += [ordered]@{ slide = [int]$slide.SlideIndex; name = [string]$shape.Name; type = [int]$shape.Type; hasTextFrame = [int]$shape.HasTextFrame; text = $shapeText }
      }
      foreach ($shape in $slide.NotesPage.Shapes) {
        try { if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) { [void]$noteText.AppendLine([string]$shape.TextFrame.TextRange.Text) } } catch {}
      }
    }
    return [ordered]@{
      version = [string]$application.Version
      slideCount = $presentation.Slides.Count
      bodyMarkersRecovered = @($ExpectedBodyMarkers | Where-Object { $bodyText.ToString().Contains($_) })
      bodyMarkersMissing = @($ExpectedBodyMarkers | Where-Object { -not $bodyText.ToString().Contains($_) })
      noteRecovered = $noteText.ToString().Contains($ExpectedNoteMarker)
      shapes = $shapeInventory
    }
  }
  finally {
    if ($presentation) { try { $presentation.Close() } catch {}; Close-ComObject $presentation }
    if ($application) { try { $application.Quit() } catch {}; Close-ComObject $application }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
}

function Test-LibreOfficeReopen([string]$Path, [string]$Id) {
  $output = Join-Path $workRoot ("$Id-pdf")
  $before = Get-Sha256 $Path
  Invoke-LibreOfficeConversion $Path $output 'pdf:impress_pdf_Export' ("$Id-reopen-profile")
  $pdf = Join-Path $output (([IO.Path]::GetFileNameWithoutExtension($Path)) + '.pdf')
  if (-not (Test-Path -LiteralPath $pdf -PathType Leaf) -or (Get-Item $pdf).Length -lt 1000) { throw "LibreOffice did not render $Path" }
  return [ordered]@{ pdfBytes = (Get-Item $pdf).Length; sourceUnchanged = $before -eq (Get-Sha256 $Path) }
}

try {
  New-Item -ItemType Directory -Path $workRoot -Force | Out-Null
  New-LibreOfficeOdp
  $powerPointProducerVersion = New-PowerPointOdp
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  $loBody = @('M5_LO_TITLE', 'M5_LO_BODY_A', 'M5_LO_BODY_B', 'M5_LO_CLOSURE')
  $pptBody = @('M5_PPT_TITLE', 'M5_PPT_BODY_A', 'M5_PPT_BODY_B', 'M5_PPT_CLOSURE')
  $loInventory = Get-OdpInventory $libreOfficeOdp ($loBody + @('M5_LO_NOTE'))
  $pptInventory = Get-OdpInventory $powerPointOdp ($pptBody + @('M5_PPT_SHAPE', 'M5_PPT_NOTE'))
  $loPowerPoint = Test-PowerPointReopen $libreOfficeOdp $loBody 'M5_LO_NOTE'
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  $pptPowerPoint = Test-PowerPointReopen $powerPointOdp $pptBody 'M5_PPT_NOTE'
  $loLibreOffice = Test-LibreOfficeReopen $libreOfficeOdp 'lo'
  $pptLibreOffice = Test-LibreOfficeReopen $powerPointOdp 'ppt'
  $wpsStatus = try {
    $wps = New-Object -ComObject KWPP.Application
    $build = [string]$wps.Build
    try { $wps.Quit() } catch {}
    Close-ComObject $wps
    [ordered]@{ status = 'available-not-required'; build = $build; reason = 'M5-1 freezes the required matrix to LibreOffice and PowerPoint; WPS ODP generation is a later optional producer expansion.' }
  } catch {
    [ordered]@{ status = 'unavailable'; build = $null; reason = $_.Exception.Message }
  }
  $simpleBodyStable = $loInventory.missingMarkers.Count -eq 1 -and $loInventory.missingMarkers[0] -eq 'M5_LO_NOTE' `
    -and $pptInventory.missingMarkers.Count -eq 0 `
    -and $loPowerPoint.bodyMarkersMissing.Count -eq 0 -and $pptPowerPoint.bodyMarkersMissing.Count -eq 0 `
    -and $loLibreOffice.sourceUnchanged -and $pptLibreOffice.sourceUnchanged
  $report = [ordered]@{
    schemaVersion = 1; stage = 'M5-1'; status = if ($simpleBodyStable) { 'accepted' } else { 'rejected' }
    capturedAt = [DateTime]::UtcNow.ToString('o')
    expected = [ordered]@{ requiredProducers = @('libreoffice-impress','microsoft-powerpoint'); slideCountPerFixture = 2; simpleBodyMarkersPerFixture = 4; notesPreservedByBoth = $true; sourceUnchanged = $true }
    actual = [ordered]@{
      producers = [ordered]@{ libreOffice = ([string](& $soffice '--version')).Trim(); powerPoint = $powerPointProducerVersion; wps = $wpsStatus }
      outputs = @(
        [ordered]@{ producer = 'libreoffice-impress'; inventory = $loInventory; powerPointReopen = $loPowerPoint; libreOfficeReopen = $loLibreOffice },
        [ordered]@{ producer = 'microsoft-powerpoint'; inventory = $pptInventory; powerPointReopen = $pptPowerPoint; libreOfficeReopen = $pptLibreOffice }
      )
      requiredMatrixPassed = $simpleBodyStable
      simpleBodyTextStable = $simpleBodyStable
      notesPreservedByBoth = $loInventory.notes.Contains('M5_LO_NOTE') -and $pptInventory.notes.Contains('M5_PPT_NOTE')
    }
    differences = @(
      [ordered]@{ expected = 'Removing the hand-authored presentation style is sufficient to make the LibreOffice fixture cross-producer readable.'; actual = 'The styled and unstyled runs both retained 4/4 markers in XML and LibreOffice rendering, while PowerPoint recovered only the closure marker; the style hypothesis was disproved.'; correction = 'Isolate other slide-level object classes before selecting the minimum common baseline.' },
      [ordered]@{ expected = 'Both producers preserve simple body text and presenter notes.'; actual = if ($loInventory.notes.Contains('M5_LO_NOTE')) { 'Both body text and notes survived.' } else { 'Both producers preserved simple body text, but LibreOffice dropped M5_LO_NOTE during FODP to ODP generation.' }; correction = 'Select only direct draw:frame/draw:text-box/text:p body text; keep all presenter notes read-only.' },
      [ordered]@{ expected = 'A slide containing a LibreOffice custom shape remains safely readable in PowerPoint.'; actual = 'The diagnostic fixture with a LibreOffice custom shape caused PowerPoint to expose zero shapes from that slide, while the closure-only slide remained readable. The corrected LibreOffice baseline contains no custom shape; the PowerPoint producer fixture still inventories one complex shape separately.'; correction = 'Treat any slide containing draw:custom-shape or another complex object as blocked for M5-2; only direct-frame text on otherwise simple slides can advance.' }
    )
    decision = [ordered]@{
      selectedNextStage = if ($simpleBodyStable) { 'M5-2-odp-simple-slide-body-reliable-copy-foundation' } else { 'return-to-scope-selection' }
      editableCandidate = 'direct-draw-frame-text-box-text-paragraph-on-simple-slide'
      presenterNotesReadOnly = $true; slidesWithCustomShapesBlocked = $true; listsFieldsMediaAnimationsMastersReadOnly = $true
      productCodeChanged = $false; binaryVersionChanged = $false; releaseCandidate = $false
    }
    attemptHistory = @(
      [ordered]@{ attempt = 1; status = 'failed-before-output'; expected = 'PowerPoint accepts integer 0 for DisplayAlerts'; actual = 'the COM property was a strict PpAlertLevel enum'; correction = 'use ppAlertsNone value 1' },
      [ordered]@{ attempt = 2; status = 'rejected'; expected = 'custom presentation style text is cross-producer visible'; actual = 'PowerPoint recovered 1/4 LibreOffice body markers although XML and LibreOffice render contained 4/4'; correction = 'remove the hand-authored custom presentation style from the minimum common fixture' },
      [ordered]@{ attempt = 3; status = 'rejected'; expected = 'removing the custom presentation style restores 4/4 cross-producer visibility'; actual = 'PowerPoint still recovered only 1/4 LibreOffice body markers; shape inventory showed the entire custom-shape-bearing slide had zero imported shapes'; correction = 'remove the custom shape from the simple-slide baseline and block complex-object slides' },
      [ordered]@{ attempt = 4; status = if ($simpleBodyStable) { 'accepted' } else { 'rejected' }; expected = 'direct frame body text on slides without complex objects is 4/4 cross-producer stable'; actual = if ($simpleBodyStable) { '4/4 LibreOffice and 4/4 PowerPoint body markers were recovered; LibreOffice notes remain excluded and complex-object slides are blocked' } else { 'the simple-slide direct-frame matrix still failed' }; correction = if ($simpleBodyStable) { 'freeze the simple-slide direct-frame paragraph object class' } else { 'return to scope selection' } }
    )
    privacy = [ordered]@{ projectAuthoredContent = $true; rawProducerOutputsCommitted = $false; localAbsolutePathsIncluded = $false; userContentIncluded = $false }
  }
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($EvidenceOutput)) -Force | Out-Null
  [IO.File]::WriteAllText($EvidenceOutput, ($report | ConvertTo-Json -Depth 12) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  if (-not $simpleBodyStable) { throw "M5-1 simple ODP body text matrix did not meet the frozen acceptance boundary; inspect $EvidenceOutput" }
  Write-Output "M5-1 ODP producer selection accepted: $EvidenceOutput"
}
finally {
  if ($KeepWorkRoot) { Write-Output "M5-1 retained temporary work root: $workRoot" }
  elseif (Test-Path -LiteralPath $workRoot) { Remove-Item -LiteralPath $workRoot -Recurse -Force }
}
