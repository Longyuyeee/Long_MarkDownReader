param(
  [Parameter(Mandatory = $true)]
  [string]$DocumentPath,
  [Parameter(Mandatory = $true)]
  [string]$ReportPath
)

$ErrorActionPreference = "Stop"
$DocumentPath = [System.IO.Path]::GetFullPath($DocumentPath)
$ReportPath = [System.IO.Path]::GetFullPath($ReportPath)
if (-not (Test-Path -LiteralPath $DocumentPath -PathType Leaf)) {
  throw "C2E saved DOCX is missing: $DocumentPath"
}
$marker = "C2E Desktop Verified Text"
$results = @()

$word = $null
$wordDocument = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $wordDocument = $word.Documents.Open($DocumentPath, $false, $true)
  $text = [string]$wordDocument.Content.Text
  if (-not $text.Contains($marker)) {
    throw "Microsoft Word reopened the file but did not expose the C2E marker"
  }
  $results += [ordered]@{
    id = "microsoft-word-16"
    version = [string]$word.Version
    reopenVerified = $true
  }
}
finally {
  if ($wordDocument) {
    $wordDocument.Close(0)
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($wordDocument) | Out-Null
  }
  if ($word) {
    $word.Quit()
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
  }
}

$wps = $null
$wpsDocument = $null
try {
  $wps = New-Object -ComObject KWPS.Application
  $wps.Visible = $false
  $wps.DisplayAlerts = 0
  $wpsDocument = $wps.Documents.Open($DocumentPath, $false, $true)
  $text = [string]$wpsDocument.Content.Text
  if (-not $text.Contains($marker)) {
    throw "WPS Writer reopened the file but did not expose the C2E marker"
  }
  $results += [ordered]@{
    id = "wps-writer"
    version = [string]$wps.Build
    reopenVerified = $true
  }
}
finally {
  if ($wpsDocument) {
    $wpsDocument.Close(0)
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($wpsDocument) | Out-Null
  }
  if ($wps) {
    $wps.Quit()
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($wps) | Out-Null
  }
}

$sofficePath = "C:\Program Files\LibreOffice\program\soffice.com"
if (-not (Test-Path -LiteralPath $sofficePath -PathType Leaf)) {
  throw "LibreOffice was not found at $sofficePath"
}
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c2e-lo-" + [guid]::NewGuid().ToString("N"))
$profilePath = Join-Path $tempRoot "profile"
$outputPath = Join-Path $tempRoot "output"
New-Item -ItemType Directory -Path $profilePath, $outputPath -Force | Out-Null
try {
  $profileUri = ([System.Uri]$profilePath).AbsoluteUri
  $process = Start-Process -FilePath $sofficePath `
    -ArgumentList "-env:UserInstallation=$profileUri", "--headless", "--convert-to", "txt:Text", "--outdir", "`"$outputPath`"", "`"$DocumentPath`"" `
    -WindowStyle Hidden -Wait -PassThru
  $textPath = Join-Path $outputPath (([System.IO.Path]::GetFileNameWithoutExtension($DocumentPath)) + ".txt")
  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $textPath -PathType Leaf)) {
    throw "LibreOffice could not reopen and export the C2E saved DOCX"
  }
  $text = [System.IO.File]::ReadAllText($textPath)
  if (-not $text.Contains($marker)) {
    throw "LibreOffice reopened the file but did not expose the C2E marker"
  }
  $versionOutput = & $sofficePath "--version"
  $results += [ordered]@{
    id = "libreoffice-writer"
    version = ([string]$versionOutput).Trim()
    reopenVerified = $true
  }
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

$report = [ordered]@{
  schemaVersion = 1
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  status = "verified"
  sourceFile = [System.IO.Path]::GetFileName($DocumentPath)
  sourceSha256 = (Get-FileHash -LiteralPath $DocumentPath -Algorithm SHA256).Hash.ToLowerInvariant()
  sourceMarker = $marker
  producers = $results
}
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($ReportPath)) -Force | Out-Null
[System.IO.File]::WriteAllText(
  $ReportPath,
  ($report | ConvertTo-Json -Depth 5),
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "C2E DOCX producer reopen verified: $ReportPath"
