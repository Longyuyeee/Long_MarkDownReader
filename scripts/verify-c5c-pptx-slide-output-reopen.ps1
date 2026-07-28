param(
  [string]$OutputDirectory = "fixtures\pptx\output-reopen",
  [string]$ManifestPath = "docs\evidence\c5c-pptx-slide-lifecycle\audit-manifest.json",
  [string]$ReportPath = "docs\evidence\c5c-pptx-slide-output-reopen\matrix.json",
  [string]$LibreOfficePath,
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputDirectory = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$ManifestPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $ManifestPath))
$ReportPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $ReportPath))
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  throw "C5C desktop audit manifest is missing: $ManifestPath"
}
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$expectedOperations = @("add", "copy", "delete", "reorder")
$expectedSlideCounts = @{ add = 4; copy = 4; delete = 2; reorder = 3 }
$artifacts = @()
foreach ($operation in $expectedOperations) {
  $manifestOutput = @($manifest.outputs | Where-Object { $_.operation -eq $operation })
  if ($manifestOutput.Count -ne 1) { throw "C5C manifest must contain exactly one $operation output." }
  $artifactPath = Join-Path $OutputDirectory $manifestOutput[0].file
  if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) { throw "C5C output is missing: $artifactPath" }
  $hashBefore = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hashBefore -ne $manifestOutput[0].sha256) { throw "C5C $operation output SHA-256 does not match the desktop audit." }
  $artifacts += [ordered]@{
    operation = $operation
    file = $manifestOutput[0].file
    path = $artifactPath
    bytes = (Get-Item -LiteralPath $artifactPath).Length
    sha256Before = $hashBefore
  }
}

function Get-SlideText {
  param([Parameter(Mandatory = $true)]$Slide)
  $values = @()
  for ($shapeIndex = 1; $shapeIndex -le $Slide.Shapes.Count; $shapeIndex++) {
    $shape = $Slide.Shapes.Item($shapeIndex)
    try {
      if ($shape.HasTextFrame -ne 0 -and $shape.TextFrame.HasText -ne 0) {
        $text = ([string]$shape.TextFrame.TextRange.Text).Trim()
        if ($text) { $values += $text }
      }
    }
    catch {}
  }
  return ($values -join " | ")
}

function Get-NotesText {
  param([Parameter(Mandatory = $true)]$Slide)
  $values = @()
  try {
    for ($shapeIndex = 1; $shapeIndex -le $Slide.NotesPage.Shapes.Count; $shapeIndex++) {
      $shape = $Slide.NotesPage.Shapes.Item($shapeIndex)
      try {
        if ($shape.HasTextFrame -ne 0 -and $shape.TextFrame.HasText -ne 0) {
          $text = ([string]$shape.TextFrame.TextRange.Text).Trim()
          if ($text -and $text -notmatch "^\d+$") { $values += $text }
        }
      }
      catch {}
    }
  }
  catch {}
  return ($values -join " | ")
}

function Test-ComPresentation {
  param(
    [Parameter(Mandatory = $true)][string]$ProgId,
    [Parameter(Mandatory = $true)][string]$ProducerId,
    [Parameter(Mandatory = $true)][string]$ProducerName
  )
  $application = $null
  try { $application = New-Object -ComObject $ProgId }
  catch {
    return [ordered]@{
      id = $ProducerId; producer = $ProducerName; status = "pending"; version = $null
      method = $null; outputs = @(); evidenceDependency = "$ProducerName with COM automation is not installed on this audit machine."
    }
  }
  try {
    $application.DisplayAlerts = 1
    $results = @()
    foreach ($artifact in $artifacts) {
      $presentation = $null
      try {
        $presentation = $application.Presentations.Open($artifact.path, -1, -1, 0)
        $expectedCount = $expectedSlideCounts[$artifact.operation]
        if ($presentation.Slides.Count -ne $expectedCount) {
          throw "$ProducerName recovered $($presentation.Slides.Count) slides for $($artifact.file), expected $expectedCount."
        }
        $slideText = @()
        $notesText = @()
        for ($slideIndex = 1; $slideIndex -le $presentation.Slides.Count; $slideIndex++) {
          $slide = $presentation.Slides.Item($slideIndex)
          $slideText += Get-SlideText -Slide $slide
          $notesText += Get-NotesText -Slide $slide
        }
        if ($artifact.operation -eq "copy") {
          if ($slideText[0] -ne $slideText[1] -or $notesText[0] -ne $notesText[1] -or -not $notesText[0]) {
            throw "$ProducerName did not preserve copied slide text and notes."
          }
        }
        if ($artifact.operation -eq "reorder" -and $slideText[0] -notmatch "WPS images and relationships") {
          throw "$ProducerName did not preserve the requested C5C slide order."
        }
        $results += [ordered]@{
          operation = $artifact.operation
          file = $artifact.file
          slideCount = [int]$presentation.Slides.Count
          firstSlideText = $slideText[0]
          copiedNotesPreserved = if ($artifact.operation -eq "copy") { $notesText[0] -eq $notesText[1] -and [bool]$notesText[0] } else { $null }
        }
      }
      finally {
        if ($presentation) {
          try { $presentation.Close() } catch {}
          [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null
        }
      }
    }
    $version = if ($ProducerId -eq "wps-presentation") { [string]$application.Build } else { [string]$application.Version }
    return [ordered]@{
      id = $ProducerId
      producer = $ProducerName
      status = "verified"
      version = $version
      method = "An isolated $ProgId instance opened all four C5C outputs read-only, verified slide counts and order, and confirmed copied notes."
      outputs = $results
      evidenceDependency = $null
    }
  }
  finally {
    if ($application) {
      try { $application.Quit() } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) | Out-Null
    }
  }
}

function Test-LibreOfficePresentation {
  $candidates = @(
    $LibreOfficePath,
    "C:\Program Files\LibreOffice\program\soffice.com",
    "C:\Program Files\LibreOffice\program\soffice.exe",
    "C:\Program Files (x86)\LibreOffice\program\soffice.com",
    "C:\Program Files (x86)\LibreOffice\program\soffice.exe"
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $soffice = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  $pdfinfoCandidates = @(
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdfinfo.exe"),
    (Get-Command pdfinfo.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
  $pdfinfo = $pdfinfoCandidates | Select-Object -First 1
  if (-not $soffice -or -not $pdfinfo) {
    return [ordered]@{
      id = "libreoffice-impress"; producer = "LibreOffice Impress"; status = "pending"; version = $null
      method = $null; outputs = @(); evidenceDependency = "LibreOffice Impress and pdfinfo are required on this audit machine."
    }
  }
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c5c-lo-" + [guid]::NewGuid().ToString("N"))
  $profile = Join-Path $tempRoot "profile"
  $converted = Join-Path $tempRoot "converted"
  New-Item -ItemType Directory -Path $profile, $converted -Force | Out-Null
  try {
    $profileUri = ([System.Uri]$profile).AbsoluteUri
    $results = @()
    foreach ($artifact in $artifacts) {
      $process = Start-Process -FilePath $soffice `
        -ArgumentList "-env:UserInstallation=$profileUri", "--headless", "--convert-to", "pdf", "--outdir", "`"$converted`"", "`"$($artifact.path)`"" `
        -WindowStyle Hidden -Wait -PassThru
      $pdf = Join-Path $converted (([System.IO.Path]::GetFileNameWithoutExtension($artifact.path)) + ".pdf")
      if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $pdf -PathType Leaf) -or (Get-Item -LiteralPath $pdf).Length -lt 1000) {
        throw "LibreOffice Impress could not reopen and render $($artifact.file)."
      }
      $info = & $pdfinfo $pdf
      $pageLine = @($info | Where-Object { $_ -match "^Pages:\s+\d+" })[0]
      $pageCount = [int]([regex]::Match($pageLine, "\d+").Value)
      if ($pageCount -ne $expectedSlideCounts[$artifact.operation]) {
        throw "LibreOffice rendered $pageCount pages for $($artifact.file)."
      }
      $results += [ordered]@{
        operation = $artifact.operation
        file = $artifact.file
        slideCount = $pageCount
        renderedPdfBytes = (Get-Item -LiteralPath $pdf).Length
      }
    }
    return [ordered]@{
      id = "libreoffice-impress"
      producer = "LibreOffice Impress"
      status = "verified"
      version = ([string](& $soffice "--version")).Trim()
      method = "An isolated headless LibreOffice profile opened and rendered all four C5C outputs; pdfinfo verified each page count."
      outputs = $results
      evidenceDependency = $null
    }
  }
  finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
  }
}

$producers = @(
  (Test-ComPresentation -ProgId "PowerPoint.Application" -ProducerId "microsoft-powerpoint" -ProducerName "Microsoft PowerPoint"),
  (Test-ComPresentation -ProgId "KWPP.Application" -ProducerId "wps-presentation" -ProducerName "WPS Presentation"),
  (Test-LibreOfficePresentation)
)
$outputEvidence = @()
foreach ($artifact in $artifacts) {
  $hashAfter = (Get-FileHash -LiteralPath $artifact.path -Algorithm SHA256).Hash.ToLowerInvariant()
  $outputEvidence += [ordered]@{
    operation = $artifact.operation; file = $artifact.file; bytes = $artifact.bytes
    sha256Before = $artifact.sha256Before; sha256After = $hashAfter
    sourceUnchanged = $artifact.sha256Before -eq $hashAfter
  }
}
if (@($outputEvidence | Where-Object { -not $_.sourceUnchanged }).Count -ne 0) {
  throw "C5C read-only producer reopen changed one or more output artifacts."
}
$verifiedCount = @($producers | Where-Object { $_.status -eq "verified" }).Count
$report = [ordered]@{
  schemaVersion = 1
  stage = "C5C"
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  status = if ($verifiedCount -eq 3) { "verified" } else { "partial" }
  verifiedCount = $verifiedCount
  requiredCount = 3
  complete = $verifiedCount -eq 3
  requiredProducerIds = @("microsoft-powerpoint", "wps-presentation", "libreoffice-impress")
  operations = $expectedOperations
  outputs = $outputEvidence
  producers = $producers
}
if ($RequireComplete -and -not $report.complete) {
  $pendingNames = @($producers | Where-Object { $_.status -ne "verified" } | ForEach-Object { $_.producer }) -join ", "
  throw "C5C requires a 3/3 producer matrix; pending: $pendingNames"
}
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($ReportPath)) -Force | Out-Null
[System.IO.File]::WriteAllText(
  $ReportPath,
  ($report | ConvertTo-Json -Depth 10) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "C5C PPTX slide-output reopen matrix: $verifiedCount/3 verified -> $ReportPath"
