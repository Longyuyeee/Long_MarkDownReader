$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$signedManifest = Join-Path $repoRoot "docs/evidence/r5n-signed-release/signed-installer-manifest.json"
$approval = Join-Path $repoRoot "docs/evidence/r5m-final-release/manual-approval.json"
if ((Test-Path -LiteralPath $signedManifest) -or (Test-Path -LiteralPath $approval)) {
    throw "R5N rejection tests only run before real signed manifest and approval evidence exist."
}
$bundleRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "src-tauri/target/release/bundle"))
$testSignedRoot = Join-Path $bundleRoot ("r5n-rejection-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testSignedRoot -Force | Out-Null
$r5h = Get-Content -LiteralPath (Join-Path $repoRoot "docs/evidence/r5h-current-installers/installer-artifact-manifest.json") -Raw | ConvertFrom-Json
foreach ($artifact in $r5h.artifacts) {
    $sourceDirectory = Join-Path $repoRoot ([string]$artifact.relativeDirectory)
    $source = @(Get-ChildItem -LiteralPath $sourceDirectory -File -Filter ([string]$artifact.fileNamePattern))
    if ($source.Count -ne 1) {
        throw "R5N rejection fixture source artifact is missing."
    }
    New-Item -ItemType HardLink -Path (Join-Path $testSignedRoot $source[0].Name) -Target $source[0].FullName | Out-Null
}

$casesPassed = 0
try {
try {
    & (Join-Path $PSScriptRoot "capture-r5n-signed-installer-manifest.ps1") `
        -SignedArtifactDirectory $testSignedRoot `
        -ConfirmSignedReleaseArtifacts
    throw "R5N unsigned artifacts unexpectedly produced a signed manifest."
}
catch {
    if ($_.Exception.Message -notmatch "requires valid Authenticode and timestamp certificates") {
        throw
    }
    $casesPassed += 1
}
if (Test-Path -LiteralPath $signedManifest) {
    throw "R5N unsigned rejection created a signed manifest."
}

try {
    & (Join-Path $PSScriptRoot "new-r5i-windows-sandbox-config.ps1") -RequireSignedArtifact
    throw "R5N unsigned manifest unexpectedly entered signed Sandbox mode."
}
catch {
    if ($_.Exception.Message -notmatch "signing state must match") {
        throw
    }
    $casesPassed += 1
}

try {
    & (Join-Path $PSScriptRoot "new-r5n-manual-release-approval.ps1") `
        -ApproverRole "Release Manager" `
        -ConfirmReleaseApproval
    throw "R5N incomplete automated gates unexpectedly produced manual approval."
}
catch {
    if ($_.Exception.Message -notmatch "refuses manual approval until every automated signed-release gate passes") {
        throw
    }
    $casesPassed += 1
}
if (Test-Path -LiteralPath $approval) {
    throw "R5N failed-gate rejection created a manual approval."
}

Write-Host "R5N release closure rejection matrix passed: $casesPassed/3 unsafe transitions rejected."
}
finally {
    if (Test-Path -LiteralPath $testSignedRoot) {
        $resolvedTestRoot = (Resolve-Path -LiteralPath $testSignedRoot).Path
        if (-not $resolvedTestRoot.StartsWith($bundleRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove R5N rejection fixture outside release bundle root."
        }
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}
