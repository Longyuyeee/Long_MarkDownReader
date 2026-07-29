$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$importer = Join-Path $workspace "scripts\import-x3-b5-array-producer-evidence.ps1"
$baseline = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-boundary.xlsx"
$sampleOutput = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-wps-spreadsheets.xlsx"
$sourceMatrixPath = Join-Path $workspace "docs\evidence\x3-b2-xlsx-array-producers\matrix.json"
$sourceCapabilityPath = Join-Path $workspace "shared\xlsx-formula-capabilities.json"
foreach ($requiredPath in @($importer, $baseline, $sampleOutput, $sourceMatrixPath, $sourceCapabilityPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "X3-B5 rejection dependency is missing: $requiredPath" }
}

$auditJson = & cargo run --quiet --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin xlsx-array-audit -- $sampleOutput
if ($LASTEXITCODE -ne 0) { throw "Sample output failed LongEdit semantic audit" }
$snapshot = ($auditJson -join [Environment]::NewLine) | ConvertFrom-Json
$auditRoot = Join-Path $env:TEMP ("longedit-x3-b5-array-rejections-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
$fixtureRoot = Join-Path $auditRoot "fixtures"
$matrixPath = Join-Path $auditRoot "matrix.json"
$capabilityPath = Join-Path $auditRoot "capabilities.json"
$target = Join-Path $fixtureRoot "array-formula-microsoft-excel.xlsx"
$targetManifest = Join-Path $fixtureRoot "array-formula-microsoft-excel.json"
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
Copy-Item -LiteralPath $sourceMatrixPath -Destination $matrixPath
Copy-Item -LiteralPath $sourceCapabilityPath -Destination $capabilityPath

function Write-JsonFile {
  param([string]$Path, $Value)
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 14) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}

function New-RejectionBundle {
  param([string]$CaseId, [string]$BundlePath)
  $caseRoot = Join-Path $auditRoot $CaseId
  New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null
  $outputName = "array-formula-microsoft-excel.xlsx"
  $outputPath = Join-Path $caseRoot $outputName
  Copy-Item -LiteralPath $sampleOutput -Destination $outputPath
  $gates = @("open_baseline", "native_save", "quit_process", "reopen_in_new_process", "verify_no_repair_prompt", "verify_array_declarations", "reparse_longedit_semantics")
  if ($CaseId -eq "missing_gate") { $gates = @($gates | Where-Object { $_ -ne "reparse_longedit_semantics" }) }
  $executable = if ($CaseId -eq "producer_identity_spoof") {
    "C:\Users\tester\AppData\Local\Kingsoft\WPS Office\office6\et.exe"
  } else {
    "C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"
  }
  $producer = [ordered]@{
    schemaVersion = 1
    stage = "X3-B5"
    id = "microsoft-excel"
    producer = "Microsoft Excel"
    status = "verified"
    identity = [ordered]@{
      progId = "Excel.Application"
      clsid = "{00024500-0000-0000-C000-000000000046}"
      localServer = "`"$executable`" /Automation"
      executable = $executable
      applicationName = "Microsoft Excel"
      version = "16.0"
      build = "synthetic-rejection-only"
    }
    completedGates = $gates
    nativeSave = $true
    processRestarted = $true
    sessionIds = @(101, 202)
    independentReopen = $true
    repairPromptObserved = $false
    before = $snapshot
    afterSave = $snapshot
    afterReopen = $snapshot
    outputFile = $outputName
    outputBytes = (Get-Item -LiteralPath $outputPath).Length
    outputSha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $producerPath = Join-Path $caseRoot "producer.json"
  Write-JsonFile -Path $producerPath -Value $producer
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = "X3-B5"
    status = "array_producer_evidence_bundle"
    createdAt = [DateTime]::UtcNow.ToString("o")
    sourceCommit = "0000000000000000000000000000000000000000"
    producerId = "microsoft-excel"
    baseline = [ordered]@{
      file = "array-formula-boundary.xlsx"
      bytes = (Get-Item -LiteralPath $baseline).Length
      sha256 = (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    members = @(
      [ordered]@{ name = "producer.json"; bytes = (Get-Item $producerPath).Length; sha256 = (Get-FileHash $producerPath -Algorithm SHA256).Hash.ToLowerInvariant() },
      [ordered]@{ name = $outputName; bytes = (Get-Item $outputPath).Length; sha256 = (Get-FileHash $outputPath -Algorithm SHA256).Hash.ToLowerInvariant() }
    )
    trustedMachineConfirmationRequired = $true
    sourceOverwriteAllowed = $false
    calculationSupportClaimed = $false
    arrayWritebackClaimed = $false
  }
  if ($CaseId -eq "baseline_drift") { $manifest.baseline.sha256 = "0" * 64 }
  if ($CaseId -eq "output_digest_drift") { $manifest.members[1].sha256 = "0" * 64 }
  $manifestPath = Join-Path $caseRoot "manifest.json"
  Write-JsonFile -Path $manifestPath -Value $manifest
  $stream = [IO.File]::Open($BundlePath, [IO.FileMode]::CreateNew)
  try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      $members = @(
        @{ Name = "manifest.json"; Path = $manifestPath },
        @{ Name = "producer.json"; Path = $producerPath },
        @{ Name = $outputName; Path = $outputPath }
      )
      if ($CaseId -eq "extra_member") {
        $extra = Join-Path $caseRoot "unexpected.txt"
        [IO.File]::WriteAllText($extra, "unexpected", [Text.UTF8Encoding]::new($false))
        $members += @{ Name = "unexpected.txt"; Path = $extra }
      }
      foreach ($member in $members) {
        $entry = $archive.CreateEntry($member.Name)
        $entryStream = $entry.Open(); $sourceStream = [IO.File]::OpenRead($member.Path)
        try { $sourceStream.CopyTo($entryStream) } finally { $sourceStream.Dispose(); $entryStream.Dispose() }
      }
    } finally { $archive.Dispose() }
  } finally { $stream.Dispose() }
}

try {
  $cases = [ordered]@{
    extra_member = "must contain exactly"
    baseline_drift = "different LongEdit baseline"
    missing_gate = "missing gate"
    output_digest_drift = "member digest drifted"
    producer_identity_spoof = "not genuine Microsoft Excel"
  }
  $matrixHash = (Get-FileHash -LiteralPath $matrixPath -Algorithm SHA256).Hash
  $capabilityHash = (Get-FileHash -LiteralPath $capabilityPath -Algorithm SHA256).Hash
  foreach ($case in $cases.GetEnumerator()) {
    $bundlePath = Join-Path $auditRoot "$($case.Key).zip"
    New-RejectionBundle -CaseId $case.Key -BundlePath $bundlePath
    $stdout = Join-Path $auditRoot "$($case.Key)-stdout.log"
    $stderr = Join-Path $auditRoot "$($case.Key)-stderr.log"
    $process = Start-Process -FilePath "powershell.exe" `
      -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $importer, "-BundlePath", $bundlePath, "-ConfirmTrustedProducer", "-AuditFixtureRoot", $fixtureRoot, "-AuditMatrixPath", $matrixPath, "-AuditCapabilityPath", $capabilityPath) `
      -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Wait -PassThru
    $message = (Get-Content -Raw -LiteralPath $stdout) + (Get-Content -Raw -LiteralPath $stderr)
    if ($process.ExitCode -eq 0 -or $message -notmatch [regex]::Escape($case.Value)) {
      throw "X3-B5 rejection case did not fail as expected: $($case.Key)`n$message"
    }
    if ((Test-Path -LiteralPath $target) -or (Test-Path -LiteralPath $targetManifest)) {
      throw "X3-B5 rejection case created a target: $($case.Key)"
    }
    if ((Get-FileHash -LiteralPath $matrixPath -Algorithm SHA256).Hash -ne $matrixHash) {
      throw "X3-B5 rejection case changed the matrix: $($case.Key)"
    }
    if ((Get-FileHash -LiteralPath $capabilityPath -Algorithm SHA256).Hash -ne $capabilityHash) {
      throw "X3-B5 rejection case changed the capability contract: $($case.Key)"
    }
  }
  $validBundle = Join-Path $auditRoot "valid_sandbox.zip"
  New-RejectionBundle -CaseId "valid_sandbox" -BundlePath $validBundle
  & $importer -BundlePath $validBundle -ConfirmTrustedProducer `
    -AuditFixtureRoot $fixtureRoot -AuditMatrixPath $matrixPath -AuditCapabilityPath $capabilityPath | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $target) -or -not (Test-Path -LiteralPath $targetManifest)) {
    throw "X3-B5 valid sandbox bundle did not promote both evidence targets"
  }
  $promotedMatrix = Get-Content -Raw -LiteralPath $matrixPath | ConvertFrom-Json
  $promotedCapabilities = Get-Content -Raw -LiteralPath $capabilityPath | ConvertFrom-Json
  if ($promotedMatrix.status -ne "partial" -or [int]$promotedMatrix.verifiedProducers -ne 2 -or
      [int]$promotedCapabilities.arrayFormulaReadContract.verifiedProducerCount -ne 2 -or
      $promotedCapabilities.arrayFormulaReadContract.fullProducerMatrixVerified -ne $false) {
    throw "X3-B5 valid sandbox promotion did not atomically update the 2/3 matrix and capability contract"
  }
  Write-Output "X3-B5 array evidence protocol OK: 5/5 malformed bundles rejected without state changes; valid sandbox import promoted matrix/capability to 2/3"
} finally {
  if (Test-Path -LiteralPath $auditRoot) {
    $resolved = (Resolve-Path -LiteralPath $auditRoot).Path
    $temp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove rejection directory outside TEMP: $resolved" }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
