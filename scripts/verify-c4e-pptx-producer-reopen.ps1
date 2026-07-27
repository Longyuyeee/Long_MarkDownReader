param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,
  [Parameter(Mandatory = $true)]
  [string]$ReportPath,
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$ReportPath = [System.IO.Path]::GetFullPath($ReportPath)
$expectedFiles = [ordered]@{
  text = "c4e-text-copy.pptx"
  style = "c4e-style-copy.pptx"
  imageAltText = "c4e-alt-text-copy.pptx"
}
foreach ($file in $expectedFiles.Values) {
  $candidate = Join-Path $OutputDirectory $file
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "C4E output is missing: $candidate"
  }
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
      evidenceDependency = "$ProducerName with COM automation is not installed on this audit machine."
    }
  }
  $presentations = @()
  try {
    $application.DisplayAlerts = 0
    $textPresentation = $application.Presentations.Open((Join-Path $OutputDirectory $expectedFiles.text), -1, -1, 0)
    $presentations += $textPresentation
    if ($textPresentation.Slides.Count -ne 3) { throw "$ProducerName text output did not retain 3 slides" }
    $text = [string]$textPresentation.Slides.Item(1).Shapes.Item("WPS C3D Title").TextFrame.TextRange.Text
    if ($text -ne "LongEdit C4E WPS Text") { throw "$ProducerName did not recover the C4E text marker" }

    $stylePresentation = $application.Presentations.Open((Join-Path $OutputDirectory $expectedFiles.style), -1, -1, 0)
    $presentations += $stylePresentation
    if ($stylePresentation.Slides.Count -ne 3) { throw "$ProducerName style output did not retain 3 slides" }
    $styleRange = $stylePresentation.Slides.Item(1).Shapes.Item("WPS rounded rectangle").TextFrame.TextRange
    if ([math]::Abs([double]$styleRange.Font.Size - 24) -gt 0.01) { throw "$ProducerName did not recover the 24 pt style" }
    if ([string]$styleRange.Font.Name -ne "Aptos") { throw "$ProducerName did not recover the Aptos font family" }
    if ([int]$styleRange.ParagraphFormat.Alignment -ne 2) { throw "$ProducerName did not recover center alignment" }
    $expectedColor = 47 + (111 * 256) + (237 * 65536)
    if ([int]$styleRange.Font.Color.RGB -ne $expectedColor) { throw "$ProducerName did not recover the #2f6fed font color" }

    $altPresentation = $application.Presentations.Open((Join-Path $OutputDirectory $expectedFiles.imageAltText), -1, -1, 0)
    $presentations += $altPresentation
    if ($altPresentation.Slides.Count -ne 3) { throw "$ProducerName alt-text output did not retain 3 slides" }
    $altText = [string]$altPresentation.Slides.Item(2).Shapes.Item("WPS producer image").AlternativeText
    if ($altText -ne "LongEdit C4E WPS accessible picture") { throw "$ProducerName did not recover the C4E alt-text marker" }

    $version = if ($ProducerId -eq "wps-presentation") { [string]$application.Build } else { [string]$application.Version }
    return [ordered]@{
      id = $ProducerId
      producer = $ProducerName
      status = "verified"
      version = $version
      method = "A new isolated $ProgId instance opened all three outputs read-only and recovered text, 24 pt Aptos #2f6fed centered shape text, picture alt text, and the 3-slide structure."
      evidenceDependency = $null
    }
  }
  finally {
    foreach ($presentation in $presentations) {
      try { $presentation.Close() } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null
    }
    if ($application) {
      try { $application.Quit() } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) | Out-Null
    }
  }
}

function Test-LibreOfficePresentation {
  $candidates = @(
    "C:\Program Files\LibreOffice\program\soffice.com",
    "C:\Program Files\LibreOffice\program\soffice.exe",
    "C:\Program Files (x86)\LibreOffice\program\soffice.com",
    "C:\Program Files (x86)\LibreOffice\program\soffice.exe"
  )
  $soffice = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $soffice) {
    return [ordered]@{
      id = "libreoffice-impress"
      producer = "LibreOffice Impress"
      status = "pending"
      version = $null
      method = $null
      evidenceDependency = "LibreOffice Impress is not installed on this audit machine."
    }
  }
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c4e-lo-" + [guid]::NewGuid().ToString("N"))
  $profile = Join-Path $tempRoot "profile"
  $converted = Join-Path $tempRoot "converted"
  New-Item -ItemType Directory -Path $profile, $converted -Force | Out-Null
  try {
    $profileUri = ([System.Uri]$profile).AbsoluteUri
    foreach ($file in $expectedFiles.Values) {
      $process = Start-Process -FilePath $soffice `
        -ArgumentList "-env:UserInstallation=$profileUri", "--headless", "--convert-to", "pdf", "--outdir", "`"$converted`"", "`"$(Join-Path $OutputDirectory $file)`"" `
        -WindowStyle Hidden -Wait -PassThru
      $pdf = Join-Path $converted (([System.IO.Path]::GetFileNameWithoutExtension($file)) + ".pdf")
      if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $pdf -PathType Leaf) -or (Get-Item $pdf).Length -lt 1000) {
        throw "LibreOffice Impress could not reopen and render $file"
      }
    }
    return [ordered]@{
      id = "libreoffice-impress"
      producer = "LibreOffice Impress"
      status = "verified"
      version = ([string](& $soffice "--version")).Trim()
      method = "An isolated headless LibreOffice profile opened and rendered all three C4E PPTX outputs to non-empty PDF files."
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
$outputs = foreach ($entry in $expectedFiles.GetEnumerator()) {
  $path = Join-Path $OutputDirectory $entry.Value
  [ordered]@{
    operation = $entry.Key
    file = $entry.Value
    sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    bytes = (Get-Item -LiteralPath $path).Length
  }
}
$verifiedCount = @($producers | Where-Object { $_.status -eq "verified" }).Count
$report = [ordered]@{
  schemaVersion = 1
  stage = "C4E"
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  status = if ($verifiedCount -eq 3) { "verified" } else { "partial" }
  verifiedCount = $verifiedCount
  requiredCount = 3
  complete = $verifiedCount -eq 3
  requiredProducerIds = @("microsoft-powerpoint", "wps-presentation", "libreoffice-impress")
  outputs = $outputs
  producers = $producers
}
if ($RequireComplete -and -not $report.complete) {
  $pendingNames = @($producers | Where-Object { $_.status -ne "verified" } | ForEach-Object { $_.producer }) -join ", "
  throw "C4E requires a 3/3 producer matrix; pending: $pendingNames"
}
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($ReportPath)) -Force | Out-Null
[System.IO.File]::WriteAllText(
  $ReportPath,
  ($report | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "C4E PPTX output reopen matrix: $verifiedCount/3 verified -> $ReportPath"
