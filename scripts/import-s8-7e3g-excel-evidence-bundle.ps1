param(
  [Parameter(Mandatory = $true)]
  [string]$BundlePath
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "powershell-sha256.ps1")
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$bundle = [System.IO.Path]::GetFullPath($BundlePath)
$baseline = Join-Path $workspace "fixtures\xlsx\output-reopen\s8-7e3g-longedit-multi-axis.xlsx"
$target = Join-Path $workspace "fixtures\xlsx\output-reopen\s8-7e3g-microsoft-excel.xlsx"
$matrixPath = Join-Path $workspace "docs\evidence\s8-7e3g-xlsx-pivot-multi-axis-roundtrip\matrix.json"
if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw "Evidence bundle is missing: $bundle" }
if (Test-Path -LiteralPath $target) { throw "Refusing to overwrite existing Microsoft Excel evidence: $target" }

$requiredMembers = @("manifest.json", "producer.json", "s8-7e3g-microsoft-excel.xlsx")
$auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3g-excel-import-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
$promoted = $false
try {
  $bundleStream = [System.IO.File]::OpenRead($bundle)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new(
      $bundleStream,
      [System.IO.Compression.ZipArchiveMode]::Read,
      $false
    )
    try {
      $names = @($archive.Entries | ForEach-Object { $_.FullName })
      if ($names.Count -ne $requiredMembers.Count -or
          (@($names | Sort-Object) -join "|") -ne (@($requiredMembers | Sort-Object) -join "|")) {
        throw "Excel evidence bundle must contain exactly: $($requiredMembers -join ', ')"
      }
      if (@($names | Group-Object | Where-Object { $_.Count -ne 1 }).Count -ne 0) {
        throw "Excel evidence bundle contains duplicate members"
      }
      foreach ($entry in $archive.Entries) {
        if ($entry.Length -le 0 -or $entry.Length -gt 50MB) {
          throw "Excel evidence member has an invalid size: $($entry.FullName)"
        }
        $destination = Join-Path $auditRoot $entry.FullName
        $entryStream = $entry.Open()
        $destinationStream = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew)
        try { $entryStream.CopyTo($destinationStream) }
        finally {
          $entryStream.Dispose()
          $destinationStream.Dispose()
        }
      }
    }
    finally { $archive.Dispose() }
  }
  finally { $bundleStream.Dispose() }

  $manifestPath = Join-Path $auditRoot "manifest.json"
  $producerPath = Join-Path $auditRoot "producer.json"
  $outputPath = Join-Path $auditRoot "s8-7e3g-microsoft-excel.xlsx"
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $producer = Get-Content -Raw -LiteralPath $producerPath | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 1 -or $manifest.stage -ne "S8-7E3G-D" -or
      $manifest.status -ne "excel_evidence_bundle" -or $manifest.producerId -ne "microsoft-excel") {
    throw "Excel evidence manifest identity is invalid"
  }
  if ($manifest.trustedMachineConfirmationRequired -ne $true -or
      $manifest.sourceOverwriteAllowed -ne $false -or $manifest.reliableSaveAllowed -ne $false) {
    throw "Excel evidence manifest safety boundary drifted"
  }
  if ([string]$manifest.sourceCommit -notmatch '^[0-9a-fA-F]{40}$') {
    throw "Excel evidence manifest source commit is invalid"
  }
  $producerEnvironment = $manifest.producerEnvironment
  $environmentIdentityText = "$($producerEnvironment.localServer) $($producerEnvironment.identity.path)"
  if ($producerEnvironment.status -ne "available" -or
      $producerEnvironment.trustedMicrosoftExcelAvailable -ne $true -or
      $producerEnvironment.progId -ne "Excel.Application" -or
      $producerEnvironment.clsid -ne "{00024500-0000-0000-C000-000000000046}" -or
      $producerEnvironment.localServer -notmatch '(?i)EXCEL\.EXE' -or
      $producerEnvironment.identity.path -notmatch '(?i)Microsoft Office' -or
      $environmentIdentityText -match '(?i)kingsoft|WPS Office|\\et\.exe') {
    throw "Excel evidence manifest does not contain a trusted Microsoft Excel identity"
  }
  $baselineHash = Get-Sha256Hex -Path $baseline
  if ($manifest.baseline.sha256 -ne $baselineHash -or
      [long]$manifest.baseline.bytes -ne (Get-Item -LiteralPath $baseline).Length) {
    throw "Excel evidence bundle is bound to a different LongEdit baseline"
  }
  $members = @{}
  foreach ($member in $manifest.members) { $members[$member.name] = $member }
  foreach ($memberName in @("producer.json", "s8-7e3g-microsoft-excel.xlsx")) {
    $memberPath = Join-Path $auditRoot $memberName
    $member = $members[$memberName]
    if (-not $member -or [long]$member.bytes -ne (Get-Item -LiteralPath $memberPath).Length -or
      $member.sha256 -ne (Get-Sha256Hex -Path $memberPath)) {
      throw "Excel evidence member digest drifted: $memberName"
    }
  }
  if ($producer.id -ne "microsoft-excel" -or $producer.status -ne "verified" -or
      $producer.producer -ne "Microsoft Excel" -or
      $producer.version -ne $producerEnvironment.identity.version -or
      $producer.build -ne $producerEnvironment.identity.build -or
      $producer.refreshSucceeded -ne $true -or $producer.saveSucceeded -ne $true -or
      $producer.processRestarted -ne $true -or $producer.reopenVerified -ne $true -or
      $producer.repairPromptObserved -ne $false) {
    throw "Microsoft Excel producer lifecycle evidence is incomplete"
  }
  foreach ($gate in @("open_baseline", "refresh", "save", "quit_process", "reopen_in_new_process", "verify_no_repair_prompt", "reparse_longedit_semantics")) {
    if ($producer.completedGates -notcontains $gate) { throw "Microsoft Excel producer evidence is missing gate: $gate" }
  }
  foreach ($snapshotName in @("before", "afterSave", "afterReopen")) {
    $snapshot = $producer.$snapshotName
    if ($snapshot.pivotName -ne "MultiAxisPivot" -or $snapshot.outputRange -ne "A3:I12" -or
        [int]$snapshot.rowFieldCount -ne 2 -or [int]$snapshot.columnFieldCount -ne 2 -or
        [int]$snapshot.dataFieldCount -ne 1 -or [int]$snapshot.pageFieldCount -ne 0 -or
        $snapshot.keyCell -ne "I12" -or [double]$snapshot.keyValue -ne 424) {
      throw "Microsoft Excel producer snapshot drifted: $snapshotName"
    }
  }
  if ($producer.outputFile -ne "s8-7e3g-microsoft-excel.xlsx" -or
      [long]$producer.outputBytes -ne (Get-Item -LiteralPath $outputPath).Length -or
      $producer.outputSha256 -ne (Get-Sha256Hex -Path $outputPath)) {
    throw "Microsoft Excel producer output binding drifted"
  }

  $reparseTarget = Join-Path $auditRoot "longedit-reparse.xlsx"
  $json = & cargo run --quiet --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin xlsx-pivot-audit-copy -- $outputPath $reparseTarget multi_axis
  if ($LASTEXITCODE -ne 0) { throw "LongEdit rejected imported Microsoft Excel output" }
  $reparse = ($json -join [Environment]::NewLine) | ConvertFrom-Json
  if ($reparse.status -ne "audit_copy_verified" -or $reparse.pivotName -ne "MultiAxisPivot" -or
      $reparse.outputRange -ne "A3:I12" -or [int]$reparse.outputCellCount -ne 80 -or
      [int]$reparse.previewGroupCount -ne 16 -or [int]$reparse.rowFieldCount -ne 2 -or
      [int]$reparse.columnFieldCount -ne 2 -or [int]$reparse.dataFieldCount -ne 1 -or
      [int]$reparse.pageFieldCount -ne 0) {
    throw "LongEdit semantic reparse of imported Microsoft Excel output drifted"
  }

  $matrix = Get-Content -Raw -LiteralPath $matrixPath | ConvertFrom-Json
  $entries = @{}
  foreach ($entry in $matrix.producers) { $entries[$entry.id] = $entry }
  $entries["microsoft-excel"] = $producer
  $matrix.producers = @(
    $entries["microsoft-excel"],
    $entries["wps-spreadsheets"],
    $entries["libreoffice-calc"]
  )
  $matrix.status = "verified"
  $matrix.complete = $true
  $matrix.verifiedCount = 3
  $matrix.verifiedAt = [DateTime]::UtcNow.ToString("o")
  $matrix.environment.microsoftExcel.status = "verified_evidence"
  $matrix.environment.microsoftExcel.evidence = "Imported from a user-confirmed trusted Microsoft Excel evidence bundle"
  $matrix.blockedUntil = @()

  $matrixTemp = "$matrixPath.import-$([guid]::NewGuid().ToString('N')).tmp"
  $matrixBackup = "$matrixPath.import-backup-$([guid]::NewGuid().ToString('N')).json"
  [System.IO.File]::WriteAllText(
    $matrixTemp,
    ($matrix | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  try {
    Copy-Item -LiteralPath $outputPath -Destination $target
    [System.IO.File]::Replace($matrixTemp, $matrixPath, $matrixBackup)
    $promoted = $true
  }
  finally {
    if (-not $promoted -and (Test-Path -LiteralPath $target)) {
      Remove-Item -LiteralPath $target -Force
    }
    if (Test-Path -LiteralPath $matrixTemp) { Remove-Item -LiteralPath $matrixTemp -Force }
    if (Test-Path -LiteralPath $matrixBackup) { Remove-Item -LiteralPath $matrixBackup -Force }
  }
  Write-Output "S8-7E3G Microsoft Excel evidence imported: matrix is now 3/3 verified"
}
finally {
  if (Test-Path -LiteralPath $auditRoot) {
    $resolvedAuditRoot = (Resolve-Path -LiteralPath $auditRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolvedAuditRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove import directory outside TEMP: $resolvedAuditRoot"
    }
    Remove-Item -LiteralPath $resolvedAuditRoot -Recurse -Force
  }
}
