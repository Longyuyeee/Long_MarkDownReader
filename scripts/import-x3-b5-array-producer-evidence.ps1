param(
  [Parameter(Mandatory = $true)]
  [string]$BundlePath,
  [switch]$ConfirmTrustedProducer,
  [string]$AuditFixtureRoot = "",
  [string]$AuditMatrixPath = "",
  [string]$AuditCapabilityPath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not $ConfirmTrustedProducer) {
  throw "Import requires -ConfirmTrustedProducer after the operator confirms the bundle came from the named genuine desktop producer"
}
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$bundle = [IO.Path]::GetFullPath($BundlePath)
$baseline = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-boundary.xlsx"
$fixtureRoot = Join-Path $workspace "src-tauri\tests\fixtures\workbook"
$matrixPath = Join-Path $workspace "docs\evidence\x3-b2-xlsx-array-producers\matrix.json"
$capabilityPath = Join-Path $workspace "shared\xlsx-formula-capabilities.json"
$cargoManifest = Join-Path $workspace "src-tauri\Cargo.toml"
if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw "Evidence bundle is missing: $bundle" }
$auditOverrideCount = @(@($AuditFixtureRoot, $AuditMatrixPath, $AuditCapabilityPath) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
if ($auditOverrideCount -ne 0 -and $auditOverrideCount -ne 3) {
  throw "AuditFixtureRoot, AuditMatrixPath, and AuditCapabilityPath must be provided together"
}
if (-not [string]::IsNullOrWhiteSpace($AuditFixtureRoot)) {
  $fixtureRoot = [IO.Path]::GetFullPath($AuditFixtureRoot)
  $matrixPath = [IO.Path]::GetFullPath($AuditMatrixPath)
  $capabilityPath = [IO.Path]::GetFullPath($AuditCapabilityPath)
  $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
  if (-not $fixtureRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or
      -not $matrixPath.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or
      -not $capabilityPath.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Audit import overrides are restricted to TEMP"
  }
}

function Assert-ArrayAudit {
  param($Audit, [string]$Label)
  $kinds = @($Audit.arrayFormulas | ForEach-Object { $_.kind })
  $ranges = @($Audit.arrayFormulas | ForEach-Object {
    "$([char](65 + [int]$_.range.left))$([int]$_.range.top + 1):$([char](65 + [int]$_.range.right))$([int]$_.range.bottom + 1)"
  })
  if ($Audit.status -ne "array_semantics_verified" -or $Audit.sheet -ne "Array Boundary" -or
      [int]$Audit.arrayDeclarationCount -ne 2 -or ($kinds -join ",") -ne "legacy_array,dynamic_array" -or
      ($ranges -join ",") -ne "B2:B4,D2:D4") {
    throw "Array semantic snapshot drifted: $Label"
  }
}

$auditRoot = Join-Path $env:TEMP ("longedit-x3-b5-array-import-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
$target = $null
$targetManifest = $null
$promoted = $false
try {
  $bundleStream = [IO.File]::OpenRead($bundle)
  try {
    $archive = [IO.Compression.ZipArchive]::new($bundleStream, [IO.Compression.ZipArchiveMode]::Read, $false)
    try {
      $names = @($archive.Entries | ForEach-Object { $_.FullName })
      $excelMembers = @("manifest.json", "producer.json", "array-formula-microsoft-excel.xlsx")
      $libreMembers = @("manifest.json", "producer.json", "array-formula-libreoffice-calc.xlsx")
      $signature = @($names | Sort-Object) -join "|"
      if ($names.Count -ne 3 -or
          ($signature -ne (@($excelMembers | Sort-Object) -join "|") -and
           $signature -ne (@($libreMembers | Sort-Object) -join "|"))) {
        throw "X3-B5 evidence bundle must contain exactly manifest.json, producer.json, and one allowed producer XLSX"
      }
      if (@($names | Group-Object | Where-Object { $_.Count -ne 1 }).Count -ne 0) {
        throw "X3-B5 evidence bundle contains duplicate members"
      }
      foreach ($entry in $archive.Entries) {
        if ($entry.Length -le 0 -or $entry.Length -gt 50MB) { throw "Evidence member has an invalid size: $($entry.FullName)" }
        $destination = Join-Path $auditRoot $entry.FullName
        $entryStream = $entry.Open()
        $destinationStream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
        try { $entryStream.CopyTo($destinationStream) } finally { $entryStream.Dispose(); $destinationStream.Dispose() }
      }
    } finally { $archive.Dispose() }
  } finally { $bundleStream.Dispose() }

  $manifestPath = Join-Path $auditRoot "manifest.json"
  $producerPath = Join-Path $auditRoot "producer.json"
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $producer = Get-Content -Raw -LiteralPath $producerPath | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 1 -or $manifest.stage -ne "X3-B5" -or
      $manifest.status -ne "array_producer_evidence_bundle" -or
      @("microsoft-excel", "libreoffice-calc") -notcontains $manifest.producerId) {
    throw "X3-B5 evidence manifest identity is invalid"
  }
  if ($manifest.trustedMachineConfirmationRequired -ne $true -or
      $manifest.sourceOverwriteAllowed -ne $false -or $manifest.calculationSupportClaimed -ne $false -or
      $manifest.arrayWritebackClaimed -ne $false -or [string]$manifest.sourceCommit -notmatch '^[0-9a-fA-F]{40}$') {
    throw "X3-B5 evidence manifest safety boundary drifted"
  }
  $outputFile = "array-formula-$($manifest.producerId).xlsx"
  $outputPath = Join-Path $auditRoot $outputFile
  if (-not (Test-Path -LiteralPath $outputPath -PathType Leaf)) { throw "Producer output member does not match manifest identity" }
  $baselineHash = (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($manifest.baseline.file -ne "array-formula-boundary.xlsx" -or
      $manifest.baseline.sha256 -ne $baselineHash -or
      [long]$manifest.baseline.bytes -ne (Get-Item -LiteralPath $baseline).Length) {
    throw "Evidence bundle is bound to a different LongEdit baseline"
  }
  $members = @{}
  foreach ($member in $manifest.members) { $members[$member.name] = $member }
  $declaredMemberNames = @($manifest.members | ForEach-Object { $_.name })
  if ($declaredMemberNames.Count -ne 2 -or
      (@($declaredMemberNames | Sort-Object) -join "|") -ne (@(@("producer.json", $outputFile) | Sort-Object) -join "|")) {
    throw "Evidence manifest member declaration is invalid"
  }
  foreach ($memberName in @("producer.json", $outputFile)) {
    $memberPath = Join-Path $auditRoot $memberName
    $member = $members[$memberName]
    if (-not $member -or [long]$member.bytes -ne (Get-Item -LiteralPath $memberPath).Length -or
        $member.sha256 -ne (Get-FileHash -LiteralPath $memberPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
      throw "Evidence member digest drifted: $memberName"
    }
  }
  if ($producer.schemaVersion -ne 1 -or $producer.stage -ne "X3-B5" -or
      $producer.id -ne $manifest.producerId -or $producer.status -ne "verified" -or
      $producer.nativeSave -ne $true -or $producer.processRestarted -ne $true -or
      $producer.independentReopen -ne $true -or $producer.repairPromptObserved -ne $false) {
    throw "Producer lifecycle evidence is incomplete"
  }
  foreach ($gate in @("open_baseline", "native_save", "quit_process", "reopen_in_new_process", "verify_no_repair_prompt", "verify_array_declarations", "reparse_longedit_semantics")) {
    if ($producer.completedGates -notcontains $gate) { throw "Producer evidence is missing gate: $gate" }
  }
  if (@($producer.sessionIds).Count -ne 2 -or [long]$producer.sessionIds[0] -le 0 -or
      [long]$producer.sessionIds[1] -le 0 -or [long]$producer.sessionIds[0] -eq [long]$producer.sessionIds[1]) {
    throw "Producer evidence does not prove two independent application sessions"
  }
  if ($producer.id -eq "microsoft-excel") {
    $identityText = "$($producer.identity.localServer) $($producer.identity.executable)"
    if ($producer.producer -ne "Microsoft Excel" -or $producer.identity.progId -ne "Excel.Application" -or
        $producer.identity.clsid -ne "{00024500-0000-0000-C000-000000000046}" -or
        $producer.identity.localServer -notmatch '(?i)EXCEL\.EXE' -or
        $producer.identity.executable -notmatch '(?i)Microsoft Office.*EXCEL\.EXE' -or
        $identityText -match '(?i)kingsoft|WPS Office|\\et\.exe') {
      throw "Producer identity is not genuine Microsoft Excel"
    }
  } else {
    $identityText = "$($producer.identity.executable) $($producer.identity.version)"
    if ($producer.producer -ne "LibreOffice Calc" -or
        $producer.identity.executable -notmatch '(?i)soffice\.(com|exe)$' -or
        $producer.identity.version -notmatch '(?i)LibreOffice' -or
        $identityText -match '(?i)kingsoft|WPS Office|Microsoft Excel') {
      throw "Producer identity is not genuine LibreOffice Calc"
    }
  }
  foreach ($snapshotName in @("before", "afterSave", "afterReopen")) {
    Assert-ArrayAudit -Audit $producer.$snapshotName -Label $snapshotName
  }
  if ($producer.outputFile -ne $outputFile -or
      [long]$producer.outputBytes -ne (Get-Item -LiteralPath $outputPath).Length -or
      $producer.outputSha256 -ne (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
    throw "Producer output binding drifted"
  }

  $json = & cargo run --quiet --locked --manifest-path $cargoManifest --bin xlsx-array-audit -- $outputPath
  if ($LASTEXITCODE -ne 0) { throw "LongEdit rejected imported producer output" }
  $longEditAudit = ($json -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-ArrayAudit -Audit $longEditAudit -Label "imported LongEdit semantic reparse"

  $target = Join-Path $fixtureRoot $outputFile
  $targetManifest = Join-Path $fixtureRoot "array-formula-$($producer.id).json"
  if (Test-Path -LiteralPath $target) { throw "Refusing to overwrite existing producer evidence: $target" }
  if (Test-Path -LiteralPath $targetManifest) { throw "Refusing to overwrite existing producer manifest: $targetManifest" }
  $producer | Add-Member -NotePropertyName fixture -NotePropertyValue "src-tauri/tests/fixtures/workbook/$outputFile" -Force
  $producer | Add-Member -NotePropertyName manifest -NotePropertyValue "src-tauri/tests/fixtures/workbook/array-formula-$($producer.id).json" -Force
  $producer | Add-Member -NotePropertyName longEditSemanticRead -NotePropertyValue "verified-by-xlsx-array-audit" -Force
  $producer | Add-Member -NotePropertyName importedAt -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
  $matrix = Get-Content -Raw -LiteralPath $matrixPath | ConvertFrom-Json
  $entries = @{}
  foreach ($entry in $matrix.producers) { $entries[$entry.id] = $entry }
  $entries[$producer.id] = $producer
  $matrix.producers = @($entries["microsoft-excel"], $entries["wps-spreadsheets"], $entries["libreoffice-calc"])
  $verifiedCount = @($matrix.producers | Where-Object { $_.status -eq "verified" }).Count
  $matrix.stage = "X3-B5"
  $matrix.updatedAt = [DateTime]::UtcNow.ToString("o")
  $matrix.verifiedProducers = $verifiedCount
  $matrix.status = if ($verifiedCount -eq [int]$matrix.requiredProducers) { "verified" } else { "partial" }
  $capabilities = Get-Content -Raw -LiteralPath $capabilityPath | ConvertFrom-Json
  $capabilities.arrayFormulaReadContract.verifiedProducerCount = $verifiedCount
  $capabilities.arrayFormulaReadContract.fullProducerMatrixVerified = $verifiedCount -eq [int]$matrix.requiredProducers
  $capabilities.arrayFormulaReadContract.status = if ($verifiedCount -eq [int]$matrix.requiredProducers) {
    "producer_matrix_verified_pending_release_audit"
  } else {
    "partial_producer_matrix"
  }

  $matrixTemp = "$matrixPath.import-$([guid]::NewGuid().ToString('N')).tmp"
  $matrixBackup = "$matrixPath.import-backup-$([guid]::NewGuid().ToString('N')).json"
  $capabilityTemp = "$capabilityPath.import-$([guid]::NewGuid().ToString('N')).tmp"
  $capabilityBackup = "$capabilityPath.import-backup-$([guid]::NewGuid().ToString('N')).json"
  $producerTemp = Join-Path $auditRoot "promoted-producer.json"
  [IO.File]::WriteAllText($producerTemp, ($producer | ConvertTo-Json -Depth 14) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($matrixTemp, ($matrix | ConvertTo-Json -Depth 14) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($capabilityTemp, ($capabilities | ConvertTo-Json -Depth 14) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  $matrixReplaced = $false
  $capabilityReplaced = $false
  try {
    Copy-Item -LiteralPath $outputPath -Destination $target
    Copy-Item -LiteralPath $producerTemp -Destination $targetManifest
    [IO.File]::Replace($matrixTemp, $matrixPath, $matrixBackup)
    $matrixReplaced = $true
    [IO.File]::Replace($capabilityTemp, $capabilityPath, $capabilityBackup)
    $capabilityReplaced = $true
    $promoted = $true
  } finally {
    if (-not $promoted) {
      if ($capabilityReplaced -and (Test-Path -LiteralPath $capabilityBackup)) {
        [IO.File]::Replace($capabilityBackup, $capabilityPath, $null)
      }
      if ($matrixReplaced -and (Test-Path -LiteralPath $matrixBackup)) {
        [IO.File]::Replace($matrixBackup, $matrixPath, $null)
      }
      if ($target -and (Test-Path -LiteralPath $target)) { Remove-Item -LiteralPath $target -Force }
      if ($targetManifest -and (Test-Path -LiteralPath $targetManifest)) { Remove-Item -LiteralPath $targetManifest -Force }
    }
    if (Test-Path -LiteralPath $matrixTemp) { Remove-Item -LiteralPath $matrixTemp -Force }
    if (Test-Path -LiteralPath $matrixBackup) { Remove-Item -LiteralPath $matrixBackup -Force }
    if (Test-Path -LiteralPath $capabilityTemp) { Remove-Item -LiteralPath $capabilityTemp -Force }
    if (Test-Path -LiteralPath $capabilityBackup) { Remove-Item -LiteralPath $capabilityBackup -Force }
  }
  Write-Output "X3-B5 $($producer.producer) evidence imported: producer matrix is $verifiedCount/$($matrix.requiredProducers)"
} finally {
  if (Test-Path -LiteralPath $auditRoot) {
    $resolved = (Resolve-Path -LiteralPath $auditRoot).Path
    $temp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove import directory outside TEMP: $resolved" }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
