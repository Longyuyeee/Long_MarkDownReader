param(
    [string]$OutputPath = "docs/evidence/u2-disposable-install-lifecycle/environment-audit.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$policy = Get-Content -LiteralPath (Join-Path $repoRoot "shared/u1-unsigned-internal-candidate-policy.json") -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot $policy.evidence.installerManifest) -Raw | ConvertFrom-Json
$nsis = @($manifest.artifacts | Where-Object { $_.target -eq "nsis" })
if ($nsis.Count -ne 1) { throw "U2 requires one U1 NSIS artifact." }
$candidateDirectory = Join-Path $repoRoot ([string]$nsis[0].relativeDirectory)
$candidateFiles = @(Get-ChildItem -LiteralPath $candidateDirectory -File -Filter "*_$($manifest.appVersion)_x64-setup.exe" -ErrorAction SilentlyContinue)
$previousDirectory = Join-Path $repoRoot "src-tauri/target/release/bundle/nsis"
$previousFiles = @(Get-ChildItem -LiteralPath $previousDirectory -File -Filter "*_0.6.2_x64-setup.exe" -ErrorAction SilentlyContinue)
$candidateHashMatch = $false
$candidateAuthenticodeStatus = "Missing"
if ($candidateFiles.Count -eq 1) {
    $candidateHashMatch = (Get-FileHash -LiteralPath $candidateFiles[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant() -eq [string]$nsis[0].sha256
    $candidateAuthenticodeStatus = (Get-AuthenticodeSignature -LiteralPath $candidateFiles[0].FullName).Status.ToString()
}

function Test-CommandAvailable([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}
function Get-LongEditRegistrations {
    $roots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    return @(Get-ItemProperty $roots -ErrorAction SilentlyContinue | Where-Object {
        $_.Publisher -eq "longyuye" -and $_.MainBinaryName -eq "tauri-app.exe"
    })
}

$sandboxExecutable = Join-Path $env:WINDIR "System32\WindowsSandbox.exe"
$virtualization = [ordered]@{
    windowsSandboxExecutablePresent = Test-Path -LiteralPath $sandboxExecutable -PathType Leaf
    hyperVProvisioningCommandPresent = Test-CommandAvailable "New-VM"
    vmwareCommandPresent = Test-CommandAvailable "vmrun.exe"
    virtualBoxCommandPresent = Test-CommandAvailable "VBoxManage.exe"
    qemuCommandPresent = Test-CommandAvailable "qemu-system-x86_64.exe"
}
$isolatedRunnerAvailable = $virtualization.windowsSandboxExecutablePresent -or $virtualization.hyperVProvisioningCommandPresent -or $virtualization.vmwareCommandPresent -or $virtualization.virtualBoxCommandPresent -or $virtualization.qemuCommandPresent
$registrations = @(Get-LongEditRegistrations)
$runningProcesses = @(Get-Process -Name "tauri-app" -ErrorAction SilentlyContinue)

$audit = [ordered]@{
    schemaVersion = 1
    stage = "U2"
    capturedAt = (Get-Date).ToUniversalTime().ToString("o")
    appVersion = [string]$manifest.appVersion
    sourceCommit = [string]$manifest.sourceCommit
    artifactPreflight = [ordered]@{
        candidateNsisMatchCount = $candidateFiles.Count
        previousNsisMatchCount = $previousFiles.Count
        candidateHashMatchesManifest = $candidateHashMatch
        candidateAuthenticodeStatus = $candidateAuthenticodeStatus
    }
    virtualization = $virtualization
    hostSafety = [ordered]@{
        existingProductRegistrationCount = $registrations.Count
        runningProductProcessCount = $runningProcesses.Count
        hostInstallerMutationAllowed = $false
        existingInstallMayBeOverwritten = $false
    }
    execution = [ordered]@{
        sandboxConfigurationCanBePrepared = $true
        isolatedRunnerAvailable = $isolatedRunnerAvailable
        lifecycleSmokeExecuted = $false
        currentStatus = if ($isolatedRunnerAvailable -and $registrations.Count -eq 0 -and $runningProcesses.Count -eq 0) {
            "disposable-runner-detected-execution-pending"
        } else {
            "handoff-ready-current-host-execution-blocked"
        }
        releaseCandidate = $false
        promotionEligible = $false
        sourceUserContentIncluded = $false
    }
}

$absoluteOutput = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "docs/evidence/u2-disposable-install-lifecycle"))
if (-not $absoluteOutput.StartsWith($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "U2 environment evidence must remain under docs/evidence/u2-disposable-install-lifecycle."
}
New-Item -ItemType Directory -Path (Split-Path -Parent $absoluteOutput) -Force | Out-Null
[System.IO.File]::WriteAllText($absoluteOutput, ($audit | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
Write-Output "U2 disposable environment audit captured: $absoluteOutput"
