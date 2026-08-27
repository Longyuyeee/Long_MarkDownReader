param(
  [Parameter(Mandatory = $true)][ValidateSet("microsoft-word-16", "wps-writer")][string]$ProducerId,
  [Parameter(Mandatory = $true)][ValidateSet("save", "verify")][string]$Mode,
  [Parameter(Mandatory = $true)][string]$InputDirectory,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][string]$ResultPath
)

$ErrorActionPreference = "Stop"
$InputDirectory = [System.IO.Path]::GetFullPath($InputDirectory)
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$ResultPath = [System.IO.Path]::GetFullPath($ResultPath)
$sourceIds = @("microsoft-word-16", "wps-writer", "libreoffice-writer")
$progId = if ($ProducerId -eq "microsoft-word-16") { "Word.Application" } else { "KWPS.Application" }
$tracePath = "$ResultPath.trace.log"
function Write-Trace([string]$Message) {
  [IO.File]::AppendAllText($tracePath, "$(Get-Date -Format o) $Message`r`n", [Text.UTF8Encoding]::new($false))
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

function Release-ComObject($Value) {
  if ($null -ne $Value -and [Runtime.InteropServices.Marshal]::IsComObject($Value)) {
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) | Out-Null } catch {}
  }
}

function Get-DocumentMetrics($Document) {
  $paragraph = $null
  $style = $null
  $range = $null
  try {
    $paragraph = $Document.Paragraphs.Item(1)
    $range = $paragraph.Range
    $text = ([string]$range.Text).Trim([char]13, [char]10, [char]7, [char]32)
    try { $style = $range.Style } catch {}
    $styleName = $null
    if ($null -ne $style) {
      try { $styleName = [string]$style.NameLocal } catch { try { $styleName = [string]$style } catch {} }
    }
    $repairMode = $null
    try { $repairMode = [bool]$Document.RepairMode } catch {}
    $headerCount = 0
    $footerCount = 0
    for ($index = 1; $index -le [int]$Document.Sections.Count; $index += 1) {
      $section = $null
      try {
        $section = $Document.Sections.Item($index)
        try { $headerCount += [int]$section.Headers.Count } catch {}
        try { $footerCount += [int]$section.Footers.Count } catch {}
      } finally { Release-ComObject $section }
    }
    return [ordered]@{
      firstParagraphText = $text
      firstParagraphStyle = $styleName
      paragraphCount = [int]$Document.Paragraphs.Count
      tableCount = [int]$Document.Tables.Count
      inlineShapeCount = [int]$Document.InlineShapes.Count
      sectionCount = [int]$Document.Sections.Count
      headerCount = $headerCount
      footerCount = $footerCount
      repairMode = $repairMode
    }
  }
  finally {
    Release-ComObject $style
    Release-ComObject $range
    Release-ComObject $paragraph
  }
}

$application = $null
$documents = @()
$result = [ordered]@{
  schemaVersion = 1
  stage = "M1B2C"
  producerId = $ProducerId
  mode = $Mode
  progId = $progId
  status = "failed"
  version = $null
  files = @()
  error = $null
}
try {
  New-Item -ItemType Directory -Path $OutputDirectory,([IO.Path]::GetDirectoryName($ResultPath)) -Force | Out-Null
  Remove-Item -LiteralPath $tracePath -Force -ErrorAction SilentlyContinue
  Write-Trace "creating $progId"
  for ($attempt = 1; $attempt -le 6 -and -not $application; $attempt += 1) {
    try { $application = New-Object -ComObject $progId }
    catch {
      Write-Trace "create attempt $attempt failed: $($_.Exception.Message)"
      if ($attempt -eq 6) { throw }
      Start-Sleep -Seconds 2
    }
  }
  Write-Trace "created $progId"
  try { $application.Visible = $false } catch {}
  try { $application.DisplayAlerts = 0 } catch {}
  try { $application.AutomationSecurity = 3 } catch {}
  try { $application.Options.SaveNormalPrompt = $false } catch {}
  $result.version = if ($ProducerId -eq "microsoft-word-16") { [string]$application.Version } else { [string]$application.Build }

  foreach ($sourceId in $sourceIds) {
    $inputName = if ($Mode -eq "save") { "$sourceId-longedit.docx" } else { "$ProducerId-from-$sourceId.docx" }
    $inputPath = Join-Path $InputDirectory $inputName
    if (-not (Test-Path -LiteralPath $inputPath -PathType Leaf)) { throw "Missing worker input: $inputName" }
    $beforeHash = Get-Sha256 $inputPath
    $documentPath = $inputPath
    $outputName = $null
    $outputPath = $null
    if ($Mode -eq "save") {
      $outputName = "$ProducerId-from-$sourceId.docx"
      $outputPath = Join-Path $OutputDirectory $outputName
      Copy-Item -LiteralPath $inputPath -Destination $outputPath -Force
      $documentPath = $outputPath
    }
    $document = $null
    try {
      $readOnly = $Mode -eq "verify"
      Write-Trace "opening $inputName readOnly=$readOnly"
      $document = $application.Documents.Open($documentPath, $false, $readOnly, $false)
      Write-Trace "opened $inputName"
      $documents += $document
      $metrics = Get-DocumentMetrics $document
      Write-Trace "measured $inputName"
      if ($Mode -eq "save") {
        Write-Trace "saving $outputName"
        $document.Save()
        Write-Trace "saved $outputName"
        $document.Close($false)
        Write-Trace "closed $outputName"
        $documents = @($documents | Where-Object { $_ -ne $document })
        Release-ComObject $document
        $document = $null
        if (-not (Test-Path -LiteralPath $outputPath -PathType Leaf)) { throw "Producer did not create: $outputName" }
        $result.files += [ordered]@{
          sourceId = $sourceId
          file = $outputName
          inputSha256 = $beforeHash
          sourceUnchanged = (Get-Sha256 $inputPath) -eq $beforeHash
          outputSha256 = Get-Sha256 $outputPath
          outputBytes = (Get-Item -LiteralPath $outputPath).Length
          metrics = $metrics
        }
      }
      else {
        $result.files += [ordered]@{
          sourceId = $sourceId
          file = $inputName
          sha256 = $beforeHash
          unchangedAfterRead = (Get-Sha256 $inputPath) -eq $beforeHash
          metrics = $metrics
        }
        $document.Close($false)
        Write-Trace "verified and closed $inputName"
        $documents = @($documents | Where-Object { $_ -ne $document })
        Release-ComObject $document
        $document = $null
      }
    }
    finally {
      if ($document) { try { $document.Close($false) } catch {}; Release-ComObject $document }
    }
  }
  $result.status = "passed"
  Write-Trace "worker passed"
}
catch {
  $result.error = $_.Exception.Message
  Write-Trace "worker failed: $($result.error)"
}
finally {
  foreach ($document in $documents) { try { $document.Close($false) } catch {}; Release-ComObject $document }
  if ($application) { Write-Trace "quitting application"; try { $application.Quit() } catch {}; Release-ComObject $application }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  [IO.File]::WriteAllText($ResultPath, ($result | ConvertTo-Json -Depth 10) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  Write-Trace "report written"
}
if ($result.status -ne "passed") { exit 1 }
