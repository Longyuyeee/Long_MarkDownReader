$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $repoRoot "docs/evidence/r5n-external-release/environment-audit.json"
$signedManifestPath = Join-Path $repoRoot "docs/evidence/r5n-signed-release/signed-installer-manifest.json"
$matrixRoot = Join-Path $repoRoot "docs/evidence/r5k-windows-matrix"
$approvalPath = Join-Path $repoRoot "docs/evidence/r5m-final-release/manual-approval.json"
$outputDirectory = Join-Path $repoRoot "docs/evidence/r5n-release-promotion"
$outputPath = Join-Path $outputDirectory "preflight.json"
$blockers = New-Object System.Collections.Generic.List[string]

$environmentReady = $false
if (Test-Path -LiteralPath $environmentPath -PathType Leaf) {
    $environment = Get-Content -LiteralPath $environmentPath -Raw | ConvertFrom-Json
    $environmentReady = $environment.environment.signToolAvailable -eq $true -and
        [int]$environment.environment.eligibleCurrentUserCodeSigningCertificateCount -gt 0 -and
        ($environment.environment.windowsSandboxAvailable -eq $true -or
            $environment.environment.hyperVProvisioningCmdletAvailable -eq $true)
}
$signedManifestReady = $false
$productSourceCommit = $null
$approvedArtifactHashes = @()
$approvedNsisHash = $null
if (Test-Path -LiteralPath $signedManifestPath -PathType Leaf) {
    $signedManifest = Get-Content -LiteralPath $signedManifestPath -Raw | ConvertFrom-Json
    $productSourceCommit = [string]$signedManifest.sourceCommit
    $approvedArtifactHashes = @($signedManifest.artifacts | ForEach-Object { [string]$_.sha256 } | Sort-Object)
    $nsis = @($signedManifest.artifacts | Where-Object { $_.target -eq "nsis" })
    $artifactsValid = $signedManifest.schemaVersion -eq 1 -and
        $signedManifest.stage -eq "R5N" -and
        $signedManifest.releaseCandidate -eq $false -and
        $signedManifest.promotionEligible -eq $false -and
        $signedManifest.sourceUserContentIncluded -eq $false -and
        [string]$signedManifest.sourceCommit -match "^[a-f0-9]{40}$" -and
        @($signedManifest.artifacts).Count -eq 2 -and
        @($signedManifest.artifacts | Where-Object {
            $_.signed -eq $true -and $_.timestamped -eq $true -and
            $_.authenticodeStatus -eq "Valid" -and
            [string]$_.sha256 -match "^[a-f0-9]{64}$" -and
            [string]$_.signerCertificateSha256 -match "^[a-f0-9]{64}$" -and
            [string]$_.timestampCertificateSha256 -match "^[a-f0-9]{64}$"
        }).Count -eq 2 -and $nsis.Count -eq 1
    $filesystemValid = $true
    foreach ($artifact in $signedManifest.artifacts) {
        $artifactPath = Join-Path (Join-Path $repoRoot ([string]$artifact.relativeDirectory)) ([string]$artifact.fileName)
        if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf) -or
            (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$artifact.sha256) {
            $filesystemValid = $false
        }
    }
    $signedManifestReady = $artifactsValid -and $filesystemValid
    if ($nsis.Count -eq 1) { $approvedNsisHash = [string]$nsis[0].sha256 }
}
if (-not $signedManifestReady) { $blockers.Add("approved-signed-installer-manifest-incomplete") }
if (-not $environmentReady -and -not $signedManifestReady) {
    $blockers.Add("external-signing-or-windows-runner-environment-incomplete")
}

$laneResults = New-Object System.Collections.Generic.List[object]
foreach ($windowsVersion in @("windows-10-x64", "windows-11-x64")) {
    $lanePath = Join-Path $matrixRoot "signed-$windowsVersion"
    $manifestPath = Join-Path $lanePath "r5k-bundle-manifest.json"
    $accepted = $false
    $laneSourceCommit = $null
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        $laneManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $laneSourceCommit = [string]$laneManifest.sourceCommit
        $accepted = $laneManifest.signedArtifactRuntimeProven -eq $true -and
            $laneManifest.releaseCandidate -eq $false -and
            $laneManifest.promotionEligible -eq $false -and
            $laneManifest.sourceUserContentIncluded -eq $false -and
            $laneManifest.sourceCommit -eq $productSourceCommit -and
            $laneManifest.currentInstallerSha256 -eq $approvedNsisHash
    }
    $laneResults.Add([ordered]@{
        windowsVersion = $windowsVersion
        status = if ($accepted) { "accepted-signed-runtime" } else { "missing-or-invalid" }
        accepted = $accepted
        sourceCommit = $laneSourceCommit
    })
}
$signedWindowsMatrixReady = @($laneResults | Where-Object { $_.accepted -eq $true }).Count -eq 2
if (-not $signedWindowsMatrixReady) { $blockers.Add("signed-windows-10-11-runtime-matrix-incomplete") }

$automatedGatesPassed = $signedManifestReady -and $signedWindowsMatrixReady
$manualApprovalRecorded = $false
$manualApprovalState = if (Test-Path -LiteralPath $approvalPath -PathType Leaf) { "invalid" } else { "missing" }
if (Test-Path -LiteralPath $approvalPath -PathType Leaf) {
    try {
        $approval = Get-Content -LiteralPath $approvalPath -Raw | ConvertFrom-Json
        $approvedHashes = @($approval.artifactSha256 | ForEach-Object { [string]$_ } | Sort-Object)
        $manualApprovalRecorded = $approval.schemaVersion -eq 1 -and
            $approval.stage -eq "R5N" -and
            $approval.appVersion -eq [string]$signedManifest.appVersion -and
            $approval.decision -eq "approved" -and
            [string]$approval.approvedAt -match "^\d{4}-\d{2}-\d{2}T" -and
            $approval.sourceCommit -eq $productSourceCommit -and
            ($approvedArtifactHashes -join "|") -eq ($approvedHashes -join "|") -and
            $approval.windowsLaneSourceCommits."windows-10-x64" -eq $productSourceCommit -and
            $approval.windowsLaneSourceCommits."windows-11-x64" -eq $productSourceCommit -and
            -not [string]::IsNullOrWhiteSpace([string]$approval.approverRole)
        if ($manualApprovalRecorded) { $manualApprovalState = "valid-current-signed-evidence-bound" }
    }
    catch {
        $manualApprovalRecorded = $false
        $manualApprovalState = "invalid"
    }
}
if (-not $manualApprovalRecorded) {
    $blockers.Add($(if ($manualApprovalState -eq "missing") {
        "manual-release-approval-not-recorded"
    } else {
        "manual-release-approval-invalid"
    }))
}

$promotionEligible = $automatedGatesPassed -and $manualApprovalRecorded
$result = [ordered]@{
    schemaVersion = 1
    stage = "R5N"
    capturedAt = [DateTime]::UtcNow.ToString("o")
    currentStatus = if ($promotionEligible) {
        "all-release-evidence-ready-explicit-promotion-step-required"
    } else {
        "external-release-evidence-blocked"
    }
    releaseCandidate = $false
    promotionEligible = $promotionEligible
    sourceUserContentIncluded = $false
    automatedGatesPassed = $automatedGatesPassed
    environmentReady = $environmentReady
    signedManifestReady = $signedManifestReady
    signedWindowsMatrixReady = $signedWindowsMatrixReady
    signedWindowsLanes = $laneResults.ToArray()
    manualApprovalRecorded = $manualApprovalRecorded
    manualApprovalState = $manualApprovalState
    productSourceCommit = $productSourceCommit
    blockers = $blockers.ToArray()
}
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
[System.IO.File]::WriteAllText(
    $outputPath,
    ($result | ConvertTo-Json -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host "R5N release promotion readiness captured: $outputPath"
