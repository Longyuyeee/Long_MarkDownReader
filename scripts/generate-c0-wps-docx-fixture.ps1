param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $workspace "fixtures\docx\producers"
if (-not $OutputPath) {
  $OutputPath = Join-Path $fixtureRoot "wps-writer.docx"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$fixtureRoot = [System.IO.Path]::GetFullPath($fixtureRoot)
if (-not $OutputPath.StartsWith($fixtureRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "The generated fixture must stay inside $fixtureRoot"
}

$wpsCandidates = @(
  "C:\Program Files\WPS Office\*\office6\wps.exe",
  "C:\Program Files (x86)\WPS Office\*\office6\wps.exe",
  (Join-Path $env:LOCALAPPDATA "Kingsoft\WPS Office\*\office6\wps.exe")
)
$wpsPath = Get-ChildItem -Path $wpsCandidates -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $wpsPath -or -not (Test-Path -LiteralPath $wpsPath -PathType Leaf)) {
  throw "WPS Writer was not found in a supported installation location"
}

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$tempImage = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c0-wps-" + [guid]::NewGuid().ToString("N") + ".png")
$wps = $null
$document = $null
$verificationWps = $null
$verificationDocument = $null
$localUserName = ""
$wpsBuild = ""

$bitmap = [System.Drawing.Bitmap]::new(520, 140)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$font = [System.Drawing.Font]::new("Segoe UI", 20, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(35, 62, 112))
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(67, 114, 196), 4)
try {
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $red = 218 + (($x * 19 + $y * 23 + $x * $y) % 32)
      $green = 226 + (($x * 29 + $y * 17 + $x * $y * 3) % 28)
      $blue = 232 + (($x * 11 + $y * 31 + $x * $y * 5) % 24)
      $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($red, $green, $blue))
    }
  }
  $graphics.DrawRectangle($pen, 2, 2, 515, 135)
  $graphics.DrawString("WPS Writer C0-2B fixture", $font, $brush, 76, 49)
  $bitmap.Save($tempImage, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $pen.Dispose()
  $brush.Dispose()
  $font.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

try {
  $wps = New-Object -ComObject KWPS.Application
  $wps.Visible = $false
  $wps.DisplayAlerts = 0
  $localUserName = [string]$wps.UserName
  $wpsBuild = [string]$wps.Build
  $document = $wps.Documents.Add()

  $selection = $wps.Selection
  $selection.Style = -2
  $selection.TypeText("WPS Writer Producer Fixture")
  $selection.TypeParagraph()

  $selection.Style = -1
  $selection.TypeText("This document was created and saved by WPS Writer for LongEdit compatibility auditing.")
  $selection.TypeParagraph()

  $selection.TypeText("Structured reading")
  $selection.Range.ListFormat.ApplyBulletDefault()
  $selection.TypeParagraph()
  $selection.TypeText("Related content and layout")
  $selection.TypeParagraph()
  $selection.Range.ListFormat.RemoveNumbers()

  $table = $document.Tables.Add($selection.Range, 3, 2)
  $table.Cell(1, 1).Range.Text = "Capability"
  $table.Cell(1, 2).Range.Text = "Status"
  $table.Cell(2, 1).Range.Text = "Structured reading"
  $table.Cell(2, 2).Range.Text = "Verified"
  $table.Cell(3, 1).Range.Text = "Related content"
  $table.Cell(3, 2).Range.Text = "Indexed"

  $selection.SetRange($table.Range.End, $table.Range.End)
  $selection.TypeParagraph()
  $selection.TypeText("Before explicit page break.")
  $selection.InsertBreak(7)
  $selection.TypeText("After explicit page break.")
  $selection.TypeParagraph()
  $selection.TypeText("Embedded image")
  $selection.TypeParagraph()
  $selection.InlineShapes.AddPicture($tempImage) | Out-Null
  $selection.TypeParagraph()

  $document.SaveAs2($OutputPath, 16)
  $document.Close()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
  $document = $null
  $wps.Quit()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($wps) | Out-Null
  $wps = $null

  $archive = [System.IO.Compression.ZipFile]::Open(
    $OutputPath,
    [System.IO.Compression.ZipArchiveMode]::Update
  )
  try {
    $updates = @()
    foreach ($entry in @($archive.Entries)) {
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
      $sanitized = [regex]::Replace(
        $content,
        '(<dc:creator>).*?(</dc:creator>)',
        '$1LongEdit C0-2B Audit$2'
      )
      $sanitized = [regex]::Replace(
        $sanitized,
        '(<cp:lastModifiedBy>).*?(</cp:lastModifiedBy>)',
        '$1LongEdit C0-2B Audit$2'
      )
      $sanitized = [regex]::Replace(
        $sanitized,
        '(<Application>WPS Office_([0-9.]+))_[^<]+(</Application>)',
        '$1$3'
      )
      $sanitized = [regex]::Replace($sanitized, 'w:author="[^"]*"', 'w:author="LongEdit C0-2B Audit"')
      $sanitized = [regex]::Replace($sanitized, 'w:initials="[^"]*"', 'w:initials="LE"')
      if ($sanitized -ne $content) {
        $updates += [pscustomobject]@{ Name = $entry.FullName; Content = $sanitized }
        $entry.Delete()
      }
    }
    foreach ($update in $updates) {
      $entry = $archive.CreateEntry(
        $update.Name,
        [System.IO.Compression.CompressionLevel]::Optimal
      )
      $writer = [System.IO.StreamWriter]::new(
        $entry.Open(),
        [System.Text.UTF8Encoding]::new($false)
      )
      try {
        $writer.Write($update.Content)
      }
      finally {
        $writer.Dispose()
      }
    }
  }
  finally {
    $archive.Dispose()
  }

  $archive = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
  try {
    $creatorVerified = $false
    $identityCandidates = @(
      $env:USERNAME,
      $env:USERPROFILE,
      $localUserName,
      $tempImage
    ) |
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
          $content.Contains("<dc:creator>LongEdit C0-2B Audit</dc:creator>")) {
        $creatorVerified = $true
      }
      if ($entry.FullName.EndsWith(".rels") -and $content.Contains('TargetMode="External"')) {
        throw "WPS fixture contains an external package relationship in $($entry.FullName)"
      }
      foreach ($candidate in $identityCandidates) {
        if ($content.IndexOf($candidate, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
          throw "WPS fixture leaked a local identity or temporary path in $($entry.FullName)"
        }
      }
    }
    if (-not $creatorVerified) {
      throw "WPS fixture does not contain the project audit creator identity"
    }
  }
  finally {
    $archive.Dispose()
  }

  $verificationWps = New-Object -ComObject KWPS.Application
  $verificationWps.Visible = $false
  $verificationWps.DisplayAlerts = 0
  $verificationDocument = $verificationWps.Documents.Open($OutputPath, $false, $true)
  if (-not $verificationDocument.Content.Text.Contains("WPS Writer Producer Fixture")) {
    throw "WPS reopen verification did not recover the expected heading"
  }
  $verificationDocument.Close()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationDocument) | Out-Null
  $verificationDocument = $null
  $verificationWps.Quit()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationWps) | Out-Null
  $verificationWps = $null

  $version = (Get-Item -LiteralPath $wpsPath).VersionInfo
  $productVersion = if ($wpsBuild) { $wpsBuild } else { $version.ProductVersion -replace ",", "." }
  $fileVersion = $version.FileVersion -replace ",", "."
  $hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $metadata = [ordered]@{
    schemaVersion = 1
    id = "wps-writer"
    file = [System.IO.Path]::GetFileName($OutputPath)
    producer = "WPS Writer"
    productVersion = $productVersion
    fileVersion = $fileVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    generator = "scripts/generate-c0-wps-docx-fixture.ps1"
    privacyNormalization = "After WPS saved the package, local author fields were replaced with the project audit identity and the installation-specific suffix was removed from the WPS application marker; the final package was scanned for local paths and external relationships."
    producerReopenVerified = $true
    sha256 = $hash
    redistribution = "Project-authored text and image generated locally; safe to redistribute with this repository."
    expected = [ordered]@{
      heading = "WPS Writer Producer Fixture"
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
  $manifestPath = Join-Path $fixtureRoot "wps-writer.json"
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($metadata | ConvertTo-Json -Depth 5) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Output "Generated $OutputPath"
  Write-Output "WPS build: $productVersion"
  Write-Output "SHA-256 $hash"
}
finally {
  if ($verificationDocument) {
    try { $verificationDocument.Close(0) } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationDocument) | Out-Null
  }
  if ($verificationWps) {
    try { $verificationWps.Quit() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationWps) | Out-Null
  }
  if ($document) {
    try { $document.Close(0) } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
  }
  if ($wps) {
    try { $wps.Quit() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($wps) | Out-Null
  }
  if (Test-Path -LiteralPath $tempImage) {
    Remove-Item -LiteralPath $tempImage -Force
  }
}
