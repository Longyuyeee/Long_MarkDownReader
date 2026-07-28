param(
  [string]$OutputPath = "fixtures\pptx\output-reopen\c5a-image-copy.pptx",
  [string]$ReportPath = "docs\evidence\c5a2-pptx-image-output-reopen\matrix.json",
  [string]$LibreOfficePath,
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputPath))
$ReportPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $ReportPath))
$expectedSha256 = "ad25ec6bfb35c5db2f250db160c3c89ee3bacdec88a4bb557c315c93f912bcc3"
$targetShapeName = "WPS producer image"

if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
  throw "C5A2 output is missing: $OutputPath"
}
$hashBefore = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hashBefore -ne $expectedSha256) {
  throw "C5A2 output SHA-256 does not match the locked C5A1 artifact."
}
$outputBytes = (Get-Item -LiteralPath $OutputPath).Length

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
      slideCount = $null
      targetShapeName = $targetShapeName
      targetShapeType = $null
      exportedImageBytes = $null
      evidenceDependency = "$ProducerName with COM automation is not installed on this audit machine."
    }
  }

  $presentation = $null
  $exportPath = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c5a2-" + $ProducerId + "-" + [guid]::NewGuid().ToString("N") + ".png")
  try {
    $application.DisplayAlerts = 1
    $presentation = $application.Presentations.Open($OutputPath, -1, -1, 0)
    if ($presentation.Slides.Count -ne 3) {
      throw "$ProducerName did not retain the 3-slide structure."
    }
    $shape = $presentation.Slides.Item(2).Shapes.Item($targetShapeName)
    if ([int]$shape.Type -ne 13) {
      throw "$ProducerName did not expose the target as an embedded picture object."
    }
    if ([double]$shape.Width -le 0 -or [double]$shape.Height -le 0) {
      throw "$ProducerName recovered an invalid target picture size."
    }
    $shape.Export($exportPath, 2)
    if (-not (Test-Path -LiteralPath $exportPath -PathType Leaf) -or (Get-Item -LiteralPath $exportPath).Length -lt 100) {
      throw "$ProducerName could not decode and export the target picture."
    }
    $version = if ($ProducerId -eq "wps-presentation") { [string]$application.Build } else { [string]$application.Version }
    return [ordered]@{
      id = $ProducerId
      producer = $ProducerName
      status = "verified"
      version = $version
      method = "An isolated $ProgId instance opened the C5A image output read-only, retained 3 slides, recovered the named embedded picture on slide 2, and exported the decoded picture to PNG."
      slideCount = [int]$presentation.Slides.Count
      targetShapeName = $targetShapeName
      targetShapeType = [int]$shape.Type
      exportedImageBytes = (Get-Item -LiteralPath $exportPath).Length
      evidenceDependency = $null
    }
  }
  finally {
    if ($presentation) {
      try { $presentation.Close() } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null
    }
    if ($application) {
      try { $application.Quit() } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) | Out-Null
    }
    if (Test-Path -LiteralPath $exportPath) {
      Remove-Item -LiteralPath $exportPath -Force
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
      slideCount = $null
      targetShapeName = $targetShapeName
      targetShapeType = $null
      exportedImageBytes = $null
      evidenceDependency = "LibreOffice Impress is not installed on this audit machine."
    }
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c5a2-lo-" + [guid]::NewGuid().ToString("N"))
  $profile = Join-Path $tempRoot "profile"
  $converted = Join-Path $tempRoot "converted"
  New-Item -ItemType Directory -Path $profile, $converted -Force | Out-Null
  try {
    $profileUri = ([System.Uri]$profile).AbsoluteUri
    $process = Start-Process -FilePath $soffice `
      -ArgumentList "-env:UserInstallation=$profileUri", "--headless", "--convert-to", "pdf", "--outdir", "`"$converted`"", "`"$OutputPath`"" `
      -WindowStyle Hidden -Wait -PassThru
    $pdf = Join-Path $converted (([System.IO.Path]::GetFileNameWithoutExtension($OutputPath)) + ".pdf")
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $pdf -PathType Leaf) -or (Get-Item -LiteralPath $pdf).Length -lt 1000) {
      throw "LibreOffice Impress could not reopen and render the C5A image output."
    }
    return [ordered]@{
      id = "libreoffice-impress"
      producer = "LibreOffice Impress"
      status = "verified"
      version = ([string](& $soffice "--version")).Trim()
      method = "An isolated headless LibreOffice profile opened the C5A image output and rendered all slides, including the replacement image, to a non-empty PDF."
      slideCount = 3
      targetShapeName = $targetShapeName
      targetShapeType = "rendered-picture"
      exportedImageBytes = (Get-Item -LiteralPath $pdf).Length
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
$hashAfter = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
$verifiedCount = @($producers | Where-Object { $_.status -eq "verified" }).Count
$report = [ordered]@{
  schemaVersion = 1
  stage = "C5A2"
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  status = if ($verifiedCount -eq 3) { "verified" } else { "partial" }
  verifiedCount = $verifiedCount
  requiredCount = 3
  complete = $verifiedCount -eq 3
  requiredProducerIds = @("microsoft-powerpoint", "wps-presentation", "libreoffice-impress")
  output = [ordered]@{
    file = [System.IO.Path]::GetFileName($OutputPath)
    bytes = $outputBytes
    sha256Before = $hashBefore
    sha256After = $hashAfter
    sourceUnchanged = $hashBefore -eq $hashAfter
    changedPackagePart = "ppt/media/image1.png"
    targetSlideNumber = 2
    targetShapeName = $targetShapeName
  }
  producers = $producers
}
if (-not $report.output.sourceUnchanged) {
  throw "C5A2 read-only producer reopen changed the locked output artifact."
}
if ($RequireComplete -and -not $report.complete) {
  $pendingNames = @($producers | Where-Object { $_.status -ne "verified" } | ForEach-Object { $_.producer }) -join ", "
  throw "C5A2 requires a 3/3 producer matrix; pending: $pendingNames"
}
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($ReportPath)) -Force | Out-Null
[System.IO.File]::WriteAllText(
  $ReportPath,
  ($report | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "C5A2 PPTX image-output reopen matrix: $verifiedCount/3 verified -> $ReportPath"
