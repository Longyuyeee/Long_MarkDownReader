param(
    [Parameter(Mandatory = $true)]
    [string]$BundlePath,
    [ValidateSet(
        "imported",
        "windows-10-x64",
        "windows-11-x64",
        "signed-windows-10-x64",
        "signed-windows-11-x64"
    )]
    [string]$TargetName = "imported",
    [ValidateSet("any", "windows-10-x64", "windows-11-x64")]
    [string]$ExpectedWindowsClass = "any",
    [string]$ArtifactManifestPath = "docs/evidence/r5h-current-installers/installer-artifact-manifest.json",
    [switch]$ValidationOnly
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression

$repoRoot = Split-Path -Parent $PSScriptRoot
$bundle = [System.IO.Path]::GetFullPath($BundlePath)
$targetParent = Join-Path $repoRoot "docs/evidence/r5k-windows-matrix"
$target = Join-Path $targetParent $TargetName
$approvedManifestPath = if ([System.IO.Path]::IsPathRooted($ArtifactManifestPath)) {
    [System.IO.Path]::GetFullPath($ArtifactManifestPath)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $repoRoot $ArtifactManifestPath))
}
$approvedManifestRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "docs/evidence"))
if (-not $approvedManifestPath.StartsWith($approvedManifestRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $approvedManifestPath -PathType Leaf)) {
    throw "R5N approved artifact manifest must exist under docs/evidence."
}
if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) {
    throw "R5K evidence bundle is missing."
}
if (-not $ValidationOnly -and (Test-Path -LiteralPath $target)) {
    throw "Refusing to overwrite existing R5K imported evidence."
}

$requiredEvidenceMembers = @(
    "lifecycle-result.json",
    "installed-artifact-smoke.json",
    "installed-route-mount-evidence.json",
    "installed-route-performance-evidence.json",
    "installed-txt-save-reopen.jpg",
    "installed-json-save-reopen.jpg",
    "management-backup-index-evidence.json"
)
$requiredArchiveMembers = @("r5k-bundle-manifest.json") + $requiredEvidenceMembers
$auditRoot = Join-Path $env:TEMP ("longedit-r5k-import-" + [guid]::NewGuid().ToString("N"))
$promotionRoot = Join-Path $targetParent (".r5k-import-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null

try {
    $bundleStream = [System.IO.File]::OpenRead($bundle)
    try {
        $archive = [System.IO.Compression.ZipArchive]::new(
            $bundleStream,
            [System.IO.Compression.ZipArchiveMode]::Read,
            $false
        )
        try {
            $names = @($archive.Entries | ForEach-Object { $_.FullName })
            foreach ($name in $names) {
                if ([System.IO.Path]::GetFileName($name) -ne $name -or $name -match "[/\\]") {
                    throw "R5K evidence bundle requires flat safe member names."
                }
            }
            if (@($names | Group-Object | Where-Object { $_.Count -ne 1 }).Count -ne 0) {
                throw "R5K evidence bundle contains duplicate members."
            }
            if ($names.Count -ne $requiredArchiveMembers.Count -or
                (@($names | Sort-Object) -join "|") -ne (@($requiredArchiveMembers | Sort-Object) -join "|")) {
                throw "R5K evidence bundle must contain exactly the required eight members."
            }
            foreach ($entry in $archive.Entries) {
                if ($entry.Length -le 0 -or $entry.Length -gt 20MB) {
                    throw "R5K evidence member has an invalid size: $($entry.FullName)"
                }
                $destination = Join-Path $auditRoot $entry.FullName
                $entryStream = $entry.Open()
                $destinationStream = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew)
                try {
                    $entryStream.CopyTo($destinationStream)
                }
                finally {
                    $entryStream.Dispose()
                    $destinationStream.Dispose()
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

    $manifest = Get-Content -LiteralPath (Join-Path $auditRoot "r5k-bundle-manifest.json") -Raw | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1 -or $manifest.stage -ne "R5K" -or
        $manifest.status -ne "disposable_windows_evidence_bundle") {
        throw "R5K evidence manifest identity is invalid."
    }
    if ([string]$manifest.sourceCommit -notmatch "^[a-fA-F0-9]{40}$") {
        throw "R5K source commit binding is invalid."
    }
    $r5h = Get-Content -LiteralPath $approvedManifestPath -Raw | ConvertFrom-Json
    $currentCommit = ([string](& git -C $repoRoot rev-parse HEAD)).Trim()
    $approvedSourceCommit = if ($null -ne $r5h.PSObject.Properties["sourceCommit"]) {
        [string]$r5h.sourceCommit
    } else {
        $currentCommit
    }
    if ($LASTEXITCODE -ne 0 -or $manifest.sourceCommit -ne $approvedSourceCommit) {
        throw "R5K evidence bundle is bound to a different source commit."
    }
    $approvedInstaller = @($r5h.artifacts | Where-Object { $_.target -eq "nsis" })
    if ($approvedInstaller.Count -ne 1 -or $manifest.currentInstallerSha256 -ne $approvedInstaller[0].sha256) {
        throw "R5K evidence bundle is bound to a different current installer."
    }
    if ($manifest.appVersion -ne $r5h.appVersion -or
        $manifest.releaseCandidate -ne $false -or
        $manifest.promotionEligible -ne $false -or
        $manifest.sourceUserContentIncluded -ne $false) {
        throw "R5K evidence manifest truth boundary drifted."
    }
    if ($manifest.environment.family -ne "windows" -or
        [string]$manifest.environment.productName -notmatch "Windows" -or
        [string]$manifest.environment.buildNumber -notmatch "^\d+$" -or
        [string]$manifest.environment.architecture -notmatch "(?i)(64|x64|amd64)" -or
        [string]$manifest.environment.machineClassFingerprintSha256 -notmatch "^[a-f0-9]{64}$" -or
        $manifest.environment.machineNameIncluded -ne $false -or
        $manifest.environment.userNameIncluded -ne $false) {
        throw "R5K environment fingerprint or privacy boundary is invalid."
    }
    $buildNumber = [int64]$manifest.environment.buildNumber
    $productName = [string]$manifest.environment.productName
    $actualWindowsClass = if ($productName -match "Windows Server") {
        "windows-server-x64"
    } elseif ($productName -match "Windows 11" -and $buildNumber -ge 22000) {
        "windows-11-x64"
    } elseif ($productName -match "Windows 10" -and $buildNumber -lt 22000) {
        "windows-10-x64"
    } else {
        throw "R5M Windows product name and build number are inconsistent."
    }
    if ($ExpectedWindowsClass -ne "any" -and $actualWindowsClass -ne $ExpectedWindowsClass) {
        throw "R5M Windows evidence class mismatch: expected $ExpectedWindowsClass, actual $actualWindowsClass."
    }
    $targetWindowsClass = $TargetName -replace "^signed-", ""
    if ($TargetName -ne "imported" -and $targetWindowsClass -ne $actualWindowsClass) {
        throw "R5M refuses to promote Windows evidence into the wrong matrix lane."
    }
    if ($TargetName -like "signed-*" -and $manifest.signedArtifactRuntimeProven -ne $true) {
        throw "R5N signed release lane requires signed-artifact runtime evidence."
    }

    $memberMap = @{}
    foreach ($member in $manifest.members) {
        if ($memberMap.ContainsKey([string]$member.name)) {
            throw "R5K manifest contains duplicate member metadata."
        }
        $memberMap[[string]$member.name] = $member
    }
    if ($memberMap.Count -ne $requiredEvidenceMembers.Count) {
        throw "R5K manifest member set is incomplete."
    }
    foreach ($memberName in $requiredEvidenceMembers) {
        $memberPath = Join-Path $auditRoot $memberName
        $member = $memberMap[$memberName]
        if (-not $member -or
            [long]$member.bytes -ne (Get-Item -LiteralPath $memberPath).Length -or
            $member.sha256 -ne (Get-FileHash -LiteralPath $memberPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
            throw "R5K evidence member digest drifted: $memberName"
        }
    }

    $lifecycle = Get-Content -LiteralPath (Join-Path $auditRoot "lifecycle-result.json") -Raw | ConvertFrom-Json
    if ($lifecycle.stage -ne "R5I" -or $lifecycle.status -ne "passed" -or
        $lifecycle.currentVersion -ne $manifest.appVersion -or
        $lifecycle.currentInstallerSha256 -ne $manifest.currentInstallerSha256 -or
        $lifecycle.releaseCandidate -ne $false -or $lifecycle.promotionEligible -ne $false -or
        $lifecycle.signedArtifactRuntimeProven -ne $manifest.signedArtifactRuntimeProven -or
        $lifecycle.sourceUserContentIncluded -ne $false) {
        throw "R5K lifecycle result is incomplete."
    }
    $requiredLifecycleChecks = @(
        "previous-version-fresh-install",
        "controlled-upgrade",
        "file-association-registration",
        "first-launch-after-upgrade",
        "installed-artifact-route-and-io-smoke",
        "controlled-downgrade-safety",
        "silent-uninstall",
        "file-association-recovery",
        "uninstall-retains-user-data",
        "rollback-previous-install",
        "rollback-first-launch",
        "rollback-cleanup-retains-user-data"
    )
    foreach ($checkId in $requiredLifecycleChecks) {
        if (@($lifecycle.checks | Where-Object { $_.id -eq $checkId -and $_.status -eq "passed" }).Count -ne 1) {
            throw "R5K lifecycle check is missing: $checkId"
        }
    }

    $smoke = Get-Content -LiteralPath (Join-Path $auditRoot "installed-artifact-smoke.json") -Raw | ConvertFrom-Json
    if ($smoke.stage -ne "R5J" -or $smoke.status -ne "passed" -or
        $smoke.appVersion -ne $manifest.appVersion -or $smoke.installerSha256 -ne $manifest.currentInstallerSha256 -or
        $smoke.releaseCandidate -ne $false -or $smoke.promotionEligible -ne $false -or
        $smoke.signedArtifactRuntimeProven -ne $manifest.signedArtifactRuntimeProven -or
        $smoke.sourceUserContentIncluded -ne $false -or
        [string]$smoke.installedExecutable.sha256 -notmatch "^[a-f0-9]{64}$" -or
        [long]$smoke.installedExecutable.sizeBytes -lt 1000000) {
        throw "R5K installed-artifact smoke result is incomplete."
    }
    if ($manifest.signedArtifactRuntimeProven -eq $true) {
        if ($lifecycle.signature.status -ne "Valid" -or
            $lifecycle.signature.valid -ne $true -or
            $lifecycle.signature.timestamped -ne $true -or
            [string]$lifecycle.signature.signerCertificateSha256 -notmatch "^[a-f0-9]{64}$" -or
            [string]$lifecycle.signature.timestampCertificateSha256 -notmatch "^[a-f0-9]{64}$") {
            throw "R5M signed-artifact runtime evidence is incomplete."
        }
    }
    foreach ($checkId in @(
        "installed-current-webview-bootstrap",
        "installed-txt-read-edit-save-reopen",
        "installed-json-read-edit-save-reopen",
        "installed-representative-right-side-routes",
        "installed-route-performance-export"
    )) {
        if (@($smoke.checks | Where-Object { $_.id -eq $checkId -and $_.status -eq "passed" }).Count -ne 1) {
            throw "R5K installed-artifact check is missing: $checkId"
        }
    }

    $routeEvidence = Get-Content -LiteralPath (Join-Path $auditRoot "installed-route-mount-evidence.json") -Raw | ConvertFrom-Json
    $requiredRoutes = @(
        "/workspace", "/library", "/text", "/json", "/pdf", "/workbook",
        "/diagram", "/mindmap", "/graph", "/canvas", "/release-capabilities"
    )
    foreach ($route in $requiredRoutes) {
        if (@($routeEvidence.routes | Where-Object {
            $_.route -eq $route -and $_.status -eq "passed" -and
            $_.crashFallbackVisible -eq $false -and $_.routeWrapperMounted -eq $true
        }).Count -ne 1) {
            throw "R5K installed route evidence is missing: $route"
        }
    }
    if ($routeEvidence.sourceUserContentIncluded -ne $false) {
        throw "R5K route evidence includes user content."
    }
    $performance = Get-Content -LiteralPath (Join-Path $auditRoot "installed-route-performance-evidence.json") -Raw | ConvertFrom-Json
    if ($performance.sourceUserContentIncluded -ne $false -or
        @($performance.routes).Count -lt $requiredRoutes.Count -or
        @($performance.measures).Count -lt $requiredRoutes.Count) {
        throw "R5K installed route performance evidence is incomplete."
    }
    foreach ($imageName in @("installed-txt-save-reopen.jpg", "installed-json-save-reopen.jpg")) {
        $bytes = [System.IO.File]::ReadAllBytes((Join-Path $auditRoot $imageName))
        if ($bytes.Length -lt 10000 -or $bytes[0] -ne 0xFF -or $bytes[1] -ne 0xD8) {
            throw "R5K screenshot is invalid: $imageName"
        }
    }

    $management = Get-Content -LiteralPath (Join-Path $auditRoot "management-backup-index-evidence.json") -Raw | ConvertFrom-Json
    if ($management.schemaVersion -ne 1 -or $management.stage -ne "R5L" -or
        $management.status -ne "passed" -or $management.releaseCandidate -ne $false -or
        $management.promotionEligible -ne $false -or $management.sourceUserContentIncluded -ne $false -or
        $management.preflight.valid -ne $true -or
        $management.preflight.requiresLibraryMapping -ne $true -or
        $management.preflight.mappingCount -ne 1 -or
        $management.restore.libraryCount -ne 1 -or $management.restore.savedSearchCount -ne 1 -or
        $management.indexBeforeRollback.state -ne "ready" -or
        $management.indexAfterRestore.state -ne "ready") {
        throw "R5L management rollback evidence is incomplete."
    }
    foreach ($excludedItem in @("document-body", "api-key", "system-credential", "absolute-user-path")) {
        if (@($management.preflight.excluded | Where-Object { $_ -eq $excludedItem }).Count -ne 1) {
            throw "R5L management backup privacy boundary is incomplete: $excludedItem"
        }
    }
    foreach ($checkId in @(
        "installed-release-formal-config-load",
        "management-backup-export",
        "management-backup-privacy-preflight",
        "knowledge-index-delete-rebuild",
        "post-rollback-management-backup-restore",
        "post-restore-knowledge-index-rebuild",
        "post-restore-representative-file-reopen"
    )) {
        if (@($management.checks | Where-Object { $_.id -eq $checkId -and $_.status -eq "passed" }).Count -ne 1) {
            throw "R5L management rollback check is missing: $checkId"
        }
    }

    if ($ValidationOnly) {
        Write-Host "R5K Windows evidence bundle validation passed without import."
    } else {
        New-Item -ItemType Directory -Path $promotionRoot -Force | Out-Null
        foreach ($item in Get-ChildItem -LiteralPath $auditRoot -File) {
            Copy-Item -LiteralPath $item.FullName -Destination $promotionRoot
        }
        Move-Item -LiteralPath $promotionRoot -Destination $target
        Write-Host "R5K Windows evidence bundle imported: $target"
    }
}
finally {
    if (Test-Path -LiteralPath $auditRoot) {
        $resolvedAuditRoot = (Resolve-Path -LiteralPath $auditRoot).Path
        $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
        if (-not $resolvedAuditRoot.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove R5K import directory outside TEMP."
        }
        Remove-Item -LiteralPath $resolvedAuditRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $promotionRoot) {
        $resolvedPromotion = (Resolve-Path -LiteralPath $promotionRoot).Path
        $resolvedParent = (Resolve-Path -LiteralPath $targetParent).Path
        if (-not $resolvedPromotion.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove R5K promotion directory outside evidence root."
        }
        Remove-Item -LiteralPath $resolvedPromotion -Recurse -Force
    }
}
