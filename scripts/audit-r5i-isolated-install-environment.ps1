param(
    [string]$OutputPath = "docs/evidence/r5i-isolated-install-lifecycle/environment-audit.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = [string]$package.version

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

$computer = Get-ComputerInfo -Property WindowsProductName, WindowsVersion, OsBuildNumber, OsArchitecture, CsHypervisorPresent
$sandboxExecutable = Join-Path $env:WINDIR "System32\WindowsSandbox.exe"
$registrations = @(Get-LongEditRegistrations)
$runningProductProcesses = @(Get-Process -Name "tauri-app" -ErrorAction SilentlyContinue)
$currentNsis = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "src-tauri/target/release/bundle/nsis") -File -Filter "*_${version}_x64-setup.exe" -ErrorAction SilentlyContinue)
$previousNsis = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "src-tauri/target/release/bundle/nsis") -File -Filter "*_0.6.2_x64-setup.exe" -ErrorAction SilentlyContinue)

$virtualization = [ordered]@{
    hypervisorPresent = [bool]$computer.CsHypervisorPresent
    windowsSandboxExecutablePresent = Test-Path -LiteralPath $sandboxExecutable -PathType Leaf
    vmwareCommandPresent = Test-CommandAvailable "vmrun.exe"
    virtualBoxCommandPresent = Test-CommandAvailable "VBoxManage.exe"
    qemuCommandPresent = Test-CommandAvailable "qemu-system-x86_64.exe"
    dockerCommandPresent = Test-CommandAvailable "docker.exe"
}
$isolatedRunnerAvailable = (
    $virtualization.windowsSandboxExecutablePresent -or
    $virtualization.vmwareCommandPresent -or
    $virtualization.virtualBoxCommandPresent -or
    $virtualization.qemuCommandPresent
)

$manifest = [ordered]@{
    schemaVersion = 1
    stage = "R5I"
    appVersion = $version
    capturedAt = (Get-Date).ToUniversalTime().ToString("o")
    environment = [ordered]@{
        windowsProductName = [string]$computer.WindowsProductName
        windowsVersion = [string]$computer.WindowsVersion
        osBuildNumber = [string]$computer.OsBuildNumber
        osArchitecture = [string]$computer.OsArchitecture
        machineIdentityIncluded = $false
    }
    virtualization = $virtualization
    artifactPreflight = [ordered]@{
        currentNsisMatchCount = $currentNsis.Count
        previousNsisMatchCount = $previousNsis.Count
        currentInstallerVersion = $version
        previousInstallerVersion = "0.6.2"
    }
    hostSafety = [ordered]@{
        existingProductRegistrationCount = $registrations.Count
        existingProductVersions = @($registrations | ForEach-Object { [string]$_.DisplayVersion } | Sort-Object -Unique)
        runningProductProcessCount = $runningProductProcesses.Count
        hostInstallerMutationAllowed = $false
        existingInstallMayBeOverwritten = $false
    }
    execution = [ordered]@{
        isolatedRunnerAvailable = $isolatedRunnerAvailable
        lifecycleSmokeExecuted = $false
        currentStatus = if ($isolatedRunnerAvailable) {
            "isolated-runner-detected-execution-pending"
        } else {
            "host-preflight-passed-isolated-runner-unavailable"
        }
        releaseCandidate = $false
        promotionEligible = $false
        sourceUserContentIncluded = $false
    }
}

$absoluteOutputPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "docs/evidence/r5i-isolated-install-lifecycle"))
if (-not $absoluteOutputPath.StartsWith($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "R5I environment evidence must remain under docs/evidence/r5i-isolated-install-lifecycle."
}
New-Item -ItemType Directory -Path (Split-Path -Parent $absoluteOutputPath) -Force | Out-Null
[System.IO.File]::WriteAllText(
    $absoluteOutputPath,
    ($manifest | ConvertTo-Json -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "R5I isolated environment audit captured: $absoluteOutputPath"
Write-Host "Isolated runner available: $isolatedRunnerAvailable"
Write-Host "Existing product registrations: $($registrations.Count); host mutation allowed: false"
