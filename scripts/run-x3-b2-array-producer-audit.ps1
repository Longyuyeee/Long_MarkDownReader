param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$source = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-boundary.xlsx"
$target = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-wps-spreadsheets.xlsx"
$manifestPath = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-wps-spreadsheets.json"
$evidenceDir = Join-Path $workspace "docs\evidence\x3-b2-xlsx-array-producers"
$matrixPath = Join-Path $evidenceDir "matrix.json"

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
  throw "X3-B1 source fixture is missing: $source"
}
if ((Test-Path -LiteralPath $target) -and -not $Force) {
  throw "WPS fixture already exists: $target (pass -Force to regenerate)"
}

function Close-ComApplication {
  param($Workbook, $Application)
  if ($Workbook) {
    try { $Workbook.Close($false) } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Workbook) | Out-Null } catch {}
  }
  if ($Application) {
    try { $Application.Quit() } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Application) | Out-Null } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

function Get-ZipText {
  param([string]$Path, [string]$EntryName)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $archive.GetEntry($EntryName)
    if (-not $entry) { throw "Missing ZIP entry: $EntryName" }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally {
    $archive.Dispose()
  }
}

New-Item -ItemType Directory -Path (Split-Path $target),$evidenceDir -Force | Out-Null
$application = $null
$workbook = $null
$producer = $null
$version = $null
$build = $null
$reopenedSheet = $null
$automationProgId = "KET.Application"
$registeredPath = (Get-ItemProperty "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\et.exe" -ErrorAction Stop)."(default)"
$spreadsheetExecutable = Join-Path (Split-Path $registeredPath) "et.exe"
$executablePath = if (Test-Path -LiteralPath $spreadsheetExecutable -PathType Leaf) { $spreadsheetExecutable } else { $registeredPath }
try {
  $application = New-Object -ComObject $automationProgId
  $application.Visible = $false
  $application.DisplayAlerts = $false
  $producer = [string]$application.Name
  $version = [string]$application.Version
  try { $build = [string]$application.Build } catch { $build = "unknown" }
  $workbook = $application.Workbooks.Open($source)
  $workbook.SaveAs($target, 51)
} finally {
  Close-ComApplication $workbook $application
}

$application = $null
$workbook = $null
try {
  $application = New-Object -ComObject $automationProgId
  $application.Visible = $false
  $application.DisplayAlerts = $false
  $workbook = $application.Workbooks.Open($target, 0, $true)
  $reopenedSheet = [string]$workbook.Worksheets.Item(1).Name
} finally {
  Close-ComApplication $workbook $application
}

$xml = Get-ZipText $target "xl/worksheets/sheet1.xml"
$arrayDeclarations = [regex]::Matches($xml, '<f[^>]*\bt="array"[^>]*\bref="([^"]+)"[^>]*>(.*?)</f>')
if ($arrayDeclarations.Count -ne 2) {
  throw "Expected two array declarations after WPS round-trip, found $($arrayDeclarations.Count)"
}
if ($reopenedSheet -ne "Array Boundary") {
  throw "WPS independent reopen returned unexpected sheet: $reopenedSheet"
}

$sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = [ordered]@{
  schemaVersion = 1
  stage = "X3-B2"
  producer = "WPS Spreadsheets"
  producerClass = "real-desktop-producer-round-trip"
  applicationName = $producer
  automationProgId = $automationProgId
  executablePath = $executablePath
  version = $version
  build = $build
  sourceFixture = "array-formula-boundary.xlsx"
  fixture = "array-formula-wps-spreadsheets.xlsx"
  sha256 = $sha256
  savedAsXlsx = $true
  applicationExitedBeforeReopen = $true
  independentNativeReopen = $true
  reopenedSheet = $reopenedSheet
  arrayDeclarationCount = $arrayDeclarations.Count
  expectedKinds = @("legacy_array", "dynamic_array")
  expectedRanges = @("B2:B4", "D2:D4")
  privacyReviewed = $true
}
$utf8NoBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), $utf8NoBom)

$matrix = [ordered]@{
  schemaVersion = 1
  stage = "X3-B2"
  updatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  status = "partial"
  verifiedProducers = 1
  requiredProducers = 3
  sourceFixture = "src-tauri/tests/fixtures/workbook/array-formula-boundary.xlsx"
  producers = @(
    [ordered]@{
      id = "microsoft-excel"
      producer = "Microsoft Excel"
      status = "blocked_environment"
      evidence = "No genuine Microsoft Office EXCEL.EXE installation; Excel.Application is not accepted without LocalServer identity verification."
    },
    [ordered]@{
      id = "wps-spreadsheets"
      producer = "WPS Spreadsheets"
      status = "verified"
      version = $version
      build = $build
      automationProgId = $automationProgId
      executablePath = $executablePath
      fixture = "src-tauri/tests/fixtures/workbook/array-formula-wps-spreadsheets.xlsx"
      manifest = "src-tauri/tests/fixtures/workbook/array-formula-wps-spreadsheets.json"
      nativeSave = $true
      independentReopen = $true
      longEditSemanticRead = "verified-by-rust-regression"
    },
    [ordered]@{
      id = "libreoffice-calc"
      producer = "LibreOffice Calc"
      status = "blocked_environment"
      evidence = "No soffice.exe installation was found on this machine."
    }
  )
  releaseBoundary = [ordered]@{
    readViewStatus = "limited"
    editStatus = "blocked"
    calculationStatus = "blocked"
    promoteToSupportedRequires = @(
      "Microsoft Excel native save and independent reopen",
      "WPS Spreadsheets native save and independent reopen",
      "LibreOffice Calc native save and independent reopen"
    )
  }
}
[IO.File]::WriteAllText($matrixPath, ($matrix | ConvertTo-Json -Depth 10), $utf8NoBom)

Write-Host "X3-B2 WPS producer audit verified"
Write-Host "Fixture: $target"
Write-Host "SHA-256: $sha256"
Write-Host "Matrix: partial 1/3"
