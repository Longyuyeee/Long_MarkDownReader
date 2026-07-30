param(
    [Parameter(Mandatory = $true)]
    [ValidateLength(3, 120)]
    [string]$ApproverRole,
    [switch]$ConfirmReleaseApproval
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmReleaseApproval) {
    throw "R5N manual approval requires -ConfirmReleaseApproval."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$auditScript = Join-Path $PSScriptRoot "audit-r5n-release-promotion-readiness.ps1"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $auditScript
if ($LASTEXITCODE -ne 0) {
    throw "R5N readiness audit failed before approval."
}
$preflightPath = Join-Path $repoRoot "docs/evidence/r5n-release-promotion/preflight.json"
$preflight = Get-Content -LiteralPath $preflightPath -Raw | ConvertFrom-Json
if ($preflight.automatedGatesPassed -ne $true) {
    throw "R5N refuses manual approval until every automated signed-release gate passes."
}

$signedManifestPath = Join-Path $repoRoot "docs/evidence/r5n-signed-release/signed-installer-manifest.json"
$signedManifest = Get-Content -LiteralPath $signedManifestPath -Raw | ConvertFrom-Json
$approvalPath = Join-Path $repoRoot "docs/evidence/r5m-final-release/manual-approval.json"
if (Test-Path -LiteralPath $approvalPath) {
    throw "Refusing to overwrite existing R5N manual release approval."
}
$approval = [ordered]@{
    schemaVersion = 1
    stage = "R5N"
    appVersion = [string]$signedManifest.appVersion
    decision = "approved"
    approvedAt = [DateTime]::UtcNow.ToString("o")
    approverRole = $ApproverRole.Trim()
    sourceCommit = [string]$signedManifest.sourceCommit
    artifactSha256 = @($signedManifest.artifacts | ForEach-Object { [string]$_.sha256 } | Sort-Object)
    windowsLaneSourceCommits = [ordered]@{
        "windows-10-x64" = [string]$signedManifest.sourceCommit
        "windows-11-x64" = [string]$signedManifest.sourceCommit
    }
}
[System.IO.File]::WriteAllText(
    $approvalPath,
    ($approval | ConvertTo-Json -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host "R5N manual release approval recorded and bound to current signed evidence."
