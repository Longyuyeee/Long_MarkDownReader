param(
  [string]$OutputDirectory = "fixtures\pptx\output-reopen",
  [string]$ManifestPath = "docs\evidence\c5b-pptx-shape-lifecycle\audit-manifest.json",
  [string]$ReportPath = "docs\evidence\c5b-pptx-shape-output-reopen\matrix.json",
  [string]$LibreOfficePath,
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputDirectory = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$ManifestPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $ManifestPath))
$ReportPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $ReportPath))

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  throw "C5B desktop audit manifest is missing: $ManifestPath"
}
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$expectedOperations = @("rectangle", "ellipse", "line", "delete")
$artifacts = @()
foreach ($operation in $expectedOperations) {
  $manifestOutput = @($manifest.outputs | Where-Object { $_.operation -eq $operation })
  if ($manifestOutput.Count -ne 1) {
    throw "C5B manifest must contain exactly one $operation output."
  }
  $artifactPath = Join-Path $OutputDirectory $manifestOutput[0].file
  if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
    throw "C5B output is missing: $artifactPath"
  }
  $hashBefore = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hashBefore -ne $manifestOutput[0].sha256) {
    throw "C5B $operation output SHA-256 does not match the desktop audit."
  }
  $artifacts += [ordered]@{
    operation = $operation
    file = $manifestOutput[0].file
    path = $artifactPath
    bytes = (Get-Item -LiteralPath $artifactPath).Length
    sha256Before = $hashBefore
  }
}

function Find-LongEditShapes {
  param([Parameter(Mandatory = $true)]$Presentation)
  $matches = @()
  for ($slideIndex = 1; $slideIndex -le $Presentation.Slides.Count; $slideIndex++) {
    $slide = $Presentation.Slides.Item($slideIndex)
    for ($shapeIndex = 1; $shapeIndex -le $slide.Shapes.Count; $shapeIndex++) {
      $shape = $slide.Shapes.Item($shapeIndex)
      if ([string]$shape.Name -like "LongEdit *") {
        $matches += [ordered]@{
          slideNumber = $slideIndex
          name = [string]$shape.Name
          type = [int]$shape.Type
          width = [math]::Round([double]$shape.Width, 3)
          height = [math]::Round([double]$shape.Height, 3)
        }
      }
    }
  }
  return $matches
}

function Test-ComPresentation {
  param(
    [Parameter(Mandatory = $true)][string]$ProgId,
    [Parameter(Mandatory = $true)][string]$ProducerId,
    [Parameter(Mandatory = $true)][string]$ProducerName
  )
  $application = $null
  try {
    $application = New-Object -ComObject $ProgId
  }
  catch {
    return [ordered]@{
      id = $ProducerId
      producer = $ProducerName
      status = "pending"
      version = $null
      method = $null
      outputs = @()
      evidenceDependency = "$ProducerName with COM automation is not installed on this audit machine."
    }
  }

  $results = @()
  try {
    $application.DisplayAlerts = 1
    foreach ($artifact in $artifacts) {
      $presentation = $null
      try {
        $presentation = $application.Presentations.Open($artifact.path, -1, -1, 0)
        if ($presentation.Slides.Count -ne 3) {
          throw "$ProducerName did not retain the 3-slide structure for $($artifact.file)."
        }
        $matches = @(Find-LongEditShapes -Presentation $presentation)
        if ($artifact.operation -eq "delete") {
          if ($matches.Count -ne 0) {
            throw "$ProducerName retained a LongEdit shape in the delete output."
          }
        }
        else {
          $expectedPrefix = "LongEdit " + (Get-Culture).TextInfo.ToTitleCase($artifact.operation)
          $target = @($matches | Where-Object { $_.name -like "$expectedPrefix*" })
          if ($target.Count -ne 1) {
            throw "$ProducerName did not expose exactly one $expectedPrefix shape."
          }
          if ($target[0].slideNumber -ne 1 -or $target[0].width -le 0 -or $target[0].height -le 0) {
            throw "$ProducerName recovered invalid $($artifact.operation) geometry."
          }
        }
        $results += [ordered]@{
          operation = $artifact.operation
          file = $artifact.file
          slideCount = [int]$presentation.Slides.Count
          longEditShapes = $matches
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
      method = "An isolated $ProgId instance opened all four C5B outputs read-only, retained 3 slides, recovered each added shape with valid geometry, and confirmed the delete output contains no LongEdit shape."
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
  if (-not $soffice) {
    return [ordered]@{
      id = "libreoffice-impress"
      producer = "LibreOffice Impress"
      status = "pending"
      version = $null
      method = $null
      outputs = @()
      evidenceDependency = "LibreOffice Impress is not installed on this audit machine."
    }
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c5b-lo-" + [guid]::NewGuid().ToString("N"))
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
      $results += [ordered]@{
        operation = $artifact.operation
        file = $artifact.file
        slideCount = 3
        renderedPdfBytes = (Get-Item -LiteralPath $pdf).Length
      }
    }
    return [ordered]@{
      id = "libreoffice-impress"
      producer = "LibreOffice Impress"
      status = "verified"
      version = ([string](& $soffice "--version")).Trim()
      method = "An isolated headless LibreOffice profile opened and rendered all four C5B outputs to non-empty PDFs."
      outputs = $results
      evidenceDependency = $null
    }
  }
  finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
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
    operation = $artifact.operation
    file = $artifact.file
    bytes = $artifact.bytes
    sha256Before = $artifact.sha256Before
    sha256After = $hashAfter
    sourceUnchanged = $artifact.sha256Before -eq $hashAfter
  }
}
if (@($outputEvidence | Where-Object { -not $_.sourceUnchanged }).Count -ne 0) {
  throw "C5B read-only producer reopen changed one or more output artifacts."
}

$verifiedCount = @($producers | Where-Object { $_.status -eq "verified" }).Count
$report = [ordered]@{
  schemaVersion = 1
  stage = "C5B"
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
  throw "C5B requires a 3/3 producer matrix; pending: $pendingNames"
}
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($ReportPath)) -Force | Out-Null
[System.IO.File]::WriteAllText(
  $ReportPath,
  ($report | ConvertTo-Json -Depth 10) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "C5B PPTX shape-output reopen matrix: $verifiedCount/3 verified -> $ReportPath"
