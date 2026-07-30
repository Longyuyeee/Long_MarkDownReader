param(
    [Parameter(Mandatory = $true)]
    [string]$EvidenceDirectory,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{40}$")]
    [string]$ExpectedSourceCommit
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression

$evidenceRoot = [System.IO.Path]::GetFullPath($EvidenceDirectory)
$bundlePath = [System.IO.Path]::GetFullPath($OutputPath)
if ([System.IO.Path]::GetExtension($bundlePath) -ne ".zip") {
    throw "R5K evidence bundle must use .zip."
}
if ([System.IO.Path]::GetDirectoryName($bundlePath) -ne $evidenceRoot) {
    throw "R5K evidence bundle must remain inside the disposable evidence directory."
}
if (Test-Path -LiteralPath $bundlePath) {
    throw "Refusing to overwrite existing R5K evidence bundle."
}

$requiredMembers = @(
    "lifecycle-result.json",
    "installed-artifact-smoke.json",
    "installed-route-mount-evidence.json",
    "installed-route-performance-evidence.json",
    "installed-txt-save-reopen.jpg",
    "installed-json-save-reopen.jpg",
    "management-backup-index-evidence.json"
)
foreach ($memberName in $requiredMembers) {
    $memberPath = Join-Path $evidenceRoot $memberName
    if (-not (Test-Path -LiteralPath $memberPath -PathType Leaf)) {
        throw "R5K evidence member is missing: $memberName"
    }
}

$lifecycle = Get-Content -LiteralPath (Join-Path $evidenceRoot "lifecycle-result.json") -Raw | ConvertFrom-Json
$smoke = Get-Content -LiteralPath (Join-Path $evidenceRoot "installed-artifact-smoke.json") -Raw | ConvertFrom-Json
$management = Get-Content -LiteralPath (Join-Path $evidenceRoot "management-backup-index-evidence.json") -Raw | ConvertFrom-Json
if ($lifecycle.stage -ne "R5I" -or $lifecycle.status -ne "passed" -or
    $smoke.stage -ne "R5J" -or $smoke.status -ne "passed" -or
    $management.stage -ne "R5L" -or $management.status -ne "passed" -or
    $lifecycle.signedArtifactRuntimeProven -ne $smoke.signedArtifactRuntimeProven) {
    throw "R5K refuses incomplete lifecycle, installed-artifact, or management rollback evidence."
}

$os = Get-CimInstance Win32_OperatingSystem
$machineClass = "$($os.Caption)|$($os.Version)|$($os.OSArchitecture)"
$machineClassBytes = [System.Text.Encoding]::UTF8.GetBytes($machineClass)
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $machineClassFingerprint = ([System.BitConverter]::ToString($sha.ComputeHash($machineClassBytes))).Replace("-", "").ToLowerInvariant()
}
finally {
    $sha.Dispose()
}

$manifest = [ordered]@{
    schemaVersion = 1
    stage = "R5K"
    status = "disposable_windows_evidence_bundle"
    createdAt = [DateTime]::UtcNow.ToString("o")
    sourceCommit = $ExpectedSourceCommit.ToLowerInvariant()
    appVersion = [string]$smoke.appVersion
    currentInstallerSha256 = [string]$smoke.installerSha256
    environment = [ordered]@{
        family = "windows"
        productName = [string]$os.Caption
        version = [string]$os.Version
        buildNumber = [string]$os.BuildNumber
        architecture = [string]$os.OSArchitecture
        machineClassFingerprintSha256 = $machineClassFingerprint
        machineNameIncluded = $false
        userNameIncluded = $false
    }
    members = @($requiredMembers | ForEach-Object {
        $memberPath = Join-Path $evidenceRoot $_
        [ordered]@{
            name = $_
            bytes = (Get-Item -LiteralPath $memberPath).Length
            sha256 = (Get-FileHash -LiteralPath $memberPath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    })
    releaseCandidate = $false
    promotionEligible = $false
    signedArtifactRuntimeProven = [bool]$smoke.signedArtifactRuntimeProven
    sourceUserContentIncluded = $false
}

$manifestPath = Join-Path $evidenceRoot "r5k-bundle-manifest.json"
if (Test-Path -LiteralPath $manifestPath) {
    throw "Refusing to overwrite an existing R5K bundle manifest."
}
[System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
)
$exportSucceeded = $false
try {
    $bundleStream = [System.IO.File]::Open($bundlePath, [System.IO.FileMode]::CreateNew)
    try {
        $archive = [System.IO.Compression.ZipArchive]::new(
            $bundleStream,
            [System.IO.Compression.ZipArchiveMode]::Create,
            $false
        )
        try {
            foreach ($memberName in @("r5k-bundle-manifest.json") + $requiredMembers) {
                $sourcePath = Join-Path $evidenceRoot $memberName
                $entry = $archive.CreateEntry($memberName, [System.IO.Compression.CompressionLevel]::Optimal)
                $entryStream = $entry.Open()
                $sourceStream = [System.IO.File]::OpenRead($sourcePath)
                try {
                    $sourceStream.CopyTo($entryStream)
                }
                finally {
                    $sourceStream.Dispose()
                    $entryStream.Dispose()
                }
            }
        }
        finally {
            $archive.Dispose()
        }
    }
    finally {
        $bundleStream.Dispose()
    }
    $exportSucceeded = $true
}
finally {
    if (-not $exportSucceeded -and (Test-Path -LiteralPath $bundlePath)) {
        Remove-Item -LiteralPath $bundlePath -Force
    }
    if (Test-Path -LiteralPath $manifestPath) {
        Remove-Item -LiteralPath $manifestPath -Force
    }
}

Write-Host "R5K disposable Windows evidence bundle exported: $bundlePath"
