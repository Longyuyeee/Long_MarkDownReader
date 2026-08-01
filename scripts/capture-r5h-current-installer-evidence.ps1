param(
    [string]$OutputPath = "docs/evidence/r5h-current-installers/installer-artifact-manifest.json",
    [string]$SourceCommit = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = [string]$package.version
$bundleRoot = Join-Path $repoRoot "src-tauri/target/release/bundle"
$sourceCommitResolvedFromGit = [string]::IsNullOrWhiteSpace($SourceCommit)
$resolvedSourceCommit = if ($sourceCommitResolvedFromGit) {
    ([string](& git -C $repoRoot rev-parse HEAD)).Trim()
} else {
    $SourceCommit.Trim()
}
if (($sourceCommitResolvedFromGit -and $LASTEXITCODE -ne 0) -or $resolvedSourceCommit -notmatch "^[a-fA-F0-9]{40}$") {
    throw "R5H source commit must be a full 40-character Git commit hash."
}
$resolvedSourceCommit = $resolvedSourceCommit.ToLowerInvariant()

$expectedArtifacts = @(
    @{
        target = "msi"
        directory = Join-Path $bundleRoot "msi"
        filter = "*_${version}_x64_zh-CN.msi"
    },
    @{
        target = "nsis"
        directory = Join-Path $bundleRoot "nsis"
        filter = "*_${version}_x64-setup.exe"
    }
)

$artifacts = foreach ($expected in $expectedArtifacts) {
    $matches = @(Get-ChildItem -LiteralPath $expected.directory -File -Filter $expected.filter -ErrorAction SilentlyContinue)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one R5H $($expected.target) installer matching '$($expected.filter)' in '$($expected.directory)'; found $($matches.Count). Run 'npm run tauri -- build' first."
    }
    $artifactPath = $matches[0].FullName

    $item = Get-Item -LiteralPath $artifactPath
    $hash = Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256
    $signature = Get-AuthenticodeSignature -LiteralPath $artifactPath
    $relativeDirectory = $expected.directory.Substring($repoRoot.Length).TrimStart("\").Replace("\", "/")

    [ordered]@{
        target = $expected.target
        fileNamePattern = $expected.filter
        relativeDirectory = $relativeDirectory
        sizeBytes = $item.Length
        lastWriteTimeUtc = $item.LastWriteTimeUtc.ToString("o")
        sha256 = $hash.Hash.ToLowerInvariant()
        authenticodeStatus = $signature.Status.ToString()
        signed = $signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid
        signerSubject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
        timestampSubject = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { $null }
        officialRelease = $false
        promotionEligible = $false
    }
}

$manifest = [ordered]@{
    schemaVersion = 1
    stage = "R5H"
    appVersion = $version
    sourceCommit = $resolvedSourceCommit
    capturedAt = (Get-Date).ToUniversalTime().ToString("o")
    environment = "Current Windows release bundle build"
    buildCommand = "npm run tauri -- build"
    buildExecuted = $true
    releaseCandidate = $false
    promotionEligible = $false
    sourceUserContentIncluded = $false
    artifactFilesCommitted = $false
    installedArtifactSmokeExecuted = $false
    signedArtifactRuntimeProven = $false
    artifacts = @($artifacts)
}

$absoluteOutputPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
$outputDirectory = Split-Path -Parent $absoluteOutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
[System.IO.File]::WriteAllText(
    $absoluteOutputPath,
    ($manifest | ConvertTo-Json -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "R5H installer evidence captured: $absoluteOutputPath"
foreach ($artifact in $artifacts) {
    Write-Host ("- {0}: {1} bytes, SHA-256 {2}, Authenticode {3}" -f $artifact.target, $artifact.sizeBytes, $artifact.sha256, $artifact.authenticodeStatus)
}
