param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $workspace "fixtures\pptx\producers"
if (-not $OutputPath) {
  $OutputPath = Join-Path $fixtureRoot "libreoffice-impress.pptx"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$fixtureRoot = [System.IO.Path]::GetFullPath($fixtureRoot)
if (-not $OutputPath.StartsWith($fixtureRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "The generated fixture must stay inside $fixtureRoot"
}

$sofficePath = "C:\Program Files\LibreOffice\program\soffice.com"
if (-not (Test-Path -LiteralPath $sofficePath -PathType Leaf)) {
  throw "LibreOffice was not found at $sofficePath"
}

New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c3-impress-" + [guid]::NewGuid().ToString("N"))
$profilePath = Join-Path $tempRoot "profile"
$reopenProfilePath = Join-Path $tempRoot "reopen-profile"
$sourcePath = Join-Path $tempRoot "libreoffice-impress.fodp"
$imagePath = Join-Path $tempRoot "fixture.png"
New-Item -ItemType Directory -Path $tempRoot, $profilePath, $reopenProfilePath -Force | Out-Null

function Invoke-LibreOffice {
  param([string[]]$Arguments, [string]$Profile)
  $profileUri = ([System.Uri]$Profile).AbsoluteUri
  $process = Start-Process -FilePath $sofficePath -ArgumentList (@(
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "-env:UserInstallation=$profileUri"
  ) + $Arguments) -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "LibreOffice exited with code $($process.ExitCode)"
  }
}

Add-Type -AssemblyName System.Drawing
try {
  $bitmap = [System.Drawing.Bitmap]::new(640, 260)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $font = [System.Drawing.Font]::new("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(32, 58, 103))
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(38, 128, 121), 6)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(235, 243, 249))
    $graphics.DrawRectangle($pen, 4, 4, 630, 250)
    $graphics.DrawString("Impress C3A fixture", $font, $brush, 168, 98)
    $bitmap.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $pen.Dispose()
    $brush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  $imageBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($imagePath))
  $fodp = @"
<?xml version="1.0" encoding="UTF-8"?>
<office:document
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
 xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:xlink="http://www.w3.org/1999/xlink"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
 office:mimetype="application/vnd.oasis.opendocument.presentation"
 office:version="1.3">
 <office:meta><dc:title>LongEdit Impress C3A Producer Fixture</dc:title><meta:initial-creator>LongEdit C3A Audit</meta:initial-creator></office:meta>
 <office:styles>
  <style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#f5f7fa"/></style:style>
  <style:style style:name="title" style:family="presentation"><style:text-properties fo:font-size="26pt" fo:font-weight="bold" fo:color="#203a67"/></style:style>
  <style:style style:name="body" style:family="presentation"><style:text-properties fo:font-size="18pt" fo:color="#20242b"/></style:style>
  <style:style style:name="shape" style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="#dbeafe" svg:stroke-color="#2563eb"/></style:style>
 </office:styles>
 <office:automatic-styles>
  <style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="13.333in" fo:page-height="7.5in" style:print-orientation="landscape"/></style:page-layout>
  <style:master-page style:name="Default" style:page-layout-name="pm1" draw:style-name="dp1"/>
 </office:automatic-styles>
 <office:body>
  <office:presentation>
   <draw:page draw:name="Slide 1" draw:style-name="dp1" draw:master-page-name="Default">
    <draw:frame draw:name="Title 1" presentation:style-name="title" svg:x="1in" svg:y="0.7in" svg:width="11.3in" svg:height="0.8in"><draw:text-box><text:p>LibreOffice Impress Producer Fixture</text:p></draw:text-box></draw:frame>
    <draw:frame draw:name="Body 1" presentation:style-name="body" svg:x="1in" svg:y="2in" svg:width="6.7in" svg:height="2.3in"><draw:text-box><text:p>Structured slide reading</text:p><text:p>Search and notes evidence</text:p><text:p>Read-only fidelity boundary</text:p></draw:text-box></draw:frame>
    <draw:rect draw:name="Basic shape" draw:style-name="shape" svg:x="8.5in" svg:y="2.2in" svg:width="2.4in" svg:height="1.4in"><text:p>Basic shape</text:p></draw:rect>
    <presentation:notes><draw:frame draw:name="Notes" svg:x="1in" svg:y="1in" svg:width="8in" svg:height="2in"><draw:text-box><text:p>LibreOffice Impress speaker note evidence.</text:p></draw:text-box></draw:frame></presentation:notes>
   </draw:page>
   <draw:page draw:name="Slide 2" draw:style-name="dp1" draw:master-page-name="Default">
    <draw:frame draw:name="Title 2" presentation:style-name="title" svg:x="1in" svg:y="0.6in" svg:width="11.3in" svg:height="0.8in"><draw:text-box><text:p>Images and relationships</text:p></draw:text-box></draw:frame>
    <draw:frame draw:name="Impress producer image" svg:x="2.2in" svg:y="2in" svg:width="8.9in" svg:height="3.6in"><draw:image draw:mime-type="image/png"><office:binary-data>$imageBase64</office:binary-data></draw:image></draw:frame>
    <presentation:notes><draw:frame draw:name="Notes" svg:x="1in" svg:y="1in" svg:width="8in" svg:height="2in"><draw:text-box><text:p>LibreOffice image relationship evidence.</text:p></draw:text-box></draw:frame></presentation:notes>
   </draw:page>
  </office:presentation>
 </office:body>
</office:document>
"@
  [System.IO.File]::WriteAllText($sourcePath, $fodp, [System.Text.UTF8Encoding]::new($false))
  Invoke-LibreOffice -Profile $profilePath -Arguments @("--convert-to", '"pptx:Impress MS PowerPoint 2007 XML"', "--outdir", $tempRoot, $sourcePath)
  $convertedPath = Join-Path $tempRoot "libreoffice-impress.pptx"
  if (-not (Test-Path -LiteralPath $convertedPath -PathType Leaf)) {
    throw "LibreOffice did not produce the expected PPTX"
  }
  Copy-Item -LiteralPath $convertedPath -Destination $OutputPath -Force
  $reopenDir = Join-Path $tempRoot "reopen"
  New-Item -ItemType Directory -Path $reopenDir -Force | Out-Null
  Invoke-LibreOffice -Profile $reopenProfilePath -Arguments @("--convert-to", "pdf", "--outdir", $reopenDir, $OutputPath)
  if (-not (Test-Path -LiteralPath (Join-Path $reopenDir "libreoffice-impress.pdf") -PathType Leaf)) {
    throw "LibreOffice reopen verification did not export the presentation"
  }
  $version = (Get-Item -LiteralPath $sofficePath).VersionInfo
  $manifest = [ordered]@{
    schemaVersion = 1
    id = "libreoffice-impress"
    file = [System.IO.Path]::GetFileName($OutputPath)
    producer = "LibreOffice Impress"
    productVersion = $version.ProductVersion
    fileVersion = $version.FileVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    generatedBy = "scripts/generate-c3-libreoffice-pptx-fixture.ps1"
    sha256 = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    redistributable = $true
    expected = [ordered]@{
      slideCount = 2
      text = $true
      images = $true
      shapes = $true
      groups = $false
      notes = $true
      animations = $false
      themes = $true
    }
    verification = [ordered]@{
      producerReopen = "verified"
      method = "LibreOffice headless PDF export"
      expectedTitle = "LibreOffice Impress Producer Fixture"
    }
  }
  [System.IO.File]::WriteAllText(
    [System.IO.Path]::ChangeExtension($OutputPath, ".json"),
    ($manifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host "Generated $OutputPath"
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
