param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$fixtureRoot = Join-Path $workspace "src-tauri\tests\fixtures\workbook"
$source = Join-Path $fixtureRoot "array-formula-wps-spreadsheets.xlsx"
$target = Join-Path $fixtureRoot "array-formula-conflict-diagnostic.xlsx"
$manifestPath = Join-Path $fixtureRoot "array-formula-conflict-diagnostic.json"

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
  throw "X3-B4 source fixture is missing: $source"
}
if ((Test-Path -LiteralPath $target) -and -not $Force) {
  throw "Refusing to overwrite X3-B4 fixture without -Force: $target"
}

Copy-Item -LiteralPath $source -Destination $target -Force
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
  $target,
  [System.IO.Compression.ZipArchiveMode]::Update
)
try {
  $entry = $archive.GetEntry("xl/worksheets/sheet1.xml")
  if (-not $entry) { throw "X3-B4 source fixture has no sheet1.xml" }
  $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
  try {
    $xml = $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
  $expectedConflictCell = '<c r="D3"><v>11</v></c>'
  $expectedErrorCell = '<c r="D4"><v>12</v></c>'
  if (-not $xml.Contains($expectedConflictCell) -or -not $xml.Contains($expectedErrorCell)) {
    throw "X3-B4 source worksheet no longer matches the reviewed WPS baseline"
  }
  $xml = $xml.Replace(
    $expectedConflictCell,
    '<c r="D3"><f>1+1</f><v>2</v></c>'
  ).Replace(
    $expectedErrorCell,
    '<c r="D4" t="e"><v>#DIV/0!</v></c>'
  )
  $entry.Delete()
  $entry = $archive.CreateEntry(
    "xl/worksheets/sheet1.xml",
    [System.IO.Compression.CompressionLevel]::Optimal
  )
  $entry.LastWriteTime = [DateTimeOffset]::new(
    2026,
    7,
    30,
    0,
    0,
    0,
    [TimeSpan]::Zero
  )
  $writer = [System.IO.StreamWriter]::new(
    $entry.Open(),
    [System.Text.UTF8Encoding]::new($false)
  )
  try {
    $writer.Write($xml)
  } finally {
    $writer.Dispose()
  }
} finally {
  $archive.Dispose()
}

$digest = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = [ordered]@{
  schemaVersion = 1
  stage = "X3-B4"
  producerClass = "controlled-diagnostic-derivative"
  sourceFixture = "array-formula-wps-spreadsheets.xlsx"
  fixture = "array-formula-conflict-diagnostic.xlsx"
  sha256 = $digest
  sheet = "Array Boundary"
  arrayRange = "D2:D4"
  expectedSpillStatus = "potential_conflict"
  expectedConflictCells = @("D3")
  expectedErrorCacheCells = @("D4")
  expectedErrorCacheValue = "#DIV/0!"
  expectedCachedValueTypes = [ordered]@{
    number = 2
    error = 1
  }
  expectedSourceUnchanged = $true
  privacyReviewed = $true
}
[System.IO.File]::WriteAllText(
  $manifestPath,
  ($manifest | ConvertTo-Json -Depth 6) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "X3-B4 conflict diagnostic fixture generated: $target"
Write-Output "SHA-256: $digest"
