$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$r5hPath = Join-Path $repoRoot "docs/evidence/r5h-current-installers/installer-artifact-manifest.json"
$r5h = Get-Content -LiteralPath $r5hPath -Raw | ConvertFrom-Json
$matrixRoot = Join-Path $repoRoot "docs/evidence/r5k-windows-matrix"
$outputDirectory = Join-Path $repoRoot "docs/evidence/r5m-final-release"
$outputPath = Join-Path $outputDirectory "preflight.json"
$laneResults = New-Object System.Collections.Generic.List[object]

foreach ($lane in @("windows-10-x64", "windows-11-x64")) {
    $laneRoot = Join-Path $matrixRoot $lane
    $manifestPath = Join-Path $laneRoot "r5k-bundle-manifest.json"
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        $laneResults.Add([ordered]@{
            windowsVersion = $lane
            status = "missing"
            acceptedEvidence = $false
            signedArtifactRuntimeProven = $false
            sourceCommit = $null
            installerSha256 = $null
        })
        continue
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $laneResults.Add([ordered]@{
        windowsVersion = $lane
        status = "imported"
        acceptedEvidence = $true
        signedArtifactRuntimeProven = $manifest.signedArtifactRuntimeProven -eq $true
        sourceCommit = [string]$manifest.sourceCommit
        installerSha256 = [string]$manifest.currentInstallerSha256
    })
}

$signatureResults = New-Object System.Collections.Generic.List[object]
foreach ($artifact in $r5h.artifacts) {
    $artifactDirectory = Join-Path $repoRoot ([string]$artifact.relativeDirectory)
    $matches = @(Get-ChildItem -LiteralPath $artifactDirectory -File -Filter ([string]$artifact.fileNamePattern) -ErrorAction SilentlyContinue)
    if ($matches.Count -ne 1) {
        $signatureResults.Add([ordered]@{
            target = [string]$artifact.target
            status = "artifact-missing-or-ambiguous"
            hashMatches = $false
            signed = $false
            timestamped = $false
        })
        continue
    }
    $actualHash = (Get-FileHash -LiteralPath $matches[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $signature = Get-AuthenticodeSignature -LiteralPath $matches[0].FullName
    $signatureResults.Add([ordered]@{
        target = [string]$artifact.target
        status = [string]$signature.Status
        hashMatches = $actualHash -eq [string]$artifact.sha256
        signed = $signature.Status -eq "Valid"
        timestamped = $null -ne $signature.TimeStamperCertificate
    })
}

$bothLanesImported = @($laneResults | Where-Object { $_.acceptedEvidence -eq $true }).Count -eq 2
$allCurrentArtifactsMatch = @($signatureResults | Where-Object { $_.hashMatches -eq $true }).Count -eq @($r5h.artifacts).Count
$allArtifactsSignedAndTimestamped = @($signatureResults | Where-Object {
    $_.signed -eq $true -and $_.timestamped -eq $true
}).Count -eq @($r5h.artifacts).Count
$signedRuntimeMatrixComplete = $bothLanesImported -and
    @($laneResults | Where-Object { $_.signedArtifactRuntimeProven -eq $true }).Count -eq 2
$approvalPath = Join-Path $outputDirectory "manual-approval.json"
$manualApprovalRecorded = $false
$manualApprovalState = if (Test-Path -LiteralPath $approvalPath -PathType Leaf) { "invalid" } else { "missing" }
if (Test-Path -LiteralPath $approvalPath -PathType Leaf) {
    try {
        $approval = Get-Content -LiteralPath $approvalPath -Raw | ConvertFrom-Json
        $currentCommit = ([string](& git -C $repoRoot rev-parse HEAD)).Trim()
        $expectedArtifactHashes = @($r5h.artifacts | ForEach-Object { [string]$_.sha256 } | Sort-Object)
        $approvedArtifactHashes = @($approval.artifactSha256 | ForEach-Object { [string]$_ } | Sort-Object)
        $laneCommitMap = @{}
        foreach ($laneResult in $laneResults) {
            if ($laneResult.acceptedEvidence -eq $true) {
                $laneCommitMap[[string]$laneResult.windowsVersion] = [string]$laneResult.sourceCommit
            }
        }
        $manualApprovalRecorded = $approval.schemaVersion -eq 1 -and
            $approval.stage -eq "R5N" -and
            $approval.appVersion -eq [string]$r5h.appVersion -and
            $approval.decision -eq "approved" -and
            [string]$approval.approvedAt -match "^\d{4}-\d{2}-\d{2}T" -and
            -not [string]::IsNullOrWhiteSpace([string]$approval.approverRole) -and
            $approval.sourceCommit -eq $currentCommit -and
            ($expectedArtifactHashes -join "|") -eq ($approvedArtifactHashes -join "|") -and
            $bothLanesImported -and
            $approval.windowsLaneSourceCommits."windows-10-x64" -eq $laneCommitMap["windows-10-x64"] -and
            $approval.windowsLaneSourceCommits."windows-11-x64" -eq $laneCommitMap["windows-11-x64"]
        if ($manualApprovalRecorded) {
            $manualApprovalState = "valid-current-evidence-bound"
        }
    }
    catch {
        $manualApprovalRecorded = $false
        $manualApprovalState = "invalid"
    }
}

$blockers = New-Object System.Collections.Generic.List[string]
if (-not $bothLanesImported) { $blockers.Add("windows-10-11-evidence-lanes-incomplete") }
if (-not $allCurrentArtifactsMatch) { $blockers.Add("current-artifact-hash-binding-incomplete") }
if (-not $allArtifactsSignedAndTimestamped) { $blockers.Add("authenticode-signing-or-timestamp-incomplete") }
if (-not $signedRuntimeMatrixComplete) { $blockers.Add("signed-artifact-runtime-matrix-incomplete") }
if (-not $manualApprovalRecorded) {
    $blockers.Add($(if ($manualApprovalState -eq "missing") {
        "manual-release-approval-not-recorded"
    } else {
        "manual-release-approval-invalid"
    }))
}

$result = [ordered]@{
    schemaVersion = 1
    stage = "R5M"
    appVersion = [string]$r5h.appVersion
    capturedAt = [DateTime]::UtcNow.ToString("o")
    currentStatus = "fail-closed-release-readiness-audited"
    releaseCandidate = $false
    promotionEligible = $false
    sourceUserContentIncluded = $false
    matrix = [ordered]@{
        requiredLanes = @("windows-10-x64", "windows-11-x64")
        bothLanesImported = $bothLanesImported
        signedRuntimeMatrixComplete = $signedRuntimeMatrixComplete
        lanes = $laneResults.ToArray()
    }
    artifacts = [ordered]@{
        currentHashesMatch = $allCurrentArtifactsMatch
        allSignedAndTimestamped = $allArtifactsSignedAndTimestamped
        results = $signatureResults.ToArray()
    }
    manualApprovalRecorded = $manualApprovalRecorded
    manualApprovalState = $manualApprovalState
    blockers = $blockers.ToArray()
    nextAction = "Import both OS lanes, sign and timestamp current artifacts, rerun both lanes on signed artifacts, then record explicit release approval."
}
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
[System.IO.File]::WriteAllText(
    $outputPath,
    ($result | ConvertTo-Json -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host "R5M fail-closed release readiness audit captured: $outputPath"
