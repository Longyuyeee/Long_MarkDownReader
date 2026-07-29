$ErrorActionPreference = "Stop"

$script:FixtureName = "wps-writer.odt"
$script:ManifestName = "wps-writer.json"
$script:BundleName = "bundle.json"
$script:ExpectedText = "WPS Writer Producer Fixture"
$script:MaxBundleBytes = 80MB

function Get-LowerSha256 {
  param([Parameter(Mandatory)][string]$Path)
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $algorithm.ComputeHash($stream)
    ([System.BitConverter]::ToString($digest)).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Read-ZipEntryText {
  param([Parameter(Mandatory)]$Entry)
  $reader = [System.IO.StreamReader]::new($Entry.Open(), [System.Text.Encoding]::UTF8, $true)
  try { $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Assert-WpsFixtureEvidence {
  param(
    [Parameter(Mandatory)][string]$FixturePath,
    [Parameter(Mandatory)][string]$ManifestPath
  )
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $fixture = (Resolve-Path -LiteralPath $FixturePath).Path
  $manifestFile = (Resolve-Path -LiteralPath $ManifestPath).Path
  $manifestSource = [System.IO.File]::ReadAllText($manifestFile)
  $manifest = $manifestSource | ConvertFrom-Json
  $fixtureInfo = Get-Item -LiteralPath $fixture
  if ($fixtureInfo.Length -gt 64MB) { throw "WPS ODT fixture exceeds the 64 MiB read limit" }
  $digest = Get-LowerSha256 $fixture
  if ($manifest.schemaVersion -ne 1 `
    -or $manifest.stage -ne "E1B" `
    -or $manifest.id -ne "wps-writer" `
    -or $manifest.file -ne $script:FixtureName `
    -or $manifest.producer -ne "WPS Writer" `
    -or [string]::IsNullOrWhiteSpace([string]$manifest.productVersion) `
    -or [string]::IsNullOrWhiteSpace([string]$manifest.generatedAt) `
    -or $manifest.sourceFixture -ne "wps-writer.docx" `
    -or $manifest.expectedText -ne $script:ExpectedText `
    -or -not $manifest.nativeOdtSave `
    -or -not $manifest.sameProducerReopenVerified `
    -or -not $manifest.privacySanitized `
    -or $manifest.sha256 -ne $digest `
    -or [int64]$manifest.size -ne $fixtureInfo.Length) {
    throw "WPS ODT fixture manifest failed the E1B producer evidence contract"
  }
  [DateTimeOffset]::Parse([string]$manifest.generatedAt) | Out-Null

  $archive = [System.IO.Compression.ZipFile]::OpenRead($fixture)
  try {
    if ($archive.Entries.Count -lt 3 -or $archive.Entries.Count -gt 4096 `
      -or $archive.Entries[0].FullName -ne "mimetype") {
      throw "WPS ODT mimetype must be the first package entry"
    }
    $mimetypeEntries = @($archive.Entries | Where-Object FullName -eq "mimetype")
    $contentEntries = @($archive.Entries | Where-Object FullName -eq "content.xml")
    if ($mimetypeEntries.Count -ne 1 -or $contentEntries.Count -ne 1) {
      throw "WPS ODT package inventory is incomplete or duplicated"
    }
    if ((Read-ZipEntryText $mimetypeEntries[0]) -ne "application/vnd.oasis.opendocument.text") {
      throw "WPS ODT package mimetype is invalid"
    }
    if (-not (Read-ZipEntryText $contentEntries[0]).Contains($script:ExpectedText)) {
      throw "WPS ODT package does not contain the expected producer text"
    }
    $privacyPattern = '(?i)(?:file:/+)?[a-z]:[/\\]users[/\\]|/home/[a-z0-9._-]+/|\\\\[a-z0-9._-]+\\[a-z0-9$._-]+'
    $xmlEntries = @($archive.Entries | Where-Object { $_.FullName.EndsWith(".xml") })
    if (($xmlEntries | Measure-Object -Property Length -Sum).Sum -gt 32MB `
      -or $xmlEntries.Where({ $_.Length -gt 16MB }).Count -gt 0) {
      throw "WPS ODT XML exceeds the handoff inspection budget"
    }
    foreach ($entry in $xmlEntries) {
      if ((Read-ZipEntryText $entry) -match $privacyPattern) {
        throw "WPS ODT package contains a local user or network path"
      }
    }
  }
  finally {
    $archive.Dispose()
  }
  $manifest
}

function Add-FileToArchive {
  param(
    [Parameter(Mandatory)]$Archive,
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Name
  )
  $entry = $Archive.CreateEntry($Name, [System.IO.Compression.CompressionLevel]::Optimal)
  $input = [System.IO.File]::OpenRead($Source)
  $output = $entry.Open()
  try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
}

function Export-E1BWpsClosureBundle {
  param(
    [Parameter(Mandatory)][string]$FixturePath,
    [Parameter(Mandatory)][string]$ManifestPath,
    [Parameter(Mandatory)][string]$SourceFixturePath,
    [Parameter(Mandatory)][string]$OutputPath
  )
  $fixture = (Resolve-Path -LiteralPath $FixturePath).Path
  $manifestFile = (Resolve-Path -LiteralPath $ManifestPath).Path
  $sourceFixture = (Resolve-Path -LiteralPath $SourceFixturePath).Path
  if ([System.IO.Path]::GetFileName($sourceFixture) -ne "wps-writer.docx") {
    throw "WPS closure bundle source must be wps-writer.docx"
  }
  $evidence = Assert-WpsFixtureEvidence $fixture $manifestFile
  $output = [System.IO.Path]::GetFullPath($OutputPath)
  if (Test-Path -LiteralPath $output) { throw "Closure bundle already exists: $output" }
  $parent = Split-Path -Parent $output
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  $temporary = "$output.$([guid]::NewGuid().ToString('N')).tmp"
  $bundle = [ordered]@{
    schemaVersion = 1
    stage = "E1B"
    kind = "wps-odt-closure-handoff"
    producerId = "wps-writer"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    payload = [ordered]@{
      fixture = [ordered]@{
        name = $script:FixtureName
        sha256 = Get-LowerSha256 $fixture
        size = (Get-Item -LiteralPath $fixture).Length
      }
      manifest = [ordered]@{
        name = $script:ManifestName
        sha256 = Get-LowerSha256 $manifestFile
        size = (Get-Item -LiteralPath $manifestFile).Length
      }
      sourceFixture = [ordered]@{
        name = "wps-writer.docx"
        sha256 = Get-LowerSha256 $sourceFixture
        size = (Get-Item -LiteralPath $sourceFixture).Length
      }
    }
    producerEvidence = [ordered]@{
      productVersion = [string]$evidence.productVersion
      generatedAt = [string]$evidence.generatedAt
      nativeOdtSave = $true
      sameProducerReopenVerified = $true
      privacySanitized = $true
    }
  }
  try {
    $stream = [System.IO.File]::Open($temporary, [System.IO.FileMode]::CreateNew)
    $archive = [System.IO.Compression.ZipArchive]::new(
      $stream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      $bundleEntry = $archive.CreateEntry($script:BundleName, [System.IO.Compression.CompressionLevel]::Optimal)
      $writer = [System.IO.StreamWriter]::new($bundleEntry.Open(), [System.Text.UTF8Encoding]::new($false))
      try { $writer.Write(($bundle | ConvertTo-Json -Depth 8) + [Environment]::NewLine) } finally { $writer.Dispose() }
      Add-FileToArchive $archive $fixture $script:FixtureName
      Add-FileToArchive $archive $manifestFile $script:ManifestName
    }
    finally {
      $archive.Dispose()
      $stream.Dispose()
    }
    Move-Item -LiteralPath $temporary -Destination $output
  }
  finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
  $output
}

function Import-E1BWpsClosureBundle {
  param(
    [Parameter(Mandatory)][string]$BundlePath,
    [Parameter(Mandatory)][string]$DestinationDirectory,
    [Parameter(Mandatory)][string]$SourceFixturePath
  )
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $bundleFile = (Resolve-Path -LiteralPath $BundlePath).Path
  $sourceFixture = (Resolve-Path -LiteralPath $SourceFixturePath).Path
  if ((Get-Item -LiteralPath $bundleFile).Length -gt $script:MaxBundleBytes) {
    throw "Closure bundle exceeds the 80 MiB transfer limit"
  }
  $destination = [System.IO.Path]::GetFullPath($DestinationDirectory)
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  $fixtureTarget = Join-Path $destination $script:FixtureName
  $manifestTarget = Join-Path $destination $script:ManifestName
  if ((Test-Path -LiteralPath $fixtureTarget) -or (Test-Path -LiteralPath $manifestTarget)) {
    throw "Existing WPS closure evidence will not be overwritten"
  }
  $temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-e1b-import-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $temporary | Out-Null
  $publishedFixture = $false
  try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($bundleFile)
    try {
      $names = @($archive.Entries | ForEach-Object FullName)
      $expected = @($script:BundleName, $script:FixtureName, $script:ManifestName)
      if ($names.Count -ne $expected.Count `
        -or (Compare-Object ($names | Sort-Object) ($expected | Sort-Object))) {
        throw "Closure bundle must contain exactly bundle.json, wps-writer.odt, and wps-writer.json"
      }
      foreach ($entry in $archive.Entries) {
        if ($entry.FullName -match '[/\\]' -or $entry.Length -gt $script:MaxBundleBytes) {
          throw "Closure bundle contains an unsafe entry"
        }
        $target = Join-Path $temporary $entry.FullName
        $input = $entry.Open()
        $output = [System.IO.File]::Open($target, [System.IO.FileMode]::CreateNew)
        try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
      }
    }
    finally {
      $archive.Dispose()
    }
    $bundle = Get-Content -LiteralPath (Join-Path $temporary $script:BundleName) -Raw | ConvertFrom-Json
    $fixture = Join-Path $temporary $script:FixtureName
    $manifestFile = Join-Path $temporary $script:ManifestName
    if ($bundle.schemaVersion -ne 1 `
      -or $bundle.stage -ne "E1B" `
      -or $bundle.kind -ne "wps-odt-closure-handoff" `
      -or $bundle.producerId -ne "wps-writer" `
      -or [string]::IsNullOrWhiteSpace([string]$bundle.createdAt) `
      -or $bundle.payload.fixture.name -ne $script:FixtureName `
      -or $bundle.payload.fixture.sha256 -ne (Get-LowerSha256 $fixture) `
      -or [int64]$bundle.payload.fixture.size -ne (Get-Item -LiteralPath $fixture).Length `
      -or $bundle.payload.manifest.name -ne $script:ManifestName `
      -or $bundle.payload.manifest.sha256 -ne (Get-LowerSha256 $manifestFile) `
      -or [int64]$bundle.payload.manifest.size -ne (Get-Item -LiteralPath $manifestFile).Length `
      -or $bundle.payload.sourceFixture.name -ne "wps-writer.docx" `
      -or $bundle.payload.sourceFixture.sha256 -ne (Get-LowerSha256 $sourceFixture) `
      -or [int64]$bundle.payload.sourceFixture.size -ne (Get-Item -LiteralPath $sourceFixture).Length `
      -or [string]::IsNullOrWhiteSpace([string]$bundle.producerEvidence.productVersion) `
      -or -not $bundle.producerEvidence.nativeOdtSave `
      -or -not $bundle.producerEvidence.sameProducerReopenVerified `
      -or -not $bundle.producerEvidence.privacySanitized) {
      throw "Closure bundle manifest failed the transfer contract"
    }
    [DateTimeOffset]::Parse([string]$bundle.createdAt) | Out-Null
    $evidence = Assert-WpsFixtureEvidence $fixture $manifestFile
    if ([string]$bundle.producerEvidence.productVersion -ne [string]$evidence.productVersion `
      -or [string]$bundle.producerEvidence.generatedAt -ne [string]$evidence.generatedAt) {
      throw "Closure bundle producer evidence does not match the fixture manifest"
    }
    Move-Item -LiteralPath $fixture -Destination $fixtureTarget
    $publishedFixture = $true
    Move-Item -LiteralPath $manifestFile -Destination $manifestTarget
  }
  catch {
    if ($publishedFixture -and -not (Test-Path -LiteralPath $manifestTarget)) {
      Remove-Item -LiteralPath $fixtureTarget -Force -ErrorAction SilentlyContinue
    }
    throw
  }
  finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
  }
  [pscustomobject]@{
    fixture = $fixtureTarget
    manifest = $manifestTarget
    sha256 = Get-LowerSha256 $fixtureTarget
  }
}

Export-ModuleMember -Function Export-E1BWpsClosureBundle, Import-E1BWpsClosureBundle
