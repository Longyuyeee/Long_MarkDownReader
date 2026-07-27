param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $workspace "fixtures\docx\producers"
if (-not $OutputPath) {
  $OutputPath = Join-Path $fixtureRoot "microsoft-word-16.docx"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$fixtureRoot = [System.IO.Path]::GetFullPath($fixtureRoot)
if (-not $OutputPath.StartsWith($fixtureRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "The generated fixture must stay inside $fixtureRoot"
}

$wordPath = "C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"
if (-not (Test-Path -LiteralPath $wordPath -PathType Leaf)) {
  throw "Microsoft Word was not found at $wordPath"
}

New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$tempImage = Join-Path ([System.IO.Path]::GetTempPath()) "longedit-c0-word-fixture.png"
$word = $null
$document = $null
$localWordUserName = ""
$localWordUserInitials = ""

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$bitmap = [System.Drawing.Bitmap]::new(520, 140)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$font = [System.Drawing.Font]::new("Segoe UI", 20, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(35, 62, 112))
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(67, 114, 196), 4)
try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(235, 243, 255))
  $graphics.DrawRectangle($pen, 2, 2, 515, 135)
  $graphics.DrawString("Microsoft Word C0-2A fixture", $font, $brush, 54, 49)
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
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $localWordUserName = [string]$word.UserName
  $localWordUserInitials = [string]$word.UserInitials
  $document = $word.Documents.Add()

  $selection = $word.Selection
  $selection.Style = -2
  $selection.TypeText("Microsoft Word Producer Fixture")
  $selection.TypeParagraph()

  $selection.Style = -1
  $selection.TypeText("This document was created and saved by Microsoft Word for LongEdit compatibility auditing.")
  $selection.TypeParagraph()
  $commentRange = $document.Paragraphs.Item(2).Range
  $commentRange.MoveEnd(1, -1) | Out-Null
  $document.Comments.Add($commentRange, "Microsoft Word comment evidence") | Out-Null

  $selection.TypeText("Structured reading")
  $selection.Range.ListFormat.ApplyBulletDefault()
  $selection.TypeParagraph()
  $selection.TypeText("Related content and layout")
  $selection.TypeParagraph()
  $selection.Range.ListFormat.RemoveNumbers()

  $table = $document.Tables.Add($selection.Range, 3, 3)
  $table.Cell(1, 1).Range.Text = "Capability matrix"
  $table.Cell(1, 2).Range.Text = "Merged heading"
  $table.Cell(1, 3).Range.Text = "Status"
  $table.Cell(2, 1).Range.Text = "Structured reading"
  $table.Cell(2, 2).Range.Text = "Available"
  $table.Cell(2, 3).Range.Text = "Verified"
  $table.Cell(3, 1).Range.Text = "Related content"
  $table.Cell(3, 2).Range.Text = "Indexed"
  $table.Cell(3, 3).Range.Text = "Verified"
  $table.Cell(1, 1).Merge($table.Cell(1, 2))
  $table.Cell(1, 2).Merge($table.Cell(2, 3))

  $selection.SetRange($table.Range.End, $table.Range.End)
  $selection.TypeParagraph()
  $selection.TypeText("Before explicit page break.")
  $selection.InsertBreak(7)
  $selection.TypeText("After explicit page break.")
  $selection.TypeParagraph()

  $selection.TypeText("Footnote anchor")
  $document.Footnotes.Add($selection.Range, [System.Reflection.Missing]::Value, "Microsoft Word footnote evidence") | Out-Null
  $selection.TypeParagraph()
  $selection.TypeText("Endnote anchor")
  $document.Endnotes.Add($selection.Range, [System.Reflection.Missing]::Value, "Microsoft Word endnote evidence") | Out-Null
  $selection.TypeParagraph()

  $selection.TypeText("Embedded image")
  $selection.TypeParagraph()
  $selection.InlineShapes.AddPicture($tempImage) | Out-Null
  $selection.TypeParagraph()

  $section = $document.Sections.Item(1)
  $section.PageSetup.Orientation = 1
  $section.PageSetup.TextColumns.SetCount(2)
  $section.Headers.Item(1).Range.Text = "Microsoft Word header evidence"
  $section.Footers.Item(1).Range.Text = "Microsoft Word footer evidence"

  $document.SaveAs2($OutputPath, 16)
  $document.Close()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
  $document = $null
  $word.Quit()

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
      $sanitized = $content
      if ($localWordUserName) {
        $sanitized = $sanitized.Replace($localWordUserName, "LongEdit C0-2A Audit")
      }
      if ($localWordUserInitials) {
        $sanitized = $sanitized.Replace($localWordUserInitials, "LE")
      }
      $sanitized = [regex]::Replace(
        $sanitized,
        '(<dc:creator>).*?(</dc:creator>)',
        '$1LongEdit C0-2A Audit$2'
      )
      $sanitized = [regex]::Replace(
        $sanitized,
        '(<cp:lastModifiedBy>).*?(</cp:lastModifiedBy>)',
        '$1LongEdit C0-2A Audit$2'
      )
      $sanitized = [regex]::Replace($sanitized, 'w:author="[^"]*"', 'w:author="LongEdit C0-2A Audit"')
      $sanitized = [regex]::Replace($sanitized, 'w:initials="[^"]*"', 'w:initials="LE"')
      $sanitized = [regex]::Replace($sanitized, 'w15:author="[^"]*"', 'w15:author="LongEdit C0-2A Audit"')
      $sanitized = [regex]::Replace($sanitized, 'w15:userId="[^"]*"', 'w15:userId="longedit-c0-2a"')
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

  $verificationWord = New-Object -ComObject Word.Application
  $verificationWord.Visible = $false
  $verificationWord.DisplayAlerts = 0
  $verificationDocument = $null
  try {
    $verificationDocument = $verificationWord.Documents.Open($OutputPath, $false, $true)
    if (-not $verificationDocument.Content.Text.Contains("Microsoft Word Producer Fixture")) {
      throw "Microsoft Word reopen verification did not recover the expected heading"
    }
    $verificationDocument.Close()
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationDocument) | Out-Null
    $verificationDocument = $null
    $verificationWord.Quit()
  }
  finally {
    if ($verificationDocument) {
      try { $verificationDocument.Close(0) } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationDocument) | Out-Null
    }
    if ($verificationWord) {
      try { $verificationWord.Quit() } catch {}
      [Runtime.InteropServices.Marshal]::FinalReleaseComObject($verificationWord) | Out-Null
    }
  }

  $version = (Get-Item -LiteralPath $wordPath).VersionInfo
  $hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $metadata = [ordered]@{
    schemaVersion = 1
    id = "microsoft-word-16"
    file = [System.IO.Path]::GetFileName($OutputPath)
    producer = "Microsoft Word"
    productVersion = $version.ProductVersion
    fileVersion = $version.FileVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    generator = "scripts/generate-c0-word-docx-fixture.ps1"
    privacyNormalization = "After Word saved the package, only local author and initials strings in XML metadata were replaced with the project audit identity."
    producerReopenVerified = $true
    sha256 = $hash
    redistribution = "Project-authored text and image generated locally; safe to redistribute with this repository."
    expected = [ordered]@{
      heading = "Microsoft Word Producer Fixture"
      listItems = 2
      tables = 1
      mergedCellsMinimum = 2
      pageBreaksMinimum = 1
      sectionsMinimum = 1
      headersMinimum = 1
      footersMinimum = 1
      footnotes = $true
      endnotes = $true
      comments = $true
      images = 1
    }
  }
  $manifestPath = Join-Path $fixtureRoot "microsoft-word-16.json"
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($metadata | ConvertTo-Json -Depth 5) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Output "Generated $OutputPath"
  Write-Output "SHA-256 $hash"
}
finally {
  if ($document) {
    try { $document.Close(0) } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
  }
  if ($word) {
    try { $word.Quit() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
  }
  if (Test-Path -LiteralPath $tempImage) {
    Remove-Item -LiteralPath $tempImage -Force
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
