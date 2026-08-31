param(
  [string]$EvidenceOutput = (Join-Path $PSScriptRoot '..\docs\evidence\post-v116-m5-2-odp-simple-slide-copy\audit.json'),
  [switch]$KeepWorkRoot
)

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evidenceRoot = [IO.Path]::GetFullPath((Join-Path $workspace 'docs\evidence\post-v116-m5-2-odp-simple-slide-copy'))
$EvidenceOutput = [IO.Path]::GetFullPath($EvidenceOutput)
if (-not $EvidenceOutput.StartsWith($evidenceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "M5-2 evidence must stay inside $evidenceRoot"
}
$soffice = @(
  (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'),
  (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $soffice) { throw 'LibreOffice Impress is required for M5-2' }

$workRoot = Join-Path ([IO.Path]::GetTempPath()) ('longedit-m5-2-odp-' + [guid]::NewGuid().ToString('N'))
$loSource = Join-Path $workRoot 'libreoffice-source.odp'
$pptSource = Join-Path $workRoot 'powerpoint-source.odp'
$complexSource = Join-Path $workRoot 'powerpoint-complex-source.odp'
$loOutput = Join-Path $workRoot 'libreoffice-longedit-copy.odp'
$pptOutput = Join-Path $workRoot 'powerpoint-longedit-copy.odp'

function Get-Sha256([string]$Path) {
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Close-ComObject($Value) {
  if ($null -ne $Value) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) | Out-Null }
}

function Invoke-ComCleanup {
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
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

function New-LibreOfficeSource {
  $fodpPath = Join-Path $workRoot 'libreoffice-source.fodp'
  $fodp = @'
<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:mimetype="application/vnd.oasis.opendocument.presentation" office:version="1.3">
 <office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="13.333in" fo:page-height="7.5in"/></style:page-layout><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:automatic-styles>
 <office:body><office:presentation><draw:page draw:name="LibreOffice Simple" draw:master-page-name="Default">
  <draw:frame draw:name="LO Title" svg:x="1in" svg:y="1in" svg:width="10in" svg:height="1in"><draw:text-box><text:p>M5_2_LO_ORIGINAL</text:p></draw:text-box></draw:frame>
  <draw:frame draw:name="LO Stable" svg:x="1in" svg:y="2.5in" svg:width="10in" svg:height="1in"><draw:text-box><text:p>M5_2_LO_STABLE</text:p></draw:text-box></draw:frame>
 </draw:page></office:presentation></office:body>
</office:document>
'@
  [IO.File]::WriteAllText($fodpPath, $fodp, [Text.UTF8Encoding]::new($false))
  $output = Join-Path $workRoot 'lo-source-output'
  Invoke-LibreOfficeConversion $fodpPath $output 'odp:impress8' 'lo-source-profile'
  Copy-Item -LiteralPath (Join-Path $output 'libreoffice-source.odp') -Destination $loSource
}

function New-PowerPointSources {
  $application = $null
  try {
    $application = New-Object -ComObject PowerPoint.Application
    $application.DisplayAlerts = 1
    foreach ($definition in @(
      [ordered]@{ path = $pptSource; original = 'M5_2_PPT_ORIGINAL'; stable = 'M5_2_PPT_STABLE'; complex = $false },
      [ordered]@{ path = $complexSource; original = 'M5_2_COMPLEX_ORIGINAL'; stable = ''; complex = $true }
    )) {
      $presentation = $null
      try {
        $presentation = $application.Presentations.Add()
        $presentation.PageSetup.SlideWidth = 960
        $presentation.PageSetup.SlideHeight = 540
        $slide = $presentation.Slides.Add(1, 12)
        $title = $slide.Shapes.AddTextbox(1, 72, 60, 816, 70)
        $title.Name = 'M5-2 Title'; $title.TextFrame.TextRange.Text = $definition.original
        if ($definition.stable) {
          $body = $slide.Shapes.AddTextbox(1, 72, 170, 816, 100)
          $body.Name = 'M5-2 Stable'; $body.TextFrame.TextRange.Text = $definition.stable
          $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'M5_2_PPT_NOTE'
        }
        if ($definition.complex) {
          $shape = $slide.Shapes.AddShape(5, 620, 170, 190, 110)
          $shape.Name = 'M5-2 Complex'; $shape.TextFrame.TextRange.Text = 'M5_2_COMPLEX_SHAPE'
        }
        $presentation.SaveAs($definition.path, 35)
      }
      finally {
        if ($presentation) { try { $presentation.Close() } catch {}; Close-ComObject $presentation }
      }
    }
    [string]$application.Version
  }
  finally {
    if ($application) { try { $application.Quit() } catch {}; Close-ComObject $application }
    Invoke-ComCleanup
  }
}

function Test-PowerPointReopen {
  param([string]$Path, [string[]]$ExpectedMarkers, [string[]]$RejectedMarkers, [string]$ExpectedNote = '')
  $application = $null
  $presentation = $null
  try {
    $application = New-Object -ComObject PowerPoint.Application
    $application.DisplayAlerts = 1
    $presentation = $application.Presentations.Open($Path, -1, -1, 0)
    $body = New-Object Text.StringBuilder
    $notes = New-Object Text.StringBuilder
    foreach ($slide in $presentation.Slides) {
      foreach ($shape in $slide.Shapes) {
        try { if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) { [void]$body.AppendLine([string]$shape.TextFrame.TextRange.Text) } } catch {}
      }
      foreach ($shape in $slide.NotesPage.Shapes) {
        try { if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) { [void]$notes.AppendLine([string]$shape.TextFrame.TextRange.Text) } } catch {}
      }
    }
    [ordered]@{
      slideCount = [int]$presentation.Slides.Count
      expectedRecovered = @($ExpectedMarkers | Where-Object { $body.ToString().Contains($_) })
      expectedMissing = @($ExpectedMarkers | Where-Object { -not $body.ToString().Contains($_) })
      rejectedStillPresent = @($RejectedMarkers | Where-Object { $body.ToString().Contains($_) })
      noteRecovered = if ($ExpectedNote) { $notes.ToString().Contains($ExpectedNote) } else { $null }
    }
  }
  finally {
    if ($presentation) { try { $presentation.Close() } catch {}; Close-ComObject $presentation }
    if ($application) { try { $application.Quit() } catch {}; Close-ComObject $application }
    Invoke-ComCleanup
  }
}

function Test-LibreOfficeRender([string]$Path, [string]$Id) {
  $output = Join-Path $workRoot "$Id-pdf"
  $before = Get-Sha256 $Path
  Invoke-LibreOfficeConversion $Path $output 'pdf:impress_pdf_Export' "$Id-render-profile"
  $pdf = Join-Path $output (([IO.Path]::GetFileNameWithoutExtension($Path)) + '.pdf')
  if (-not (Test-Path -LiteralPath $pdf -PathType Leaf) -or (Get-Item $pdf).Length -lt 1000) { throw "LibreOffice did not render $Path" }
  [ordered]@{ pdfBytes = (Get-Item $pdf).Length; sourceUnchanged = $before -eq (Get-Sha256 $Path) }
}

try {
  New-Item -ItemType Directory -Path $workRoot -Force | Out-Null
  New-LibreOfficeSource
  $powerPointVersion = New-PowerPointSources
  Invoke-ComCleanup
  $sourceHashes = [ordered]@{ libreOffice = Get-Sha256 $loSource; powerPoint = Get-Sha256 $pptSource; complex = Get-Sha256 $complexSource }

  $env:LONGEDIT_M5_2_LIBREOFFICE_SOURCE = $loSource
  $env:LONGEDIT_M5_2_LIBREOFFICE_OUTPUT = $loOutput
  $env:LONGEDIT_M5_2_POWERPOINT_SOURCE = $pptSource
  $env:LONGEDIT_M5_2_POWERPOINT_OUTPUT = $pptOutput
  $env:LONGEDIT_M5_2_COMPLEX_SOURCE = $complexSource
  $boundaryOutput = (& cargo test --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') 'formats::odf_edit::tests::odp_' -- --nocapture 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "M5-2 bounded Rust tests failed:`n$boundaryOutput" }
  $realOutput = (& cargo test --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') 'commands::odf_content::tests::save_m5_2_real_producer_odp_copies' -- --ignored --nocapture 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "M5-2 real producer Rust test failed:`n$realOutput" }
  $rustPrefix = 'M5_2_RUST_EVIDENCE='
  $rustLine = ($realOutput -split "`r?`n" | Where-Object { $_ -like "*$rustPrefix*" } | Select-Object -First 1)
  if (-not $rustLine) { throw 'M5-2 Rust evidence line is missing' }
  $rustEvidence = ($rustLine.Substring($rustLine.IndexOf($rustPrefix) + $rustPrefix.Length)) | ConvertFrom-Json
  foreach ($item in $rustEvidence) {
    if ($item.saved) { $item.saved.PSObject.Properties.Remove('targetPath') }
  }

  $loPpt = Test-PowerPointReopen $loOutput @('M5_2_LO_REPLACED','M5_2_LO_STABLE') @('M5_2_LO_ORIGINAL')
  $pptPpt = Test-PowerPointReopen $pptOutput @('M5_2_PPT_REPLACED','M5_2_PPT_STABLE') @('M5_2_PPT_ORIGINAL') 'M5_2_PPT_NOTE'
  $loRender = Test-LibreOfficeRender $loOutput 'lo-copy'
  $pptRender = Test-LibreOfficeRender $pptOutput 'ppt-copy'
  $sourceUnchanged = $sourceHashes.libreOffice -eq (Get-Sha256 $loSource) -and $sourceHashes.powerPoint -eq (Get-Sha256 $pptSource) -and $sourceHashes.complex -eq (Get-Sha256 $complexSource)
  $passed = $rustEvidence.Count -eq 3 -and $rustEvidence[0].editableTargetCount -ge 1 -and $rustEvidence[1].editableTargetCount -ge 1 `
    -and $rustEvidence[2].editableTargetCount -eq 0 -and $rustEvidence[2].blockedSlideCount -eq 1 `
    -and $loPpt.expectedMissing.Count -eq 0 -and $loPpt.rejectedStillPresent.Count -eq 0 `
    -and $pptPpt.expectedMissing.Count -eq 0 -and $pptPpt.rejectedStillPresent.Count -eq 0 -and $pptPpt.noteRecovered `
    -and $loRender.sourceUnchanged -and $pptRender.sourceUnchanged -and $sourceUnchanged

  $report = [ordered]@{
    schemaVersion = 1; stage = 'M5-2'; status = if ($passed) { 'accepted' } else { 'rejected' }; capturedAt = [DateTime]::UtcNow.ToString('o')
    expected = [ordered]@{ simpleProducerCopies = 2; replacementRecoveredByPowerPoint = $true; originalMarkerRemoved = $true; complexSlideBlocked = $true; presenterNotePreserved = $true; sourceUnchanged = $true; libreOfficeRender = $true }
    actual = [ordered]@{
      producers = [ordered]@{ libreOffice = ([string](& $soffice '--version')).Trim(); powerPoint = $powerPointVersion }
      rust = [ordered]@{ boundedTestsPassed = $boundaryOutput.Contains('2 passed; 0 failed'); producerEvidence = $rustEvidence }
      copies = @(
        [ordered]@{ producer = 'libreoffice-impress'; sourceBytes = (Get-Item $loSource).Length; sourceSha256 = $sourceHashes.libreOffice; outputBytes = (Get-Item $loOutput).Length; outputSha256 = Get-Sha256 $loOutput; powerPointReopen = $loPpt; libreOfficeReopen = $loRender },
        [ordered]@{ producer = 'microsoft-powerpoint'; sourceBytes = (Get-Item $pptSource).Length; sourceSha256 = $sourceHashes.powerPoint; outputBytes = (Get-Item $pptOutput).Length; outputSha256 = Get-Sha256 $pptOutput; powerPointReopen = $pptPpt; libreOfficeReopen = $pptRender }
      )
      complexProducerSlideBlocked = $rustEvidence[2].blockedSlideCount -eq 1
      sourceUnchanged = $sourceUnchanged
      requiredMatrixPassed = $passed
    }
    differences = @(
      [ordered]@{ expected = 'Escaped ampersand and angle brackets remain valid simple text after patching.'; actual = 'The first unit run rejected the escaped output because XML predefined entities were classified as rich text.'; correction = 'Patch the whole direct paragraph content range and decode only the five predefined XML entities; nested elements remain blocked.' },
      [ordered]@{ expected = 'Skipping only a complex shape is sufficient.'; actual = 'The real PowerPoint complex producer slide inventories zero editable targets and one blocked slide.'; correction = 'Enforce whole-slide rejection whenever a custom shape or another complex object is present.' },
      [ordered]@{ expected = 'A verified in-memory patch is enough for reliable copy.'; actual = 'Both real producer paths also require no-overwrite filesystem creation, byte replay, semantic reopen, independent PowerPoint reopen and LibreOffice rendering.'; correction = 'Keep M5-2 backend-only and require every verification layer before later UI promotion.' }
    )
    decision = [ordered]@{ selectedNextStage = if ($passed) { 'M5-3-odp-simple-slide-body-copy-workspace-and-real-desktop-audit' } else { 'remain-in-M5-2' }; productCodeChanged = $true; uiChanged = $false; binaryVersionChanged = $false; releaseCandidate = $false; odpRegistryPromoted = $false }
    privacy = [ordered]@{ projectAuthoredContent = $true; rawProducerOutputsCommitted = $false; localAbsolutePathsIncluded = $false; userContentIncluded = $false }
  }
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($EvidenceOutput)) -Force | Out-Null
  [IO.File]::WriteAllText($EvidenceOutput, ($report | ConvertTo-Json -Depth 14) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  if (-not $passed) { throw "M5-2 real producer matrix failed; inspect $EvidenceOutput" }
  Write-Output "M5-2 ODP simple-slide reliable copy accepted: $EvidenceOutput"
}
finally {
  foreach ($name in @('LONGEDIT_M5_2_LIBREOFFICE_SOURCE','LONGEDIT_M5_2_LIBREOFFICE_OUTPUT','LONGEDIT_M5_2_POWERPOINT_SOURCE','LONGEDIT_M5_2_POWERPOINT_OUTPUT','LONGEDIT_M5_2_COMPLEX_SOURCE')) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
  if ($KeepWorkRoot) { Write-Output "M5-2 retained temporary work root: $workRoot" }
  elseif (Test-Path -LiteralPath $workRoot) { Remove-Item -LiteralPath $workRoot -Recurse -Force }
}
