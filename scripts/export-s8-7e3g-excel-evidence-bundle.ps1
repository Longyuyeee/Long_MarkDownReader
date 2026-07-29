param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$baseline = Join-Path $workspace "fixtures\xlsx\output-reopen\s8-7e3g-longedit-multi-axis.xlsx"
$producerOutput = Join-Path $workspace "fixtures\xlsx\output-reopen\s8-7e3g-microsoft-excel.xlsx"
$matrixPath = Join-Path $workspace "docs\evidence\s8-7e3g-xlsx-pivot-multi-axis-roundtrip\matrix.json"
$environmentPath = Join-Path $workspace "docs\evidence\s8-7e3g-xlsx-pivot-multi-axis-roundtrip\excel-environment.json"
$bundlePath = [System.IO.Path]::GetFullPath($OutputPath)
if ([System.IO.Path]::GetExtension($bundlePath) -ne ".zip") { throw "Excel evidence bundle must use .zip" }
if (Test-Path -LiteralPath $bundlePath) { throw "Refusing to overwrite existing bundle: $bundlePath" }
if (Test-Path -LiteralPath $producerOutput) {
  throw "Refusing to overwrite existing Microsoft Excel evidence: $producerOutput"
}

& (Join-Path $workspace "scripts\audit-s8-7e3g-excel-environment.ps1")
$environment = Get-Content -Raw -LiteralPath $environmentPath | ConvertFrom-Json
if ($environment.status -ne "available" -or $environment.trustedMicrosoftExcelAvailable -ne $true) {
  throw "A trusted Microsoft Excel local server is required to export evidence; current status: $($environment.status)"
}

& (Join-Path $workspace "scripts\verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1") -Producer microsoft-excel
$matrix = Get-Content -Raw -LiteralPath $matrixPath | ConvertFrom-Json
$producer = @($matrix.producers | Where-Object { $_.id -eq "microsoft-excel" })
if ($producer.Count -ne 1 -or $producer[0].status -ne "verified") {
  throw "Microsoft Excel producer entry is not verified"
}
if (-not (Test-Path -LiteralPath $producerOutput -PathType Leaf)) {
  throw "Microsoft Excel producer output is missing: $producerOutput"
}

$auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3g-excel-export-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
try {
  $producerEntryPath = Join-Path $auditRoot "producer.json"
  [System.IO.File]::WriteAllText(
    $producerEntryPath,
    ($producer[0] | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = "S8-7E3G-D"
    status = "excel_evidence_bundle"
    createdAt = [DateTime]::UtcNow.ToString("o")
    sourceCommit = ([string](& git -C $workspace rev-parse HEAD)).Trim()
    producerEnvironment = [ordered]@{
      status = $environment.status
      trustedMicrosoftExcelAvailable = $environment.trustedMicrosoftExcelAvailable
      progId = $environment.progId
      clsid = $environment.clsid
      localServer = $environment.localServer
      identity = $environment.identity
    }
    baseline = [ordered]@{
      file = "s8-7e3g-longedit-multi-axis.xlsx"
      bytes = (Get-Item -LiteralPath $baseline).Length
      sha256 = (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    members = @(
      [ordered]@{
        name = "producer.json"
        bytes = (Get-Item -LiteralPath $producerEntryPath).Length
        sha256 = (Get-FileHash -LiteralPath $producerEntryPath -Algorithm SHA256).Hash.ToLowerInvariant()
      },
      [ordered]@{
        name = "s8-7e3g-microsoft-excel.xlsx"
        bytes = (Get-Item -LiteralPath $producerOutput).Length
        sha256 = (Get-FileHash -LiteralPath $producerOutput -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    )
    producerId = "microsoft-excel"
    trustedMachineConfirmationRequired = true
    sourceOverwriteAllowed = false
    reliableSaveAllowed = false
  }
  $manifestPath = Join-Path $auditRoot "manifest.json"
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 10) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )

  New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($bundlePath)) -Force | Out-Null
  $bundleStream = [System.IO.File]::Open($bundlePath, [System.IO.FileMode]::CreateNew)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new(
      $bundleStream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      foreach ($member in @(
        @{ Name = "manifest.json"; Path = $manifestPath },
        @{ Name = "producer.json"; Path = $producerEntryPath },
        @{ Name = "s8-7e3g-microsoft-excel.xlsx"; Path = $producerOutput }
      )) {
        $entry = $archive.CreateEntry($member.Name, [System.IO.Compression.CompressionLevel]::Optimal)
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
  Write-Output "S8-7E3G Microsoft Excel evidence bundle exported: $bundlePath"
}
finally {
  if (Test-Path -LiteralPath $auditRoot) {
    $resolvedAuditRoot = (Resolve-Path -LiteralPath $auditRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolvedAuditRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove export directory outside TEMP: $resolvedAuditRoot"
    }
    Remove-Item -LiteralPath $resolvedAuditRoot -Recurse -Force
  }
}
