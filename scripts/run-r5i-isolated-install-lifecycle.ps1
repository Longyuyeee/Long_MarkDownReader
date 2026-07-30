param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerDirectory,
    [string]$CurrentVersion = "0.7.0",
    [string]$PreviousVersion = "0.6.2",
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{64}$")]
    [string]$ExpectedCurrentSha256,
    [string]$OutputDirectory = "C:\LongEditR5IOutput",
    [switch]$ConfirmDisposableMachine,
    [switch]$AllowInstallerMutation
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmDisposableMachine -or -not $AllowInstallerMutation) {
    throw "R5I lifecycle execution requires both -ConfirmDisposableMachine and -AllowInstallerMutation."
}
$disposableIdentity = $env:USERNAME -eq "WDAGUtilityAccount" -or $env:LONGEDIT_R5I_DISPOSABLE -eq "1"
if (-not $disposableIdentity) {
    throw "R5I refuses installer mutation outside Windows Sandbox or an explicitly provisioned disposable VM."
}

function Get-ProductRegistrations {
    return @(Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | Where-Object {
        $_.Publisher -eq "longyuye" -and $_.MainBinaryName -eq "tauri-app.exe"
    })
}

function Wait-ForRegistration([string]$Version, [bool]$Present) {
    for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
        $matches = @(Get-ProductRegistrations | Where-Object { $_.DisplayVersion -eq $Version })
        if (($Present -and $matches.Count -eq 1) -or (-not $Present -and $matches.Count -eq 0)) {
            return $matches
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Timed out waiting for registration version=$Version present=$Present."
}

function Resolve-OneInstaller([string]$Version) {
    $matches = @(Get-ChildItem -LiteralPath $InstallerDirectory -File -Filter "*_${Version}_x64-setup.exe")
    if ($matches.Count -ne 1) {
        throw "Expected exactly one NSIS installer for version $Version; found $($matches.Count)."
    }
    return $matches[0]
}

function Invoke-Installer([System.IO.FileInfo]$Installer, [string]$InstallRoot) {
    $process = Start-Process -FilePath $Installer.FullName `
        -ArgumentList @("/S", "/D=$InstallRoot") `
        -WindowStyle Hidden `
        -Wait `
        -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Installer $($Installer.Name) exited with $($process.ExitCode)."
    }
}

if ((Get-ProductRegistrations).Count -ne 0) {
    throw "R5I requires a disposable machine with no existing LongEdit product registration."
}

$currentInstaller = Resolve-OneInstaller $CurrentVersion
$previousInstaller = Resolve-OneInstaller $PreviousVersion
$currentInstallerSha256 = (Get-FileHash -LiteralPath $currentInstaller.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($currentInstallerSha256 -ne $ExpectedCurrentSha256.ToLowerInvariant()) {
    throw "Current installer SHA-256 does not match the approved R5H evidence."
}
$installRoot = "C:\LongEditR5I"
$libraryRoot = "C:\LongEditR5ILibrary"
$configRoot = Join-Path $env:APPDATA "com.longyuye.mdreader"
$configMarker = Join-Path $configRoot "r5i-retention-marker.json"
$libraryMarker = Join-Path $libraryRoot "r5i-library-marker.txt"
$checks = New-Object System.Collections.Generic.List[object]
$startedProcess = $null

New-Item -ItemType Directory -Path $OutputDirectory, $libraryRoot, $configRoot -Force | Out-Null
[System.IO.File]::WriteAllText($libraryMarker, "R5I_EXTERNAL_LIBRARY_MUST_SURVIVE", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($configMarker, '{"stage":"R5I","retain":true}', [System.Text.UTF8Encoding]::new($false))

try {
    Invoke-Installer $previousInstaller $installRoot
    $previousRegistration = @(Wait-ForRegistration $PreviousVersion $true)[0]
    $checks.Add([ordered]@{ id = "previous-version-fresh-install"; status = "passed"; version = $PreviousVersion })

    Invoke-Installer $currentInstaller $installRoot
    $currentRegistration = @(Wait-ForRegistration $CurrentVersion $true)[0]
    if ([string]$currentRegistration.InstallLocation -notlike "*LongEditR5I*") {
        throw "Current installation escaped the isolated install root."
    }
    $checks.Add([ordered]@{ id = "controlled-upgrade"; status = "passed"; from = $PreviousVersion; to = $CurrentVersion })

    $mainBinary = Join-Path $installRoot "tauri-app.exe"
    if (-not (Test-Path -LiteralPath $mainBinary -PathType Leaf)) {
        throw "Installed application binary is missing."
    }
    $startedProcess = Start-Process -FilePath $mainBinary -WorkingDirectory $installRoot -PassThru
    Start-Sleep -Seconds 5
    if ($startedProcess.HasExited) {
        throw "Installed application exited before the launch smoke window completed."
    }
    $checks.Add([ordered]@{ id = "first-launch-after-upgrade"; status = "passed" })
    Stop-Process -Id $startedProcess.Id -Force
    $startedProcess = $null

    $uninstallCommand = [string]$currentRegistration.UninstallString
    $uninstaller = $uninstallCommand.Trim().Trim('"')
    if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
        throw "Registered uninstaller is missing."
    }
    $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList "/S" -WindowStyle Hidden -Wait -PassThru
    if ($uninstallProcess.ExitCode -ne 0) {
        throw "Uninstaller exited with $($uninstallProcess.ExitCode)."
    }
    Wait-ForRegistration $CurrentVersion $false | Out-Null
    if ((Get-ProductRegistrations).Count -ne 0) {
        throw "A LongEdit product registration remained after uninstall."
    }
    $checks.Add([ordered]@{ id = "silent-uninstall"; status = "passed" })

    if (-not (Test-Path -LiteralPath $libraryMarker -PathType Leaf)) {
        throw "External knowledge-library marker was removed by uninstall."
    }
    if (-not (Test-Path -LiteralPath $configMarker -PathType Leaf)) {
        throw "Application configuration marker was removed by uninstall."
    }
    $checks.Add([ordered]@{ id = "uninstall-retains-user-data"; status = "passed" })

    $result = [ordered]@{
        schemaVersion = 1
        stage = "R5I"
        capturedAt = (Get-Date).ToUniversalTime().ToString("o")
        environment = "disposable-windows-guest"
        currentVersion = $CurrentVersion
        previousVersion = $PreviousVersion
        currentInstallerSha256 = $currentInstallerSha256
        previousInstallerSha256 = (Get-FileHash -LiteralPath $previousInstaller.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        status = "passed"
        releaseCandidate = $false
        promotionEligible = $false
        sourceUserContentIncluded = $false
        checks = @($checks)
    }
    [System.IO.File]::WriteAllText(
        (Join-Path $OutputDirectory "lifecycle-result.json"),
        ($result | ConvertTo-Json -Depth 8),
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host "R5I disposable lifecycle smoke passed."
}
finally {
    if ($startedProcess -and -not $startedProcess.HasExited) {
        Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
