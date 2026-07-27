param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $workspace "fixtures\pptx\producers"
if (-not $OutputPath) {
  $OutputPath = Join-Path $fixtureRoot "microsoft-powerpoint-16.pptx"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$fixtureRoot = [System.IO.Path]::GetFullPath($fixtureRoot)
if (-not $OutputPath.StartsWith($fixtureRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "The generated fixture must stay inside $fixtureRoot"
}

$powerPointPath = "C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE"
if (-not (Test-Path -LiteralPath $powerPointPath -PathType Leaf)) {
  throw "Microsoft PowerPoint was not found at $powerPointPath"
}

New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$tempImage = Join-Path ([System.IO.Path]::GetTempPath()) "longedit-c3-powerpoint-fixture.png"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$bitmap = [System.Drawing.Bitmap]::new(640, 260)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$font = [System.Drawing.Font]::new("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(32, 58, 103))
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(38, 128, 121), 6)
try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(235, 243, 249))
  $graphics.DrawRectangle($pen, 4, 4, 630, 250)
  $graphics.DrawString("PowerPoint C3A fixture", $font, $brush, 130, 98)
  $bitmap.Save($tempImage, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $pen.Dispose()
  $brush.Dispose()
  $font.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$powerPoint = $null
$presentation = $null
try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Add()
  $presentation.PageSetup.SlideWidth = 960
  $presentation.PageSetup.SlideHeight = 540

  $slide1 = $presentation.Slides.Add(1, 12)
  $title1 = $slide1.Shapes.AddTextbox(1, 72, 56, 816, 72)
  $title1.Name = "Title C3A"
  $title1.TextFrame.TextRange.Text = "PowerPoint Producer Fixture"
  $title1.TextFrame.TextRange.Font.Size = 30
  $title1.TextFrame.TextRange.Font.Bold = -1
  $body1 = $slide1.Shapes.AddTextbox(1, 76, 150, 500, 150)
  $body1.Name = "Body C3A"
  $body1.TextFrame.TextRange.Text = "Structured slide reading`rSearch and object positioning`rRead-only fidelity boundary"
  $body1.TextFrame.TextRange.Font.Size = 19
  $shape1 = $slide1.Shapes.AddShape(5, 650, 170, 190, 110)
  $shape1.Name = "Rounded rectangle evidence"
  $shape1.TextFrame.TextRange.Text = "Basic shape"
  $shape1.Fill.ForeColor.RGB = 11312000
  $slide1.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "PowerPoint speaker note evidence for slide one."
  try {
    $slide1.TimeLine.MainSequence.AddEffect($shape1, 1) | Out-Null
  }
  catch {
    Write-Warning "Animation evidence could not be added: $($_.Exception.Message)"
  }

  $slide2 = $presentation.Slides.Add(2, 12)
  $title2 = $slide2.Shapes.AddTextbox(1, 72, 45, 816, 65)
  $title2.Name = "Title Images"
  $title2.TextFrame.TextRange.Text = "Images and relationships"
  $title2.TextFrame.TextRange.Font.Size = 29
  $picture = $slide2.Shapes.AddPicture($tempImage, 0, -1, 125, 145, 710, 288)
  $picture.Name = "PowerPoint producer image"
  $picture.AlternativeText = "PowerPoint C3A embedded image evidence"
  $slide2.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "PowerPoint image relationship and notes evidence."

  $slide3 = $presentation.Slides.Add(3, 12)
  $title3 = $slide3.Shapes.AddTextbox(1, 72, 45, 816, 65)
  $title3.Name = "Title Groups"
  $title3.TextFrame.TextRange.Text = "Grouped shapes and theme"
  $first = $slide3.Shapes.AddShape(1, 190, 180, 210, 120)
  $first.Name = "Group rectangle"
  $first.TextFrame.TextRange.Text = "Rectangle"
  $second = $slide3.Shapes.AddShape(9, 500, 180, 160, 160)
  $second.Name = "Group oval"
  $second.TextFrame.TextRange.Text = "Oval"
  $slide3.Shapes.Range(@("Group rectangle", "Group oval")).Group().Name = "C3A grouped shapes"
  $slide3.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "PowerPoint grouped shape evidence."

  $presentation.SaveAs($OutputPath, 24)
  $presentation.Close()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null
  $presentation = $null
  $powerPoint.Quit()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($powerPoint) | Out-Null
  $powerPoint = $null

  $archive = [System.IO.Compression.ZipFile]::Open(
    $OutputPath,
    [System.IO.Compression.ZipArchiveMode]::Update
  )
  try {
    $coreEntry = $archive.GetEntry("docProps/core.xml")
    if (-not $coreEntry) {
      throw "PowerPoint fixture is missing docProps/core.xml"
    }
    $reader = [System.IO.StreamReader]::new($coreEntry.Open(), [System.Text.Encoding]::UTF8)
    try {
      $coreXml = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
    $coreXml = [regex]::Replace($coreXml, '(<dc:title>).*?(</dc:title>)', '$1LongEdit PowerPoint C3A Producer Fixture$2')
    $coreXml = [regex]::Replace($coreXml, '(<dc:creator>).*?(</dc:creator>)', '$1LongEdit C3A Audit$2')
    $coreXml = [regex]::Replace($coreXml, '(<cp:lastModifiedBy>).*?(</cp:lastModifiedBy>)', '$1LongEdit C3A Audit$2')
    $coreEntry.Delete()
    $coreEntry = $archive.CreateEntry(
      "docProps/core.xml",
      [System.IO.Compression.CompressionLevel]::Optimal
    )
    $writer = [System.IO.StreamWriter]::new(
      $coreEntry.Open(),
      [System.Text.UTF8Encoding]::new($false)
    )
    try {
      $writer.Write($coreXml)
    }
    finally {
      $writer.Dispose()
    }
  }
  finally {
    $archive.Dispose()
  }

  $verifyPowerPoint = New-Object -ComObject PowerPoint.Application
  $verifyPresentation = $null
  try {
    $verifyPresentation = $verifyPowerPoint.Presentations.Open($OutputPath, -1, -1, 0)
    if ($verifyPresentation.Slides.Count -ne 3) {
      throw "PowerPoint reopen verification expected 3 slides"
    }
    if (-not $verifyPresentation.Slides.Item(1).Shapes.Item("Title C3A").TextFrame.TextRange.Text.Contains("PowerPoint Producer Fixture")) {
      throw "PowerPoint reopen verification did not recover the expected title"
    }
    $verifyPresentation.Close()
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verifyPresentation) | Out-Null
    $verifyPresentation = $null
    $verifyPowerPoint.Quit()
  }
  finally {
    if ($verifyPresentation) {
      try { $verifyPresentation.Close() } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verifyPresentation) | Out-Null
    }
    if ($verifyPowerPoint) {
      try { $verifyPowerPoint.Quit() } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verifyPowerPoint) | Out-Null
    }
  }

  $version = (Get-Item -LiteralPath $powerPointPath).VersionInfo
  $manifest = [ordered]@{
    schemaVersion = 1
    id = "microsoft-powerpoint-16"
    file = [System.IO.Path]::GetFileName($OutputPath)
    producer = "Microsoft PowerPoint"
    productVersion = $version.ProductVersion
    fileVersion = $version.FileVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    generatedBy = "scripts/generate-c3-powerpoint-pptx-fixture.ps1"
    sha256 = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    redistributable = $true
    expected = [ordered]@{
      slideCount = 3
      text = $true
      images = $true
      shapes = $true
      groups = $true
      notes = $true
      animations = $true
      themes = $true
    }
    verification = [ordered]@{
      producerReopen = "verified"
      expectedTitle = "PowerPoint Producer Fixture"
    }
  }
  $manifestPath = [System.IO.Path]::ChangeExtension($OutputPath, ".json")
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host "Generated $OutputPath"
}
finally {
  if ($presentation) {
    try { $presentation.Close() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null
  }
  if ($powerPoint) {
    try { $powerPoint.Quit() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($powerPoint) | Out-Null
  }
  Remove-Item -LiteralPath $tempImage -Force -ErrorAction SilentlyContinue
}
