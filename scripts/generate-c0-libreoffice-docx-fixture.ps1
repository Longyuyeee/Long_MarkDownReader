param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $workspace "fixtures\docx\producers"
if (-not $OutputPath) {
  $OutputPath = Join-Path $fixtureRoot "libreoffice-writer.docx"
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

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c0-libreoffice-" + [guid]::NewGuid().ToString("N"))
$sourcePath = Join-Path $tempRoot "libreoffice-writer.fodt"
$imagePath = Join-Path $tempRoot "libreoffice-writer.png"
$profilePath = Join-Path $tempRoot "profile"
$reopenPath = Join-Path $tempRoot "reopen"
New-Item -ItemType Directory -Path $tempRoot, $profilePath, $reopenPath -Force | Out-Null

function Invoke-LibreOffice {
  param(
    [string[]]$Arguments,
    [string]$LogPrefix
  )

  $stdoutPath = Join-Path $tempRoot "$LogPrefix.stdout.log"
  $stderrPath = Join-Path $tempRoot "$LogPrefix.stderr.log"
  $process = Start-Process `
    -FilePath $sofficePath `
    -ArgumentList $Arguments `
    -WindowStyle Hidden `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath
  $stdout = if (Test-Path -LiteralPath $stdoutPath) {
    [System.IO.File]::ReadAllText($stdoutPath)
  } else {
    ""
  }
  $stderr = if (Test-Path -LiteralPath $stderrPath) {
    [System.IO.File]::ReadAllText($stderrPath)
  } else {
    ""
  }
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Output = ($stdout + [Environment]::NewLine + $stderr).Trim()
  }
}

try {
  $bitmap = [System.Drawing.Bitmap]::new(520, 140)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $font = [System.Drawing.Font]::new("Segoe UI", 20, [System.Drawing.FontStyle]::Bold)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(35, 62, 112))
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(67, 114, 196), 4)
  try {
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      for ($x = 0; $x -lt $bitmap.Width; $x++) {
        $red = 218 + (($x * 17 + $y * 29 + $x * $y) % 32)
        $green = 226 + (($x * 31 + $y * 13 + $x * $y * 3) % 28)
        $blue = 232 + (($x * 7 + $y * 37 + $x * $y * 5) % 24)
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($red, $green, $blue))
      }
    }
    $graphics.DrawRectangle($pen, 2, 2, 515, 135)
    $graphics.DrawString("LibreOffice Writer C0-2C fixture", $font, $brush, 34, 49)
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
  $flatOdf = @"
<?xml version="1.0" encoding="UTF-8"?>
<office:document
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  office:mimetype="application/vnd.oasis.opendocument.text"
  office:version="1.3">
  <office:meta>
    <dc:title>LibreOffice Writer Producer Fixture</dc:title>
    <meta:initial-creator>LongEdit C0-2C Audit</meta:initial-creator>
    <dc:creator>LongEdit C0-2C Audit</dc:creator>
  </office:meta>
  <office:automatic-styles>
    <style:style style:name="PageBreak" style:family="paragraph">
      <style:paragraph-properties fo:break-before="page"/>
    </style:style>
    <text:list-style style:name="AuditList">
      <text:list-level-style-bullet text:level="1" text:bullet-char="&#x2022;">
        <style:list-level-properties text:space-before="0.25in" text:min-label-width="0.25in"/>
      </text:list-level-style-bullet>
    </text:list-style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      <text:h text:outline-level="1">LibreOffice Writer Producer Fixture</text:h>
      <text:p>This document was created and saved by LibreOffice Writer for LongEdit compatibility auditing.</text:p>
      <text:list text:style-name="AuditList">
        <text:list-item><text:p>Structured reading</text:p></text:list-item>
        <text:list-item><text:p>Related content and layout</text:p></text:list-item>
      </text:list>
      <table:table table:name="CapabilityMatrix">
        <table:table-column table:number-columns-repeated="2"/>
        <table:table-row>
          <table:table-cell office:value-type="string"><text:p>Capability</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>Status</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell office:value-type="string"><text:p>Structured reading</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>Verified</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell office:value-type="string"><text:p>Related content</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>Indexed</text:p></table:table-cell>
        </table:table-row>
      </table:table>
      <text:p>Before explicit page break.</text:p>
      <text:p text:style-name="PageBreak">After explicit page break.</text:p>
      <text:p>Embedded image</text:p>
      <text:p>
        <draw:frame draw:name="AuditImage" text:anchor-type="as-char" svg:width="5.42in" svg:height="1.46in">
          <draw:image draw:mime-type="image/png">
            <office:binary-data>$imageBase64</office:binary-data>
          </draw:image>
        </draw:frame>
      </text:p>
    </office:text>
  </office:body>
</office:document>
"@
  [System.IO.File]::WriteAllText($sourcePath, $flatOdf, [System.Text.UTF8Encoding]::new($false))

  $profileUri = ([System.Uri]$profilePath).AbsoluteUri
  $convert = Invoke-LibreOffice -LogPrefix "convert" -Arguments @(
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "-env:UserInstallation=$profileUri",
    "--convert-to",
    '"docx:Office Open XML Text"',
    "--outdir",
    $tempRoot,
    $sourcePath
  )
  if ($convert.ExitCode -ne 0) {
    throw "LibreOffice DOCX conversion failed with exit code $($convert.ExitCode): $($convert.Output)"
  }
  $convertedPath = Join-Path $tempRoot "libreoffice-writer.docx"
  if (-not (Test-Path -LiteralPath $convertedPath -PathType Leaf)) {
    throw "LibreOffice did not create the expected DOCX: $($convert.Output)"
  }
  Copy-Item -LiteralPath $convertedPath -Destination $OutputPath -Force

  $archive = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
  try {
    $creatorVerified = $false
    $identityCandidates = @($env:USERNAME, $env:USERPROFILE, $tempRoot, $imagePath) |
      Where-Object { $_ }
    foreach ($entry in $archive.Entries) {
      if (-not ($entry.FullName.EndsWith(".xml") -or $entry.FullName.EndsWith(".rels"))) {
        continue
      }
      $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
      try {
        $content = $reader.ReadToEnd()
      }
      finally {
        $reader.Dispose()
      }
      if ($entry.FullName -eq "docProps/core.xml" -and
          $content.Contains("<dc:creator>LongEdit C0-2C Audit</dc:creator>")) {
        $creatorVerified = $true
      }
      if ($entry.FullName.EndsWith(".rels") -and $content.Contains('TargetMode="External"')) {
        throw "LibreOffice fixture contains an external package relationship in $($entry.FullName)"
      }
      foreach ($candidate in $identityCandidates) {
        if ($content.IndexOf($candidate, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
          throw "LibreOffice fixture leaked a local identity or temporary path in $($entry.FullName)"
        }
      }
    }
    if (-not $creatorVerified) {
      throw "LibreOffice fixture does not contain the project audit creator identity"
    }
  }
  finally {
    $archive.Dispose()
  }

  $reopen = Invoke-LibreOffice -LogPrefix "reopen" -Arguments @(
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "-env:UserInstallation=$profileUri",
    "--convert-to",
    "pdf:writer_pdf_Export",
    "--outdir",
    $reopenPath,
    $OutputPath
  )
  if ($reopen.ExitCode -ne 0) {
    throw "LibreOffice reopen verification failed with exit code $($reopen.ExitCode): $($reopen.Output)"
  }
  $reopenedPdf = Join-Path $reopenPath "libreoffice-writer.pdf"
  if (-not (Test-Path -LiteralPath $reopenedPdf -PathType Leaf) -or (Get-Item -LiteralPath $reopenedPdf).Length -lt 1000) {
    throw "LibreOffice reopen verification did not create a non-empty PDF: $($reopen.Output)"
  }

  $version = (Get-Item -LiteralPath $sofficePath).VersionInfo
  $hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $metadata = [ordered]@{
    schemaVersion = 1
    id = "libreoffice-writer"
    file = [System.IO.Path]::GetFileName($OutputPath)
    producer = "LibreOffice Writer"
    productVersion = $version.ProductVersion
    fileVersion = $version.FileVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    generator = "scripts/generate-c0-libreoffice-docx-fixture.ps1"
    privacyNormalization = "The Flat ODF source assigns the project audit identity before Writer export; the final OOXML package is scanned for local usernames, temporary paths, and external relationships."
    producerReopenVerified = $true
    sha256 = $hash
    redistribution = "Project-authored text and image generated locally; safe to redistribute with this repository."
    expected = [ordered]@{
      heading = "LibreOffice Writer Producer Fixture"
      listItems = 2
      tables = 1
      mergedCellsMinimum = 0
      pageBreaksMinimum = 1
      sectionsMinimum = 1
      headersMinimum = 0
      footersMinimum = 0
      footnotes = $false
      endnotes = $false
      comments = $false
      images = 1
    }
  }
  $manifestPath = Join-Path $fixtureRoot "libreoffice-writer.json"
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($metadata | ConvertTo-Json -Depth 5) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Output "Generated $OutputPath"
  Write-Output "LibreOffice reopen PDF bytes: $((Get-Item -LiteralPath $reopenedPdf).Length)"
  Write-Output "SHA-256 $hash"
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
