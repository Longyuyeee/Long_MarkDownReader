param(
  [Parameter(Mandatory = $true)]
  [string]$ExcelBundlePath,
  [Parameter(Mandatory = $true)]
  [string]$LibreOfficeBundlePath,
  [switch]$ConfirmTrustedProducers,
  [string]$AuditFixtureRoot = "",
  [string]$AuditMatrixPath = "",
  [string]$AuditCapabilityPath = ""
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmTrustedProducers) {
  throw "Matrix closure requires -ConfirmTrustedProducers after both source machines and producer identities are confirmed"
}

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$importer = Join-Path $workspace "scripts\import-x3-b5-array-producer-evidence.ps1"
$destinationFixtureRoot = Join-Path $workspace "src-tauri\tests\fixtures\workbook"
$destinationMatrixPath = Join-Path $workspace "docs\evidence\x3-b2-xlsx-array-producers\matrix.json"
$destinationCapabilityPath = Join-Path $workspace "shared\xlsx-formula-capabilities.json"
$auditOverrides = @($AuditFixtureRoot, $AuditMatrixPath, $AuditCapabilityPath)
$auditOverrideCount = @($auditOverrides | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
if ($auditOverrideCount -ne 0 -and $auditOverrideCount -ne 3) {
  throw "AuditFixtureRoot, AuditMatrixPath, and AuditCapabilityPath must be provided together"
}
if ($auditOverrideCount -eq 3) {
  $destinationFixtureRoot = [IO.Path]::GetFullPath($AuditFixtureRoot)
  $destinationMatrixPath = [IO.Path]::GetFullPath($AuditMatrixPath)
  $destinationCapabilityPath = [IO.Path]::GetFullPath($AuditCapabilityPath)
  $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
  foreach ($path in @($destinationFixtureRoot, $destinationMatrixPath, $destinationCapabilityPath)) {
    if (-not $path.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Audit closure overrides are restricted to TEMP"
    }
  }
}

$excelBundle = [IO.Path]::GetFullPath($ExcelBundlePath)
$libreOfficeBundle = [IO.Path]::GetFullPath($LibreOfficeBundlePath)
foreach ($bundle in @($excelBundle, $libreOfficeBundle)) {
  if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw "X3-B6 evidence bundle is missing: $bundle" }
}
foreach ($requiredPath in @($importer, $destinationMatrixPath, $destinationCapabilityPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "X3-B6 closure dependency is missing: $requiredPath" }
}

$initialMatrix = Get-Content -Raw -LiteralPath $destinationMatrixPath | ConvertFrom-Json
if ([int]$initialMatrix.verifiedProducers -ne 1 -or $initialMatrix.status -ne "partial" -or
    @($initialMatrix.producers | Where-Object { $_.id -eq "microsoft-excel" }).status -ne "blocked_environment" -or
    @($initialMatrix.producers | Where-Object { $_.id -eq "libreoffice-calc" }).status -ne "blocked_environment") {
  throw "X3-B6 atomic pair closure requires the checked-in 1/3 matrix with both external producers blocked"
}

$evidenceFiles = @(
  "array-formula-microsoft-excel.xlsx",
  "array-formula-microsoft-excel.json",
  "array-formula-libreoffice-calc.xlsx",
  "array-formula-libreoffice-calc.json"
)
foreach ($file in $evidenceFiles) {
  $destination = Join-Path $destinationFixtureRoot $file
  if (Test-Path -LiteralPath $destination) { throw "Refusing to overwrite existing X3-B6 evidence: $destination" }
}

$closureRoot = Join-Path $env:TEMP ("longedit-x3-b6-array-closure-" + [guid]::NewGuid().ToString("N"))
$stagingFixtureRoot = Join-Path $closureRoot "fixtures"
$stagingMatrixPath = Join-Path $closureRoot "matrix.json"
$stagingCapabilityPath = Join-Path $closureRoot "capabilities.json"
New-Item -ItemType Directory -Path $stagingFixtureRoot -Force | Out-Null
Copy-Item -LiteralPath $destinationMatrixPath -Destination $stagingMatrixPath
Copy-Item -LiteralPath $destinationCapabilityPath -Destination $stagingCapabilityPath
$promoted = $false
$matrixReplaced = $false
$capabilityReplaced = $false
$matrixBackup = "$destinationMatrixPath.x3-b6-backup-$([guid]::NewGuid().ToString('N')).json"
$capabilityBackup = "$destinationCapabilityPath.x3-b6-backup-$([guid]::NewGuid().ToString('N')).json"
try {
  & $importer -BundlePath $excelBundle -ConfirmTrustedProducer `
    -AuditFixtureRoot $stagingFixtureRoot -AuditMatrixPath $stagingMatrixPath -AuditCapabilityPath $stagingCapabilityPath | Out-Null
  & $importer -BundlePath $libreOfficeBundle -ConfirmTrustedProducer `
    -AuditFixtureRoot $stagingFixtureRoot -AuditMatrixPath $stagingMatrixPath -AuditCapabilityPath $stagingCapabilityPath | Out-Null

  $candidateMatrix = Get-Content -Raw -LiteralPath $stagingMatrixPath | ConvertFrom-Json
  $candidateCapabilities = Get-Content -Raw -LiteralPath $stagingCapabilityPath | ConvertFrom-Json
  if ($candidateMatrix.status -ne "verified" -or [int]$candidateMatrix.verifiedProducers -ne 3 -or
      $candidateCapabilities.arrayFormulaReadContract.fullProducerMatrixVerified -ne $true -or
      [int]$candidateCapabilities.arrayFormulaReadContract.verifiedProducerCount -ne 3 -or
      $candidateCapabilities.arrayFormulaReadContract.status -ne "producer_matrix_verified_pending_release_audit") {
    throw "X3-B6 isolated candidate did not reach the 3/3 pending-release state"
  }
  foreach ($file in $evidenceFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $stagingFixtureRoot $file) -PathType Leaf)) {
      throw "X3-B6 isolated candidate is missing evidence: $file"
    }
  }

  $matrixCandidate = "$destinationMatrixPath.x3-b6-candidate-$([guid]::NewGuid().ToString('N')).tmp"
  $capabilityCandidate = "$destinationCapabilityPath.x3-b6-candidate-$([guid]::NewGuid().ToString('N')).tmp"
  Copy-Item -LiteralPath $stagingMatrixPath -Destination $matrixCandidate
  Copy-Item -LiteralPath $stagingCapabilityPath -Destination $capabilityCandidate
  try {
    foreach ($file in $evidenceFiles) {
      Copy-Item -LiteralPath (Join-Path $stagingFixtureRoot $file) -Destination (Join-Path $destinationFixtureRoot $file)
    }
    [IO.File]::Replace($matrixCandidate, $destinationMatrixPath, $matrixBackup)
    $matrixReplaced = $true
    [IO.File]::Replace($capabilityCandidate, $destinationCapabilityPath, $capabilityBackup)
    $capabilityReplaced = $true
    $promoted = $true
  } finally {
    if (-not $promoted) {
      if ($capabilityReplaced -and (Test-Path -LiteralPath $capabilityBackup)) {
        [IO.File]::Replace($capabilityBackup, $destinationCapabilityPath, $null)
      }
      if ($matrixReplaced -and (Test-Path -LiteralPath $matrixBackup)) {
        [IO.File]::Replace($matrixBackup, $destinationMatrixPath, $null)
      }
      foreach ($file in $evidenceFiles) {
        $destination = Join-Path $destinationFixtureRoot $file
        if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
      }
    }
    foreach ($temporary in @($matrixCandidate, $capabilityCandidate, $matrixBackup, $capabilityBackup)) {
      if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
  }
  Write-Output "X3-B6 producer matrix closed atomically: Microsoft Excel + WPS Spreadsheets + LibreOffice Calc = 3/3 pending release audit"
} finally {
  if (Test-Path -LiteralPath $closureRoot) {
    $resolved = (Resolve-Path -LiteralPath $closureRoot).Path
    $temp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove closure directory outside TEMP: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
