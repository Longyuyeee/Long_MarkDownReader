param(
    [string]$OutputPath = "docs/evidence/r5n-signed-release/signed-installer-manifest.json",
    [string]$SignedArtifactDirectory = "src-tauri/target/release/bundle/r5n-signed",
    [switch]$ConfirmSignedReleaseArtifacts
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmSignedReleaseArtifacts) {
    throw "R5N signed manifest capture requires -ConfirmSignedReleaseArtifacts."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$r5h = Get-Content -LiteralPath (Join-Path $repoRoot "docs/evidence/r5h-current-installers/installer-artifact-manifest.json") -Raw | ConvertFrom-Json
$signedArtifactRoot = if ([System.IO.Path]::IsPathRooted($SignedArtifactDirectory)) {
    [System.IO.Path]::GetFullPath($SignedArtifactDirectory)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $repoRoot $SignedArtifactDirectory))
}
$allowedArtifactRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "src-tauri/target/release/bundle"))
if (-not $signedArtifactRoot.StartsWith($allowedArtifactRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $signedArtifactRoot -PathType Container)) {
    throw "R5N signed artifacts must exist in a dedicated directory under the release bundle root."
}
$repoFullPath = [System.IO.Path]::GetFullPath($repoRoot)
$repoPathPrefix = $repoFullPath.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
if (-not $signedArtifactRoot.StartsWith($repoPathPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "R5N signed artifact directory must remain inside the repository."
}
$signedArtifactRelativeDirectory = $signedArtifactRoot.Substring($repoPathPrefix.Length).Replace("\", "/")
$output = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    [System.IO.Path]::GetFullPath($OutputPath)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
}
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "docs/evidence/r5n-signed-release"))
if (-not $output.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "R5N signed manifest must remain under docs/evidence/r5n-signed-release."
}
if (Test-Path -LiteralPath $output) {
    throw "Refusing to overwrite existing R5N signed installer manifest."
}
if ($package.version -ne $r5h.appVersion) {
    throw "R5N package and R5H version mismatch."
}

function Get-CertificateSha256($Certificate) {
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($hasher.ComputeHash($Certificate.RawData))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $hasher.Dispose()
    }
}

$artifacts = New-Object System.Collections.Generic.List[object]
foreach ($baseline in $r5h.artifacts) {
    $matches = @(Get-ChildItem -LiteralPath $signedArtifactRoot -File -Filter ([string]$baseline.fileNamePattern))
    if ($matches.Count -ne 1) {
        throw "R5N expected exactly one $($baseline.target) artifact; found $($matches.Count)."
    }
    $artifact = $matches[0]
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
    if ($signature.Status -ne "Valid" -or
        $null -eq $signature.SignerCertificate -or
        $null -eq $signature.TimeStamperCertificate) {
        throw "R5N $($baseline.target) artifact requires valid Authenticode and timestamp certificates."
    }
    $artifacts.Add([ordered]@{
        target = [string]$baseline.target
        fileName = $artifact.Name
        fileNamePattern = $artifact.Name
        relativeDirectory = $signedArtifactRelativeDirectory
        sizeBytes = $artifact.Length
        sha256 = (Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        authenticodeStatus = [string]$signature.Status
        signed = $true
        timestamped = $true
        signerCertificateSha256 = Get-CertificateSha256 $signature.SignerCertificate
        timestampCertificateSha256 = Get-CertificateSha256 $signature.TimeStamperCertificate
        officialRelease = $false
        promotionEligible = $false
    })
}

$manifest = [ordered]@{
    schemaVersion = 1
    stage = "R5N"
    appVersion = [string]$package.version
    capturedAt = [DateTime]::UtcNow.ToString("o")
    sourceCommit = ([string](& git -C $repoRoot rev-parse HEAD)).Trim()
    environment = "Approved signed Windows release artifacts"
    releaseCandidate = $false
    promotionEligible = $false
    sourceUserContentIncluded = $false
    artifacts = $artifacts.ToArray()
}
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($output)) -Force | Out-Null
[System.IO.File]::WriteAllText(
    $output,
    ($manifest | ConvertTo-Json -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host "R5N signed installer manifest captured: $output"
