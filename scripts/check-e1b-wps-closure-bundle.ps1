$ErrorActionPreference = "Stop"
$module = Join-Path $PSScriptRoot "E1BWpsClosureBundle.psm1"
Import-Module $module -Force
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-e1b-bundle-test-" + [guid]::NewGuid().ToString("N"))
$source = Join-Path $root "source"
$imported = Join-Path $root "imported"
$fixture = Join-Path $source "wps-writer.odt"
$manifest = Join-Path $source "wps-writer.json"
$sourceFixture = Join-Path $source "wps-writer.docx"
$bundle = Join-Path $root "closure.zip"

function Add-TextEntry {
  param($Archive, [string]$Name, [string]$Text, [bool]$Stored = $false)
  $level = if ($Stored) {
    [System.IO.Compression.CompressionLevel]::NoCompression
  } else {
    [System.IO.Compression.CompressionLevel]::Optimal
  }
  $entry = $Archive.CreateEntry($Name, $level)
  $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
  try { $writer.Write($Text) } finally { $writer.Dispose() }
}

function New-TestOdt {
  $stream = [System.IO.File]::Open($fixture, [System.IO.FileMode]::CreateNew)
  $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    Add-TextEntry $archive "mimetype" "application/vnd.oasis.opendocument.text" $true
    Add-TextEntry $archive "content.xml" "<office>WPS Writer Producer Fixture</office>"
    Add-TextEntry $archive "meta.xml" "<meta><creator>LongEdit E1B Audit</creator></meta>"
  }
  finally {
    $archive.Dispose()
    $stream.Dispose()
  }
}

function New-ZipFromDirectory {
  param([string]$Directory, [string]$Output, [string]$ExtraEntry = "")
  $stream = [System.IO.File]::Open($Output, [System.IO.FileMode]::Create)
  $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($name in @("bundle.json", "wps-writer.odt", "wps-writer.json")) {
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,
        (Join-Path $Directory $name),
        $name,
        [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
    if ($ExtraEntry) { Add-TextEntry $archive $ExtraEntry "unsafe" }
  }
  finally {
    $archive.Dispose()
    $stream.Dispose()
  }
}

function Assert-Rejected {
  param([scriptblock]$Action, [string]$Expected)
  try {
    & $Action
    throw "Expected rejection containing: $Expected"
  }
  catch {
    if (-not $_.Exception.Message.Contains($Expected)) { throw }
  }
}

try {
  New-Item -ItemType Directory -Path $source | Out-Null
  New-TestOdt
  [System.IO.File]::WriteAllText($sourceFixture, "fixed WPS producer source", [System.Text.UTF8Encoding]::new($false))
  $manifestValue = [ordered]@{
    schemaVersion = 1
    stage = "E1B"
    id = "wps-writer"
    file = "wps-writer.odt"
    producer = "WPS Writer"
    productVersion = "test-ready-build"
    generatedAt = "2026-07-29T00:00:00Z"
    sha256 = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()
    size = (Get-Item -LiteralPath $fixture).Length
    sourceFixture = "wps-writer.docx"
    expectedText = "WPS Writer Producer Fixture"
    nativeOdtSave = $true
    sameProducerReopenVerified = $true
    privacySanitized = $true
  }
  [System.IO.File]::WriteAllText(
    $manifest,
    ($manifestValue | ConvertTo-Json -Depth 5) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Export-E1BWpsClosureBundle -FixturePath $fixture -ManifestPath $manifest `
    -SourceFixturePath $sourceFixture -OutputPath $bundle | Out-Null
  $result = Import-E1BWpsClosureBundle -BundlePath $bundle `
    -DestinationDirectory $imported -SourceFixturePath $sourceFixture
  if (-not (Test-Path -LiteralPath $result.fixture) -or -not (Test-Path -LiteralPath $result.manifest)) {
    throw "Valid closure bundle was not imported"
  }
  Assert-Rejected {
    Import-E1BWpsClosureBundle -BundlePath $bundle `
      -DestinationDirectory $imported -SourceFixturePath $sourceFixture
  } "will not be overwritten"

  $wrongSource = Join-Path $root "wps-writer.docx"
  [System.IO.File]::WriteAllText($wrongSource, "different source", [System.Text.UTF8Encoding]::new($false))
  Assert-Rejected {
    Import-E1BWpsClosureBundle -BundlePath $bundle `
      -DestinationDirectory (Join-Path $root "wrong-source-import") -SourceFixturePath $wrongSource
  } "failed the transfer contract"

  $expanded = Join-Path $root "expanded"
  [System.IO.Compression.ZipFile]::ExtractToDirectory($bundle, $expanded)
  $bundleManifestPath = Join-Path $expanded "bundle.json"
  $bundleManifest = Get-Content -LiteralPath $bundleManifestPath -Raw | ConvertFrom-Json
  $bundleManifest.payload.fixture.sha256 = "0" * 64
  [System.IO.File]::WriteAllText(
    $bundleManifestPath,
    ($bundleManifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  $tampered = Join-Path $root "tampered.zip"
  New-ZipFromDirectory $expanded $tampered
  Assert-Rejected {
    Import-E1BWpsClosureBundle -BundlePath $tampered `
      -DestinationDirectory (Join-Path $root "tampered-import") -SourceFixturePath $sourceFixture
  } "failed the transfer contract"

  $unsafe = Join-Path $root "unsafe.zip"
  New-ZipFromDirectory $expanded $unsafe "../escape.txt"
  Assert-Rejected {
    Import-E1BWpsClosureBundle -BundlePath $unsafe `
      -DestinationDirectory (Join-Path $root "unsafe-import") -SourceFixturePath $sourceFixture
  } "must contain exactly"
  if (Test-Path -LiteralPath (Join-Path $root "escape.txt")) {
    throw "Unsafe closure bundle escaped the temporary import directory"
  }
  Write-Output "E1B WPS closure bundle passed: valid handoff plus overwrite, source, digest, and path traversal rejection."
}
finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
