$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "powershell-sha256.ps1")
Add-Type -AssemblyName System.IO.Compression

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$importer = Join-Path $workspace "scripts\import-s8-7e3g-excel-evidence-bundle.ps1"
$baseline = Join-Path $workspace "fixtures\xlsx\output-reopen\s8-7e3g-longedit-multi-axis.xlsx"
$sampleOutput = Join-Path $workspace "fixtures\xlsx\output-reopen\s8-7e3g-wps-spreadsheets.xlsx"
$matrixPath = Join-Path $workspace "docs\evidence\s8-7e3g-xlsx-pivot-multi-axis-roundtrip\matrix.json"
$excelTarget = Join-Path $workspace "fixtures\xlsx\output-reopen\s8-7e3g-microsoft-excel.xlsx"
foreach ($requiredPath in @($importer, $baseline, $sampleOutput, $matrixPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Excel evidence rejection test dependency is missing: $requiredPath"
  }
}
if (Test-Path -LiteralPath $excelTarget) {
  throw "Rejection matrix only runs before trusted Microsoft Excel evidence exists"
}

$auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3g-excel-rejections-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null

function Write-JsonFile {
  param([string]$Path, $Value)
  [System.IO.File]::WriteAllText(
    $Path,
    ($Value | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
}

function New-RejectionBundle {
  param(
    [string]$CaseId,
    [string]$BundlePath
  )
  $caseRoot = Join-Path $auditRoot $CaseId
  New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null
  $outputPath = Join-Path $caseRoot "s8-7e3g-microsoft-excel.xlsx"
  Copy-Item -LiteralPath $sampleOutput -Destination $outputPath
  $snapshot = [ordered]@{
    pivotCount = 1
    pivotName = "MultiAxisPivot"
    outputRange = "A3:I12"
    rowFieldCount = 2
    columnFieldCount = 2
    dataFieldCount = 1
    pageFieldCount = 0
    keyCell = "I12"
    keyValue = 424
  }
  $completedGates = @(
    "open_baseline",
    "refresh",
    "save",
    "quit_process",
    "reopen_in_new_process",
    "verify_no_repair_prompt",
    "reparse_longedit_semantics"
  )
  if ($CaseId -eq "missing_gate") {
    $completedGates = @($completedGates | Where-Object { $_ -ne "reparse_longedit_semantics" })
  }
  $outputHash = Get-Sha256Hex -Path $outputPath
  $producer = [ordered]@{
    id = "microsoft-excel"
    producer = "Microsoft Excel"
    status = "verified"
    version = "16.0"
    build = "synthetic-rejection-only"
    method = "Synthetic invalid evidence used only to verify rejection paths."
    completedGates = $completedGates
    refreshSucceeded = $true
    saveSucceeded = $true
    processRestarted = $true
    reopenVerified = $true
    repairPromptObserved = $false
    before = $snapshot
    afterSave = $snapshot
    afterReopen = $snapshot
    outputFile = "s8-7e3g-microsoft-excel.xlsx"
    outputSha256 = $outputHash
    outputBytes = (Get-Item -LiteralPath $outputPath).Length
  }
  $producerPath = Join-Path $caseRoot "producer.json"
  Write-JsonFile -Path $producerPath -Value $producer
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = "S8-7E3G-D"
    status = "excel_evidence_bundle"
    createdAt = [DateTime]::UtcNow.ToString("o")
    sourceCommit = "0000000000000000000000000000000000000000"
    producerEnvironment = [ordered]@{
      status = "available"
      trustedMicrosoftExcelAvailable = $true
      progId = "Excel.Application"
      clsid = "{00024500-0000-0000-C000-000000000046}"
      localServer = "C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE /Automation"
      identity = [ordered]@{
        name = "Microsoft Excel"
        version = "16.0"
        build = "synthetic-rejection-only"
        path = "C:\Program Files\Microsoft Office\root\Office16"
      }
    }
    baseline = [ordered]@{
      file = "s8-7e3g-longedit-multi-axis.xlsx"
      bytes = (Get-Item -LiteralPath $baseline).Length
      sha256 = Get-Sha256Hex -Path $baseline
    }
    members = @(
      [ordered]@{
        name = "producer.json"
        bytes = (Get-Item -LiteralPath $producerPath).Length
      sha256 = Get-Sha256Hex -Path $producerPath
      },
      [ordered]@{
        name = "s8-7e3g-microsoft-excel.xlsx"
        bytes = (Get-Item -LiteralPath $outputPath).Length
        sha256 = $outputHash
      }
    )
    producerId = "microsoft-excel"
    trustedMachineConfirmationRequired = $true
    sourceOverwriteAllowed = $false
    reliableSaveAllowed = $false
  }
  if ($CaseId -eq "baseline_drift") {
    $manifest.baseline.sha256 = "0" * 64
  }
  if ($CaseId -eq "output_digest_drift") {
    $manifest.members[1].sha256 = "0" * 64
  }
  $manifestPath = Join-Path $caseRoot "manifest.json"
  Write-JsonFile -Path $manifestPath -Value $manifest

  $bundleStream = [System.IO.File]::Open($BundlePath, [System.IO.FileMode]::CreateNew)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new(
      $bundleStream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      $members = @(
        @{ Name = "manifest.json"; Path = $manifestPath },
        @{ Name = "producer.json"; Path = $producerPath },
        @{ Name = "s8-7e3g-microsoft-excel.xlsx"; Path = $outputPath }
      )
      if ($CaseId -eq "extra_member") {
        $extraPath = Join-Path $caseRoot "unexpected.txt"
        [System.IO.File]::WriteAllText($extraPath, "unexpected", [System.Text.UTF8Encoding]::new($false))
        $members += @{ Name = "unexpected.txt"; Path = $extraPath }
      }
      foreach ($member in $members) {
        $entry = $archive.CreateEntry($member.Name)
        $entryStream = $entry.Open()
        $sourceStream = [System.IO.File]::OpenRead($member.Path)
        try { $sourceStream.CopyTo($entryStream) }
        finally {
          $sourceStream.Dispose()
          $entryStream.Dispose()
        }
      }
    }
    finally { $archive.Dispose() }
  }
  finally { $bundleStream.Dispose() }
}

try {
  $cases = [ordered]@{
    extra_member = "must contain exactly"
    baseline_drift = "different LongEdit baseline"
    missing_gate = "missing gate"
    output_digest_drift = "member digest drifted"
  }
  $matrixHash = Get-Sha256Hex -Path $matrixPath
  foreach ($case in $cases.GetEnumerator()) {
    $bundlePath = Join-Path $auditRoot "$($case.Key).zip"
    New-RejectionBundle -CaseId $case.Key -BundlePath $bundlePath
    $stdout = Join-Path $auditRoot "$($case.Key)-stdout.log"
    $stderr = Join-Path $auditRoot "$($case.Key)-stderr.log"
    $process = Start-Process -FilePath "powershell.exe" `
      -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $importer, "-BundlePath", $bundlePath) `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -Wait `
      -PassThru
    $message = ((Get-Content -Raw -LiteralPath $stdout) + (Get-Content -Raw -LiteralPath $stderr))
    if ($process.ExitCode -eq 0 -or $message -notmatch [regex]::Escape($case.Value)) {
      throw "Excel evidence rejection case did not fail as expected: $($case.Key)"
    }
    if (Test-Path -LiteralPath $excelTarget) {
      throw "Excel evidence rejection case created a target: $($case.Key)"
    }
    if ((Get-Sha256Hex -Path $matrixPath) -ne $matrixHash) {
      throw "Excel evidence rejection case changed the matrix: $($case.Key)"
    }
  }
  Write-Output "S8-7E3G-E Excel evidence rejection matrix OK: 4/4 malformed bundles rejected without state changes"
}
finally {
  if (Test-Path -LiteralPath $auditRoot) {
    $resolvedAuditRoot = (Resolve-Path -LiteralPath $auditRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolvedAuditRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove rejection test directory outside TEMP: $resolvedAuditRoot"
    }
    Remove-Item -LiteralPath $resolvedAuditRoot -Recurse -Force
  }
}
