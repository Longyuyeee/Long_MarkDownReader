param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactDirectory,
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{40}$")]
    [string]$SourceCommit,
    [string]$OutputPath = "docs/evidence/u1-unsigned-internal-candidate/installer-manifest.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$resolvedDirectory = (Resolve-Path -LiteralPath $ArtifactDirectory).Path
$files = @(Get-ChildItem -LiteralPath $resolvedDirectory -File | Where-Object {
    $_.Extension -in ".msi", ".exe"
})
if ($files.Count -ne 2) {
    throw "U1 requires exactly one MSI and one NSIS installer; found $($files.Count)."
}

$artifacts = @()
foreach ($target in @("msi", "nsis")) {
    $matches = @($files | Where-Object {
        if ($target -eq "msi") { $_.Extension -eq ".msi" } else { $_.Name.EndsWith("-setup.exe") }
    })
    if ($matches.Count -ne 1) {
        throw "U1 expected exactly one $target installer; found $($matches.Count)."
    }
    $file = $matches[0]
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne "NotSigned") {
        throw "U1 internal candidate must be unsigned; $($file.Name) is $($signature.Status)."
    }
    $artifacts += [ordered]@{
        target = $target
        fileName = $file.Name
        relativeDirectory = "src-tauri/target/release/bundle/u1-unsigned/$($SourceCommit.Substring(0, 7).ToLowerInvariant())"
        sizeBytes = $file.Length
        lastWriteTimeUtc = $file.LastWriteTimeUtc.ToString("o")
        sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        authenticodeStatus = "NotSigned"
        signed = $false
        officialRelease = $false
        promotionEligible = $false
    }
}

$manifest = [ordered]@{
    schemaVersion = 1
    stage = "U1"
    appVersion = [string]$package.version
    capturedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceCommit = $SourceCommit.ToLowerInvariant()
    buildCommand = "npm run tauri -- build --bundles msi,nsis"
    isolatedCleanWorktree = $true
    buildExecuted = $true
    releaseCandidate = $false
    promotionEligible = $false
    internalOnly = $true
    artifactFilesCommitted = $false
    sourceUserContentIncluded = $false
    artifacts = $artifacts
}

$absoluteOutput = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "docs/evidence/u1-unsigned-internal-candidate"))
if (-not $absoluteOutput.StartsWith($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "U1 installer evidence must remain under docs/evidence/u1-unsigned-internal-candidate."
}
New-Item -ItemType Directory -Path (Split-Path -Parent $absoluteOutput) -Force | Out-Null
[System.IO.File]::WriteAllText(
    $absoluteOutput,
    ($manifest | ConvertTo-Json -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
)
Write-Output "U1 unsigned candidate manifest captured: $absoluteOutput"
