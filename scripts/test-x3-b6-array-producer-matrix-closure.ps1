$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "powershell-sha256.ps1")
Add-Type -AssemblyName System.IO.Compression

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$closure = Join-Path $workspace "scripts\close-x3-b6-array-producer-matrix.ps1"
$baseline = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-boundary.xlsx"
$sampleOutput = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-wps-spreadsheets.xlsx"
$sourceMatrix = Join-Path $workspace "docs\evidence\x3-b2-xlsx-array-producers\matrix.json"
$sourceCapabilities = Join-Path $workspace "shared\xlsx-formula-capabilities.json"
$auditJson = & cargo run --quiet --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin xlsx-array-audit -- $sampleOutput
if ($LASTEXITCODE -ne 0) { throw "X3-B6 sample output failed LongEdit semantic audit" }
$snapshot = ($auditJson -join [Environment]::NewLine) | ConvertFrom-Json
$auditRoot = Join-Path $env:TEMP ("longedit-x3-b6-array-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null

function Write-JsonFile {
  param([string]$Path, $Value)
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 14) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}

function New-ValidBundle {
  param(
    [ValidateSet("microsoft-excel", "libreoffice-calc")]
    [string]$ProducerId,
    [string]$BundlePath,
    [switch]$BreakOutputDigest
  )
  $root = Join-Path $auditRoot ("bundle-" + $ProducerId + "-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  $outputName = "array-formula-$ProducerId.xlsx"
  $outputPath = Join-Path $root $outputName
  Copy-Item -LiteralPath $sampleOutput -Destination $outputPath
  $identity = if ($ProducerId -eq "microsoft-excel") {
    [ordered]@{
      progId = "Excel.Application"
      clsid = "{00024500-0000-0000-C000-000000000046}"
      localServer = '"C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE" /Automation'
      executable = "C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"
      applicationName = "Microsoft Excel"
      version = "16.0"
      build = "synthetic-closure-test-only"
    }
  } else {
    [ordered]@{
      executable = "C:\Program Files\LibreOffice\program\soffice.com"
      version = "LibreOffice 25.2.0.3"
      applicationName = "LibreOffice Calc"
    }
  }
  $producerName = if ($ProducerId -eq "microsoft-excel") { "Microsoft Excel" } else { "LibreOffice Calc" }
  $producer = [ordered]@{
    schemaVersion = 1
    stage = "X3-B5"
    id = $ProducerId
    producer = $producerName
    status = "verified"
    identity = $identity
    completedGates = @("open_baseline", "native_save", "quit_process", "reopen_in_new_process", "verify_no_repair_prompt", "verify_array_declarations", "reparse_longedit_semantics")
    nativeSave = $true
    processRestarted = $true
    sessionIds = if ($ProducerId -eq "microsoft-excel") { @(1101, 1102) } else { @(1201, 1202) }
    independentReopen = $true
    repairPromptObserved = $false
    before = $snapshot
    afterSave = $snapshot
    afterReopen = $snapshot
    outputFile = $outputName
    outputBytes = (Get-Item -LiteralPath $outputPath).Length
    outputSha256 = Get-Sha256Hex -Path $outputPath
  }
  $producerPath = Join-Path $root "producer.json"
  Write-JsonFile -Path $producerPath -Value $producer
  $outputDigest = Get-Sha256Hex -Path $outputPath
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = "X3-B5"
    status = "array_producer_evidence_bundle"
    createdAt = [DateTime]::UtcNow.ToString("o")
    sourceCommit = "0000000000000000000000000000000000000000"
    producerId = $ProducerId
    baseline = [ordered]@{
      file = "array-formula-boundary.xlsx"
      bytes = (Get-Item -LiteralPath $baseline).Length
      sha256 = Get-Sha256Hex -Path $baseline
    }
    members = @(
      [ordered]@{ name = "producer.json"; bytes = (Get-Item $producerPath).Length; sha256 = Get-Sha256Hex -Path $producerPath },
      [ordered]@{ name = $outputName; bytes = (Get-Item $outputPath).Length; sha256 = if ($BreakOutputDigest) { "0" * 64 } else { $outputDigest } }
    )
    trustedMachineConfirmationRequired = $true
    sourceOverwriteAllowed = $false
    calculationSupportClaimed = $false
    arrayWritebackClaimed = $false
  }
  $manifestPath = Join-Path $root "manifest.json"
  Write-JsonFile -Path $manifestPath -Value $manifest
  $stream = [IO.File]::Open($BundlePath, [IO.FileMode]::CreateNew)
  try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      foreach ($member in @(
        @{ Name = "manifest.json"; Path = $manifestPath },
        @{ Name = "producer.json"; Path = $producerPath },
        @{ Name = $outputName; Path = $outputPath }
      )) {
        $entry = $archive.CreateEntry($member.Name)
        $entryStream = $entry.Open()
        $sourceStream = [IO.File]::OpenRead($member.Path)
        try { $sourceStream.CopyTo($entryStream) } finally { $sourceStream.Dispose(); $entryStream.Dispose() }
      }
    } finally { $archive.Dispose() }
  } finally { $stream.Dispose() }
}

function New-Destination {
  param([string]$Name)
  $root = Join-Path $auditRoot $Name
  $fixtureRoot = Join-Path $root "fixtures"
  New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
  $matrixPath = Join-Path $root "matrix.json"
  $capabilityPath = Join-Path $root "capabilities.json"
  Copy-Item -LiteralPath $sourceMatrix -Destination $matrixPath
  Copy-Item -LiteralPath $sourceCapabilities -Destination $capabilityPath
  return [ordered]@{ fixtureRoot = $fixtureRoot; matrixPath = $matrixPath; capabilityPath = $capabilityPath }
}

try {
  $excelBundle = Join-Path $auditRoot "excel-valid.zip"
  $libreBundle = Join-Path $auditRoot "libreoffice-valid.zip"
  New-ValidBundle -ProducerId "microsoft-excel" -BundlePath $excelBundle
  New-ValidBundle -ProducerId "libreoffice-calc" -BundlePath $libreBundle
  $success = New-Destination -Name "success"
  & $closure -ExcelBundlePath $excelBundle -LibreOfficeBundlePath $libreBundle -ConfirmTrustedProducers `
    -AuditFixtureRoot $success.fixtureRoot -AuditMatrixPath $success.matrixPath -AuditCapabilityPath $success.capabilityPath | Out-Null
  $closedMatrix = Get-Content -Raw -LiteralPath $success.matrixPath | ConvertFrom-Json
  $closedCapabilities = Get-Content -Raw -LiteralPath $success.capabilityPath | ConvertFrom-Json
  if ($closedMatrix.status -ne "verified" -or [int]$closedMatrix.verifiedProducers -ne 3 -or
      $closedCapabilities.arrayFormulaReadContract.fullProducerMatrixVerified -ne $true -or
      @($closedMatrix.producers | Where-Object { $_.status -eq "verified" }).Count -ne 3) {
    throw "X3-B6 valid pair did not close the isolated producer matrix"
  }
  foreach ($file in @(
    "array-formula-microsoft-excel.xlsx", "array-formula-microsoft-excel.json",
    "array-formula-libreoffice-calc.xlsx", "array-formula-libreoffice-calc.json"
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $success.fixtureRoot $file) -PathType Leaf)) {
      throw "X3-B6 valid pair did not promote isolated evidence: $file"
    }
  }

  $brokenLibreBundle = Join-Path $auditRoot "libreoffice-broken.zip"
  New-ValidBundle -ProducerId "libreoffice-calc" -BundlePath $brokenLibreBundle -BreakOutputDigest
  $failure = New-Destination -Name "failure"
$matrixHash = Get-Sha256Hex -Path $failure.matrixPath
$capabilityHash = Get-Sha256Hex -Path $failure.capabilityPath
  $stdout = Join-Path $auditRoot "failure-stdout.log"
  $stderr = Join-Path $auditRoot "failure-stderr.log"
  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $closure,
      "-ExcelBundlePath", $excelBundle, "-LibreOfficeBundlePath", $brokenLibreBundle,
      "-ConfirmTrustedProducers", "-AuditFixtureRoot", $failure.fixtureRoot,
      "-AuditMatrixPath", $failure.matrixPath, "-AuditCapabilityPath", $failure.capabilityPath) `
    -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Wait -PassThru
  $failureMessage = (Get-Content -Raw -LiteralPath $stdout) + (Get-Content -Raw -LiteralPath $stderr)
  if ($process.ExitCode -eq 0 -or $failureMessage -notmatch "member digest drifted") {
    throw "X3-B6 broken second bundle did not fail in isolated validation"
  }
if ((Get-Sha256Hex -Path $failure.matrixPath) -ne $matrixHash -or
    (Get-Sha256Hex -Path $failure.capabilityPath) -ne $capabilityHash -or
      @(Get-ChildItem -LiteralPath $failure.fixtureRoot -File).Count -ne 0) {
    throw "X3-B6 broken pair changed destination state"
  }
  Write-Output "X3-B6 array producer matrix closure OK: valid pair promoted 3/3 atomically; broken second bundle left destination at 1/3"
} finally {
  if (Test-Path -LiteralPath $auditRoot) {
    $resolved = (Resolve-Path -LiteralPath $auditRoot).Path
    $temp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove X3-B6 test directory outside TEMP: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
