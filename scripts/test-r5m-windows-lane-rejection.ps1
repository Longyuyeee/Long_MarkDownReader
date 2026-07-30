$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression

$repoRoot = Split-Path -Parent $PSScriptRoot
$importer = Join-Path $repoRoot "scripts/import-r5k-windows-evidence-bundle.ps1"
$target = Join-Path $repoRoot "docs/evidence/r5k-windows-matrix/windows-10-x64"
if (Test-Path -LiteralPath $target) {
    throw "R5M lane rejection test only runs before Windows 10 evidence is imported."
}
$auditRoot = Join-Path $env:TEMP ("longedit-r5m-lane-rejection-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null

try {
    $requiredMembers = @(
        "lifecycle-result.json",
        "installed-artifact-smoke.json",
        "installed-route-mount-evidence.json",
        "installed-route-performance-evidence.json",
        "installed-txt-save-reopen.jpg",
        "installed-json-save-reopen.jpg",
        "management-backup-index-evidence.json"
    )
    foreach ($name in $requiredMembers) {
        [System.IO.File]::WriteAllText(
            (Join-Path $auditRoot $name),
            "synthetic-r5m-lane-rejection-$name",
            [System.Text.UTF8Encoding]::new($false)
        )
    }
    $r5h = Get-Content -LiteralPath (Join-Path $repoRoot "docs/evidence/r5h-current-installers/installer-artifact-manifest.json") -Raw | ConvertFrom-Json
    $installerHash = [string]@($r5h.artifacts | Where-Object { $_.target -eq "nsis" })[0].sha256
    $manifest = [ordered]@{
        schemaVersion = 1
        stage = "R5K"
        status = "disposable_windows_evidence_bundle"
        sourceCommit = ([string](& git -C $repoRoot rev-parse HEAD)).Trim()
        appVersion = [string]$r5h.appVersion
        currentInstallerSha256 = $installerHash
        environment = [ordered]@{
            family = "windows"
            productName = "Microsoft Windows 11 Pro"
            version = "10.0.22621"
            buildNumber = "22621"
            architecture = "64-bit"
            machineClassFingerprintSha256 = "0" * 64
            machineNameIncluded = $false
            userNameIncluded = $false
        }
        members = @($requiredMembers | ForEach-Object {
            $memberPath = Join-Path $auditRoot $_
            [ordered]@{
                name = $_
                bytes = (Get-Item -LiteralPath $memberPath).Length
                sha256 = (Get-FileHash -LiteralPath $memberPath -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        })
        releaseCandidate = $false
        promotionEligible = $false
        signedArtifactRuntimeProven = $false
        sourceUserContentIncluded = $false
    }
    $manifestPath = Join-Path $auditRoot "r5k-bundle-manifest.json"
    [System.IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json -Depth 10),
        [System.Text.UTF8Encoding]::new($false)
    )
    $bundlePath = Join-Path $auditRoot "windows-11-mislabeled-as-windows-10.zip"
    $bundleStream = [System.IO.File]::Open($bundlePath, [System.IO.FileMode]::CreateNew)
    try {
        $archive = [System.IO.Compression.ZipArchive]::new(
            $bundleStream,
            [System.IO.Compression.ZipArchiveMode]::Create,
            $false
        )
        try {
            foreach ($name in @("r5k-bundle-manifest.json") + $requiredMembers) {
                $entry = $archive.CreateEntry($name)
                $entryStream = $entry.Open()
                $sourceStream = [System.IO.File]::OpenRead((Join-Path $auditRoot $name))
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

    $stdout = Join-Path $auditRoot "stdout.log"
    $stderr = Join-Path $auditRoot "stderr.log"
    $process = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @(
            "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $importer,
            "-BundlePath", $bundlePath,
            "-TargetName", "windows-10-x64",
            "-ExpectedWindowsClass", "windows-10-x64"
        ) `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -Wait `
        -PassThru
    $message = (Get-Content -LiteralPath $stdout -Raw) + (Get-Content -LiteralPath $stderr -Raw)
    if ($process.ExitCode -eq 0 -or $message -notmatch "Windows evidence class mismatch") {
        throw "R5M wrong-lane evidence was not rejected."
    }
    if (Test-Path -LiteralPath $target) {
        throw "R5M wrong-lane evidence created a promoted directory."
    }
    Write-Host "R5M Windows lane rejection passed: Windows 11 build rejected from Windows 10 lane."
}
finally {
    if (Test-Path -LiteralPath $auditRoot) {
        $resolvedAuditRoot = (Resolve-Path -LiteralPath $auditRoot).Path
        $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
        if (-not $resolvedAuditRoot.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove R5M lane rejection directory outside TEMP."
        }
        Remove-Item -LiteralPath $resolvedAuditRoot -Recurse -Force
    }
}
