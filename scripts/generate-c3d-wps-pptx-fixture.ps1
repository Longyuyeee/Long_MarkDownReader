param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$fixtureRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace "fixtures\pptx\producers"))
if (-not $OutputPath) {
  $OutputPath = Join-Path $fixtureRoot "wps-presentation.pptx"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
if (-not $OutputPath.StartsWith($fixtureRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "The generated fixture must stay inside $fixtureRoot"
}

$wpsCandidates = @(
  "C:\Program Files\Kingsoft\WPS Office\*\office6\wpp.exe",
  "C:\Program Files (x86)\Kingsoft\WPS Office\*\office6\wpp.exe",
  (Join-Path $env:LOCALAPPDATA "Kingsoft\WPS Office\*\office6\wpp.exe")
)
$wpsPath = Get-ChildItem -Path $wpsCandidates -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $wpsPath -or -not (Test-Path -LiteralPath $wpsPath -PathType Leaf)) {
  throw "WPS Presentation was not found in a supported installation location"
}

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$tempImage = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-c3d-wps-" + [guid]::NewGuid().ToString("N") + ".png")

$bitmap = [System.Drawing.Bitmap]::new(640, 260)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$font = [System.Drawing.Font]::new("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(35, 62, 112))
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(51, 132, 125), 6)
try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(236, 244, 249))
  $graphics.DrawRectangle($pen, 4, 4, 630, 250)
  $graphics.DrawString("WPS Presentation C3D fixture", $font, $brush, 85, 98)
  $bitmap.Save($tempImage, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $pen.Dispose()
  $brush.Dispose()
  $font.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$wps = $null
$presentation = $null
$verificationWps = $null
$verificationPresentation = $null
$wpsBuild = ""
try {
  $wps = New-Object -ComObject KWPP.Application
  $wps.DisplayAlerts = 0
  $wpsBuild = [string]$wps.Build
  $presentation = $wps.Presentations.Add()
  $presentation.PageSetup.SlideWidth = 960
  $presentation.PageSetup.SlideHeight = 540

  $slide1 = $presentation.Slides.Add(1, 12)
  $title1 = $slide1.Shapes.AddTextbox(1, 72, 52, 816, 70)
  $title1.Name = "WPS C3D Title"
  $title1.TextFrame.TextRange.Text = "WPS Presentation Producer Fixture"
  $title1.TextFrame.TextRange.Font.Size = 30
  $title1.TextFrame.TextRange.Font.Bold = -1
  $body1 = $slide1.Shapes.AddTextbox(1, 76, 150, 500, 160)
  $body1.Name = "WPS C3D Body"
  $body1.TextFrame.TextRange.Text = "Structured slide reading`rSearch and precise positioning`rRead-only compatibility boundary"
  $body1.TextFrame.TextRange.Font.Size = 19
  $shape1 = $slide1.Shapes.AddShape(5, 650, 170, 190, 110)
  $shape1.Name = "WPS rounded rectangle"
  $shape1.TextFrame.TextRange.Text = "WPS shape"
  $shape1.Fill.ForeColor.RGB = 11312000
  $slide1.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "WPS speaker note evidence for slide one."

  $slide2 = $presentation.Slides.Add(2, 12)
  $title2 = $slide2.Shapes.AddTextbox(1, 72, 45, 816, 65)
  $title2.Name = "WPS Image Title"
  $title2.TextFrame.TextRange.Text = "WPS images and relationships"
  $title2.TextFrame.TextRange.Font.Size = 29
  $picture = $slide2.Shapes.AddPicture($tempImage, 0, -1, 125, 145, 710, 288)
  $picture.Name = "WPS producer image"
  $picture.AlternativeText = "WPS C3D embedded image evidence"
  $slide2.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "WPS image relationship and notes evidence."

  $slide3 = $presentation.Slides.Add(3, 12)
  $title3 = $slide3.Shapes.AddTextbox(1, 72, 42, 816, 65)
  $title3.Name = "WPS Object Title"
  $title3.TextFrame.TextRange.Text = "WPS grouped shapes, connector and table"
  $first = $slide3.Shapes.AddShape(1, 120, 150, 180, 100)
  $first.Name = "WPS group rectangle"
  $first.TextFrame.TextRange.Text = "Rectangle"
  $second = $slide3.Shapes.AddShape(9, 365, 140, 130, 130)
  $second.Name = "WPS group oval"
  $second.TextFrame.TextRange.Text = "Oval"
  $slide3.Shapes.Range(@("WPS group rectangle", "WPS group oval")).Group().Name = "WPS grouped shapes"
  $connector = $slide3.Shapes.AddConnector(1, 510, 205, 630, 205)
  $connector.Name = "WPS connector"
  $tableShape = $slide3.Shapes.AddTable(2, 2, 635, 140, 245, 145)
  $tableShape.Name = "WPS capability table"
  $tableShape.Table.Cell(1, 1).Shape.TextFrame.TextRange.Text = "Object"
  $tableShape.Table.Cell(1, 2).Shape.TextFrame.TextRange.Text = "Status"
  $tableShape.Table.Cell(2, 1).Shape.TextFrame.TextRange.Text = "Table"
  $tableShape.Table.Cell(2, 2).Shape.TextFrame.TextRange.Text = "Visible"
  $slide3.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "WPS grouped object and table evidence."

  $presentation.SaveAs($OutputPath, 24)
  $presentation.Close()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null
  $presentation = $null
  $wps.Quit()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($wps) | Out-Null
  $wps = $null

  $archive = [System.IO.Compression.ZipFile]::Open($OutputPath, [System.IO.Compression.ZipArchiveMode]::Update)
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
      $sanitized = [regex]::Replace($content, '(<dc:title>).*?(</dc:title>)', '$1LongEdit WPS Presentation C3D Fixture$2')
      $sanitized = [regex]::Replace($sanitized, '(<dc:creator>).*?(</dc:creator>)', '$1LongEdit C3D Audit$2')
      $sanitized = [regex]::Replace($sanitized, '(<cp:lastModifiedBy>).*?(</cp:lastModifiedBy>)', '$1LongEdit C3D Audit$2')
      $sanitized = [regex]::Replace(
        $sanitized,
        '(<Application>WPS Office_([0-9.]+))_[^<]+(</Application>)',
        '$1$3'
      )
      if ($sanitized -ne $content) {
        $updates += [pscustomobject]@{ Name = $entry.FullName; Content = $sanitized }
        $entry.Delete()
      }
    }
    foreach ($update in $updates) {
      $entry = $archive.CreateEntry($update.Name, [System.IO.Compression.CompressionLevel]::Optimal)
      $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
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
    $identityCandidates = @($env:USERNAME, $env:USERPROFILE, $tempImage) | Where-Object { $_ }
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
      if ($entry.FullName -eq "docProps/core.xml" -and $content.Contains("<dc:creator>LongEdit C3D Audit</dc:creator>")) {
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

  $verificationWps = New-Object -ComObject KWPP.Application
  $verificationWps.DisplayAlerts = 0
  $verificationPresentation = $verificationWps.Presentations.Open($OutputPath, -1, -1, 0)
  if ($verificationPresentation.Slides.Count -ne 3) {
    throw "WPS reopen verification expected 3 slides"
  }
  if (-not $verificationPresentation.Slides.Item(1).Shapes.Item("WPS C3D Title").TextFrame.TextRange.Text.Contains("WPS Presentation Producer Fixture")) {
    throw "WPS reopen verification did not recover the expected title"
  }
  $verificationPresentation.Close()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationPresentation) | Out-Null
  $verificationPresentation = $null
  $verificationWps.Quit()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationWps) | Out-Null
  $verificationWps = $null

  $version = (Get-Item -LiteralPath $wpsPath).VersionInfo
  $productVersion = if ($wpsBuild) { $wpsBuild } else { $version.ProductVersion -replace ",", "." }
  $manifest = [ordered]@{
    schemaVersion = 1
    id = "wps-presentation"
    file = [System.IO.Path]::GetFileName($OutputPath)
    producer = "WPS Presentation"
    productVersion = $productVersion
    fileVersion = $version.FileVersion -replace ",", "."
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    generatedBy = "scripts/generate-c3d-wps-pptx-fixture.ps1"
    sha256 = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    redistributable = $true
    privacyNormalization = "Local author fields and the installation-specific WPS application suffix were replaced after WPS saved the package; the final package was scanned for local paths and external relationships."
    expected = [ordered]@{
      slideCount = 3
      text = $true
      images = $true
      shapes = $true
      groups = $true
      connectors = $true
      tables = $true
      notes = $true
      animations = $false
      themes = $true
    }
    verification = [ordered]@{
      producerReopen = "verified"
      method = "New isolated KWPP.Application instance opened the sanitized PPTX read-only and recovered the expected slide title."
      expectedTitle = "WPS Presentation Producer Fixture"
    }
  }
  $manifestPath = [System.IO.Path]::ChangeExtension($OutputPath, ".json")
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Output "Generated $OutputPath"
  Write-Output "WPS build: $productVersion"
  Write-Output "SHA-256 $($manifest.sha256)"
}
finally {
  if ($verificationPresentation) {
    try { $verificationPresentation.Close() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationPresentation) | Out-Null
  }
  if ($verificationWps) {
    try { $verificationWps.Quit() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationWps) | Out-Null
  }
  if ($presentation) {
    try { $presentation.Close() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null
  }
  if ($wps) {
    try { $wps.Quit() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($wps) | Out-Null
  }
  Remove-Item -LiteralPath $tempImage -Force -ErrorAction SilentlyContinue
}
