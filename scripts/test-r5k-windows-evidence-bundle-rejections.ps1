$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression

$repoRoot = Split-Path -Parent $PSScriptRoot
$importer = Join-Path $repoRoot "scripts/import-r5k-windows-evidence-bundle.ps1"
$target = Join-Path $repoRoot "docs/evidence/r5k-windows-matrix/imported"
$r5h = Get-Content -LiteralPath (Join-Path $repoRoot "docs/evidence/r5h-current-installers/installer-artifact-manifest.json") -Raw | ConvertFrom-Json
$currentInstallerSha256 = [string]@($r5h.artifacts | Where-Object { $_.target -eq "nsis" })[0].sha256
$existingEvidenceSha256 = if (Test-Path -LiteralPath (Join-Path $target "r5k-bundle-manifest.json")) {
    (Get-FileHash -LiteralPath (Join-Path $target "r5k-bundle-manifest.json") -Algorithm SHA256).Hash
} else { "" }
$auditRoot = Join-Path $env:TEMP ("longedit-r5k-rejections-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null

$requiredEvidenceMembers = @(
    "lifecycle-result.json",
    "installed-artifact-smoke.json",
    "installed-route-mount-evidence.json",
    "installed-route-performance-evidence.json",
    "installed-txt-save-reopen.jpg",
    "installed-json-save-reopen.jpg",
    "management-backup-index-evidence.json"
)

function New-RejectionBundle {
    param([string]$CaseId, [string]$BundlePath)

    $caseRoot = Join-Path $auditRoot $CaseId
    New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null
    foreach ($memberName in $requiredEvidenceMembers) {
        [System.IO.File]::WriteAllText(
            (Join-Path $caseRoot $memberName),
            "synthetic-r5k-rejection-$memberName",
            [System.Text.UTF8Encoding]::new($false)
        )
    }
    $sourceCommit = ([string](& git -C $repoRoot rev-parse HEAD)).Trim()
    $members = @($requiredEvidenceMembers | ForEach-Object {
        $memberPath = Join-Path $caseRoot $_
        [ordered]@{
            name = $_
            bytes = (Get-Item -LiteralPath $memberPath).Length
            sha256 = (Get-FileHash -LiteralPath $memberPath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    })
    $manifest = [ordered]@{
        schemaVersion = 1
        stage = "R5K"
        status = "disposable_windows_evidence_bundle"
        createdAt = [DateTime]::UtcNow.ToString("o")
        sourceCommit = if ($CaseId -eq "source_commit_drift") { "0" * 40 } else { $sourceCommit }
        appVersion = "0.7.0"
        currentInstallerSha256 = $currentInstallerSha256
        environment = [ordered]@{
            family = "windows"
            productName = "Microsoft Windows 11 Pro"
            buildNumber = "22621"
            architecture = "x64"
            machineClassFingerprintSha256 = "0" * 64
            machineNameIncluded = $false
            userNameIncluded = $false
        }
        members = $members
        releaseCandidate = $false
        promotionEligible = $false
        signedArtifactRuntimeProven = $false
        sourceUserContentIncluded = $false
    }
    if ($CaseId -eq "member_digest_drift") {
        $manifest.members[0].sha256 = "0" * 64
    }
    $manifestPath = Join-Path $caseRoot "r5k-bundle-manifest.json"
    [System.IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json -Depth 10),
        [System.Text.UTF8Encoding]::new($false)
    )

    $bundleStream = [System.IO.File]::Open($BundlePath, [System.IO.FileMode]::CreateNew)
    try {
        $archive = [System.IO.Compression.ZipArchive]::new(
            $bundleStream,
            [System.IO.Compression.ZipArchiveMode]::Create,
            $false
        )
        try {
            $entries = @(@{ Name = "r5k-bundle-manifest.json"; Path = $manifestPath })
            $entries += @($requiredEvidenceMembers | ForEach-Object {
                @{ Name = $_; Path = (Join-Path $caseRoot $_) }
            })
            if ($CaseId -eq "extra_member") {
                $extraPath = Join-Path $caseRoot "unexpected.txt"
                [System.IO.File]::WriteAllText($extraPath, "unexpected")
                $entries += @{ Name = "unexpected.txt"; Path = $extraPath }
            }
            if ($CaseId -eq "path_traversal") {
                $entries[1].Name = "../lifecycle-result.json"
            }
            foreach ($entryItem in $entries) {
                $entry = $archive.CreateEntry($entryItem.Name)
                $entryStream = $entry.Open()
                $sourceStream = [System.IO.File]::OpenRead($entryItem.Path)
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
}

try {
    $cases = [ordered]@{
        path_traversal = "flat safe member names"
        extra_member = "must contain exactly"
        source_commit_drift = "different source commit"
        member_digest_drift = "member digest drifted"
    }
    foreach ($case in $cases.GetEnumerator()) {
        $bundlePath = Join-Path $auditRoot "$($case.Key).zip"
        New-RejectionBundle -CaseId $case.Key -BundlePath $bundlePath
        $stdout = Join-Path $auditRoot "$($case.Key)-stdout.log"
        $stderr = Join-Path $auditRoot "$($case.Key)-stderr.log"
        $process = Start-Process -FilePath "powershell.exe" `
            -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $importer, "-BundlePath", $bundlePath, "-ValidationOnly") `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -Wait `
            -PassThru
        $message = (Get-Content -LiteralPath $stdout -Raw) + (Get-Content -LiteralPath $stderr -Raw)
        if ($process.ExitCode -eq 0 -or $message -notmatch [regex]::Escape($case.Value)) {
            throw "R5K rejection case did not fail as expected: $($case.Key)"
        }
        $evidenceSha256After = if (Test-Path -LiteralPath (Join-Path $target "r5k-bundle-manifest.json")) {
            (Get-FileHash -LiteralPath (Join-Path $target "r5k-bundle-manifest.json") -Algorithm SHA256).Hash
        } else { "" }
        if ($evidenceSha256After -ne $existingEvidenceSha256) {
            throw "R5K rejection case changed promoted evidence: $($case.Key)"
        }
    }
    Write-Host "R5K evidence rejection matrix passed: 4/4 malformed bundles rejected without promotion."
}
finally {
    if (Test-Path -LiteralPath $auditRoot) {
        $resolvedAuditRoot = (Resolve-Path -LiteralPath $auditRoot).Path
        $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
        if (-not $resolvedAuditRoot.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove R5K rejection directory outside TEMP."
        }
        Remove-Item -LiteralPath $resolvedAuditRoot -Recurse -Force
    }
}
