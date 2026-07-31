param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerDirectory,
    [string]$PreviousInstallerDirectory = "",
    [string]$CurrentVersion = "0.7.0",
    [string]$PreviousVersion = "0.6.2",
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{64}$")]
    [string]$ExpectedCurrentSha256,
    [Parameter(Mandatory = $true)]
    [string]$NodeExecutable,
    [Parameter(Mandatory = $true)]
    [string]$InstalledSmokeScript,
    [Parameter(Mandatory = $true)]
    [string]$ManagementRollbackSmokeScript,
    [Parameter(Mandatory = $true)]
    [string]$EvidenceExporter,
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{40}$")]
    [string]$ExpectedSourceCommit,
    [string]$OutputDirectory = "C:\LongEditR5IOutput",
    [switch]$ConfirmDisposableMachine,
    [switch]$AllowInstallerMutation,
    [switch]$RequireSignedArtifact
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

function Resolve-OneInstaller([string]$Directory, [string]$Version) {
    $matches = @(Get-ChildItem -LiteralPath $Directory -File -Filter "*_${Version}_x64-setup.exe")
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

function Get-OpenWithProgIds([string]$Extension) {
    $key = "HKCU:\Software\Classes\$Extension\OpenWithProgids"
    if (-not (Test-Path -LiteralPath $key)) {
        return @()
    }
    return @((Get-ItemProperty -LiteralPath $key).PSObject.Properties.Name | Where-Object {
        $_ -notmatch "^PS(Path|ParentPath|ChildName|Drive|Provider)$"
    })
}

function Get-DefaultProgId([string]$Extension) {
    $key = "HKCU:\Software\Classes\$Extension"
    if (-not (Test-Path -LiteralPath $key)) {
        return ""
    }
    return [string](Get-Item -LiteralPath $key).GetValue("")
}

function Get-ProgIdOpenCommand([string]$ProgId) {
    $key = "HKCU:\Software\Classes\$ProgId\shell\open\command"
    if (-not (Test-Path -LiteralPath $key)) {
        return ""
    }
    return [string](Get-Item -LiteralPath $key).GetValue("")
}

$webViewPolicyRoots = @(
    "HKCU:\Software\Policies\Microsoft\Edge\WebView2",
    "HKLM:\Software\Policies\Microsoft\Edge\WebView2"
)
$webViewHostIds = @("com.longyuye.mdreader", "tauri-app.exe", "tauri-app", "*")
$webViewTestPolicyEntries = New-Object System.Collections.Generic.List[object]

function Enable-WebView2TestPolicy([string]$UserDataRoot) {
    foreach ($root in $webViewPolicyRoots) {
        $argumentsKey = Join-Path $root "AdditionalBrowserArguments"
        $userDataKey = Join-Path $root "UserDataFolder"
        New-Item -Path $argumentsKey -Force | Out-Null
        New-Item -Path $userDataKey -Force | Out-Null
        foreach ($hostId in $webViewHostIds) {
            if ($null -ne (Get-ItemProperty -LiteralPath $argumentsKey -Name $hostId -ErrorAction SilentlyContinue)) {
                throw "Refusing to overwrite an existing WebView2 argument policy for $hostId."
            }
            New-ItemProperty -LiteralPath $argumentsKey -Name $hostId -PropertyType String `
                -Value "--remote-debugging-port=9343 --remote-allow-origins=*" -Force | Out-Null
            $script:webViewTestPolicyEntries.Add([ordered]@{ key = $argumentsKey; name = $hostId; root = $root })
        }
        foreach ($hostId in $webViewHostIds | Where-Object { $_ -ne "*" }) {
            if ($null -ne (Get-ItemProperty -LiteralPath $userDataKey -Name $hostId -ErrorAction SilentlyContinue)) {
                throw "Refusing to overwrite an existing WebView2 user-data policy for $hostId."
            }
            New-ItemProperty -LiteralPath $userDataKey -Name $hostId -PropertyType String `
                -Value $UserDataRoot -Force | Out-Null
            $script:webViewTestPolicyEntries.Add([ordered]@{ key = $userDataKey; name = $hostId; root = $root })
        }
    }
}

function Disable-WebView2TestPolicy {
    for ($index = $script:webViewTestPolicyEntries.Count - 1; $index -ge 0; $index -= 1) {
        $entry = $script:webViewTestPolicyEntries[$index]
        Remove-ItemProperty -LiteralPath $entry.key -Name $entry.name -ErrorAction SilentlyContinue
    }
    foreach ($root in $webViewPolicyRoots) {
        Remove-Item -LiteralPath (Join-Path $root "AdditionalBrowserArguments") -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $root "UserDataFolder") -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $root -ErrorAction SilentlyContinue
    }
    $script:webViewTestPolicyEntries.Clear()
}

function Invoke-RegisteredUninstall($Registration) {
    $uninstallCommand = [string]$Registration.UninstallString
    $uninstaller = $uninstallCommand.Trim().Trim('"')
    if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
        throw "Registered uninstaller is missing."
    }
    $process = Start-Process -FilePath $uninstaller -ArgumentList "/S" -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Uninstaller exited with $($process.ExitCode)."
    }
}

if ((Get-ProductRegistrations).Count -ne 0) {
    throw "R5I requires a disposable machine with no existing LongEdit product registration."
}
if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
    throw "R5J Node executable is missing in the disposable machine."
}
if (-not (Test-Path -LiteralPath $InstalledSmokeScript -PathType Leaf)) {
    throw "R5J installed-artifact smoke script is missing."
}
if (-not (Test-Path -LiteralPath $ManagementRollbackSmokeScript -PathType Leaf)) {
    throw "R5L management rollback smoke script is missing."
}
if (-not (Test-Path -LiteralPath $EvidenceExporter -PathType Leaf)) {
    throw "R5K evidence exporter is missing."
}

$resolvedPreviousInstallerDirectory = if ([string]::IsNullOrWhiteSpace($PreviousInstallerDirectory)) {
    $InstallerDirectory
} else {
    $PreviousInstallerDirectory
}
$currentInstaller = Resolve-OneInstaller $InstallerDirectory $CurrentVersion
$previousInstaller = Resolve-OneInstaller $resolvedPreviousInstallerDirectory $PreviousVersion
$currentInstallerSha256 = (Get-FileHash -LiteralPath $currentInstaller.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($currentInstallerSha256 -ne $ExpectedCurrentSha256.ToLowerInvariant()) {
    throw "Current installer SHA-256 does not match the approved R5H evidence."
}
$currentInstallerSignature = Get-AuthenticodeSignature -LiteralPath $currentInstaller.FullName
$signedArtifactRuntimeProven = $currentInstallerSignature.Status -eq "Valid" -and
    $null -ne $currentInstallerSignature.SignerCertificate -and
    $null -ne $currentInstallerSignature.TimeStamperCertificate
if ($RequireSignedArtifact -and -not $signedArtifactRuntimeProven) {
    throw "Signed-artifact mode requires a valid Authenticode signature and timestamp certificate."
}
function Get-CertificateSha256($Certificate) {
    if ($null -eq $Certificate) {
        return $null
    }
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($hasher.ComputeHash($Certificate.RawData))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $hasher.Dispose()
    }
}
$signatureEvidence = [ordered]@{
    status = [string]$currentInstallerSignature.Status
    valid = $currentInstallerSignature.Status -eq "Valid"
    timestamped = $null -ne $currentInstallerSignature.TimeStamperCertificate
    signerCertificateSha256 = Get-CertificateSha256 $currentInstallerSignature.SignerCertificate
    timestampCertificateSha256 = Get-CertificateSha256 $currentInstallerSignature.TimeStamperCertificate
}
$installRoot = "C:\LongEditR5I"
$libraryRoot = "C:\LongEditR5ILibrary"
$configRoot = Join-Path $env:APPDATA "com.longyuye.mdreader"
$configMarker = Join-Path $configRoot "r5i-retention-marker.json"
$configPath = Join-Path $configRoot "config.json"
$libraryMarker = Join-Path $libraryRoot "r5i-library-marker.txt"
$textFixture = Join-Path $libraryRoot "r5j-notes.txt"
$jsonFixture = Join-Path $libraryRoot "r5j-config.json"
$webviewRoot = "C:\LongEditR5IWebView"
$managementRoot = "C:\LongEditR5IManagement"
$managementBackup = Join-Path $managementRoot "r5l-management-backup.zip"
$checks = New-Object System.Collections.Generic.List[object]
$startedProcess = $null
$initialMarkdownDefault = Get-DefaultProgId ".md"
$initialMarkdownLongDefault = Get-DefaultProgId ".markdown"

New-Item -ItemType Directory -Path $OutputDirectory, $libraryRoot, $configRoot, $webviewRoot, $managementRoot -Force | Out-Null
[System.IO.File]::WriteAllText($libraryMarker, "R5I_EXTERNAL_LIBRARY_MUST_SURVIVE", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($configMarker, '{"stage":"R5I","retain":true}', [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($textFixture, "R5J_TEXT_INITIAL`n", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($jsonFixture, '{"marker":"R5J_JSON_INITIAL"}', [System.Text.UTF8Encoding]::new($false))
$formalConfig = [ordered]@{
    libraries = @([ordered]@{
        name = "R5L Disposable Vault"
        path = $libraryRoot
        gitEnabled = $false
        gitRemote = ""
        gitBranch = "main"
    })
    activeLibraryPath = $libraryRoot
    theme = "white"
    codeTheme = "github"
    editorMode = "wysiwyg"
    editorBgColor = ""
    heroIcon = "BookOpen"
    autoSaveInterval = 3
    textAutoSaveEnabled = $true
    maxHistoryCount = 10
    isAutostart = $false
    exitStrategy = "ask"
    visualStyle = "minimal"
    motionSpeed = "reduced"
    aiEnabled = $false
    aiProvider = "openai"
    aiEndpoint = "https://api.openai.com/v1"
    aiModel = "gpt-4o-mini"
    savedSearches = @([ordered]@{
        id = "r5l-saved-search"
        name = "R5L Restore Marker"
        query = "R5L"
        libraryPath = $libraryRoot
        objectTypes = @("plain-text", "json")
        createdAt = 1
    })
}
[System.IO.File]::WriteAllText(
    $configPath,
    ($formalConfig | ConvertTo-Json -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
)

function Write-RuntimeLaunchDiagnostics([System.Diagnostics.Process]$Process, [string]$Phase) {
    $webViewProcesses = @(Get-Process -Name "msedgewebview2" -ErrorAction SilentlyContinue)
    $webViewVersions = @(
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    ) | ForEach-Object {
        if (Test-Path -LiteralPath $_) {
            [string](Get-ItemPropertyValue -LiteralPath $_ -Name "pv" -ErrorAction SilentlyContinue)
        }
    } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
    $Process.Refresh()
    $diagnostics = [ordered]@{
        schemaVersion = 1
        stage = "U2"
        phase = $Phase
        capturedAt = (Get-Date).ToUniversalTime().ToString("o")
        processId = $Process.Id
        processExited = $Process.HasExited
        processExitCode = if ($Process.HasExited) { $Process.ExitCode } else { $null }
        userInteractive = [Environment]::UserInteractive
        sessionName = [string]$env:SESSIONNAME
        explorerProcessCount = @(Get-Process -Name "explorer" -ErrorAction SilentlyContinue).Count
        webViewProcessCount = $webViewProcesses.Count
        webViewRuntimeVersions = @($webViewVersions)
        remoteDebugPortListening = $null -ne (Get-NetTCPConnection -LocalPort 9343 -State Listen -ErrorAction SilentlyContinue)
        sourceUserContentIncluded = $false
        releaseCandidate = $false
    }
    [System.IO.File]::WriteAllText(
        (Join-Path $OutputDirectory "runtime-launch-diagnostics-$Phase.json"),
        ($diagnostics | ConvertTo-Json -Depth 5),
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Wait-ForPort([int]$Port, [bool]$Listening, [System.Diagnostics.Process]$Process = $null, [string]$Phase = "runtime") {
    for ($attempt = 0; $attempt -lt 1200; $attempt += 1) {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) {
            return
        }
        if ($Listening -and $null -ne $Process) {
            $Process.Refresh()
            if ($Process.HasExited) {
                Write-RuntimeLaunchDiagnostics -Process $Process -Phase $Phase
                throw "Application exited with code $($Process.ExitCode) before port $Port started listening."
            }
        }
        Start-Sleep -Milliseconds 100
    }
    if ($Listening -and $null -ne $Process) {
        Write-RuntimeLaunchDiagnostics -Process $Process -Phase $Phase
    }
    throw "Timed out waiting for port $Port listening=$Listening."
}

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
    $markdownProgIds = @(Get-OpenWithProgIds ".md")
    $markdownLongProgIds = @(Get-OpenWithProgIds ".markdown")
    if ($markdownProgIds -notcontains "LongEdit.Markdown" -or $markdownLongProgIds -notcontains "LongEdit.Markdown") {
        throw "Current installer did not register both Markdown OpenWith ProgIDs."
    }
    if ((Get-DefaultProgId ".md") -ne $initialMarkdownDefault -or
        (Get-DefaultProgId ".markdown") -ne $initialMarkdownLongDefault) {
        throw "Current installer changed a Windows-owned Markdown default selection."
    }
    $associationCommand = Get-ProgIdOpenCommand "LongEdit.Markdown"
    if ([string]::IsNullOrWhiteSpace($associationCommand) -or $associationCommand -notlike "*$installRoot*") {
        throw "Current Markdown ProgID does not target the isolated installation."
    }
    $checks.Add([ordered]@{
        id = "file-association-registration"
        status = "passed"
        defaultSelectionChanged = $false
        previousMdDefault = $initialMarkdownDefault
        previousMarkdownDefault = $initialMarkdownLongDefault
    })

    $mainBinary = Join-Path $installRoot "tauri-app.exe"
    if (-not (Test-Path -LiteralPath $mainBinary -PathType Leaf)) {
        throw "Installed application binary is missing."
    }
    if (Get-NetTCPConnection -LocalPort 9343 -State Listen -ErrorAction SilentlyContinue) {
        throw "R5J installed-artifact smoke requires free local port 9343."
    }
    $env:LONGEDIT_E2E_LIBRARY = $libraryRoot
    $env:LONGEDIT_E2E_THEME = "white"
    $env:LONGEDIT_E2E_STYLE = "minimal"
    $env:LONGEDIT_E2E_CODE_THEME = "github"
    $env:LONGEDIT_E2E_MOTION = "reduced"
    $env:WEBVIEW2_USER_DATA_FOLDER = $webviewRoot
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9343 --remote-allow-origins=*"
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9343"
    $env:LONGEDIT_R5J_LIBRARY = $libraryRoot
    $env:LONGEDIT_R5J_OUTPUT = $OutputDirectory
    $env:LONGEDIT_R5J_EXECUTABLE = $mainBinary
    $env:LONGEDIT_R5J_APP_VERSION = $CurrentVersion
    $env:LONGEDIT_R5J_INSTALLER_SHA256 = $currentInstallerSha256
    $env:LONGEDIT_R5J_SIGNED_RUNTIME = if ($signedArtifactRuntimeProven) { "true" } else { "false" }
    $env:LONGEDIT_R5L_LIBRARY = $libraryRoot
    $env:LONGEDIT_R5L_OUTPUT = $OutputDirectory
    $env:LONGEDIT_R5L_BACKUP = $managementBackup
    $env:LONGEDIT_R5L_MODE = "prepare"

    Enable-WebView2TestPolicy -UserDataRoot $webviewRoot
    $startedProcess = Start-Process -FilePath $mainBinary -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
    Wait-ForPort -Port 9343 -Listening $true -Process $startedProcess -Phase "installed-upgrade"
    & $NodeExecutable $InstalledSmokeScript
    if ($LASTEXITCODE -ne 0) {
        throw "R5J installed-artifact route and I/O smoke failed."
    }
    & $NodeExecutable $ManagementRollbackSmokeScript
    if ($LASTEXITCODE -ne 0) {
        throw "R5L management backup and knowledge-index prepare smoke failed."
    }
    $checks.Add([ordered]@{ id = "first-launch-after-upgrade"; status = "passed" })
    $checks.Add([ordered]@{ id = "installed-artifact-route-and-io-smoke"; status = "passed" })
    $checks.Add([ordered]@{ id = "management-backup-and-index-prepare"; status = "passed" })
    Stop-Process -Id $startedProcess.Id -Force
    $startedProcess = $null
    Wait-ForPort -Port 9343 -Listening $false

    $currentBinarySha256 = (Get-FileHash -LiteralPath $mainBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    $downgradeProcess = Start-Process -FilePath $previousInstaller.FullName `
        -ArgumentList @("/S", "/D=$installRoot") `
        -WindowStyle Hidden `
        -Wait `
        -PassThru
    $registrationAfterDowngrade = @(Get-ProductRegistrations | Where-Object { $_.DisplayVersion -eq $CurrentVersion })
    $currentVersionPreserved = $registrationAfterDowngrade.Count -eq 1 -and
        (Test-Path -LiteralPath $mainBinary -PathType Leaf) -and
        (Get-FileHash -LiteralPath $mainBinary -Algorithm SHA256).Hash.ToLowerInvariant() -eq $currentBinarySha256
    if ($currentVersionPreserved) {
        $currentRegistration = $registrationAfterDowngrade[0]
        $checks.Add([ordered]@{
            id = "controlled-downgrade-safety"
            status = "passed"
            mode = "installer-rejected-downgrade"
            installerExitCode = $downgradeProcess.ExitCode
            currentVersionRestored = $false
        })
    } else {
        $legacyRegistration = @(Get-ProductRegistrations | Where-Object { $_.DisplayVersion -eq $PreviousVersion })
        if ($legacyRegistration.Count -ne 1 -or -not (Test-Path -LiteralPath $mainBinary -PathType Leaf)) {
            throw "Legacy downgrade left the installation in an unrecognized state."
        }
        $checks.Add([ordered]@{
            id = "legacy-downgrade-detected"
            status = "passed"
            version = $PreviousVersion
            reason = "historical-installer-predates-downgrade-policy"
        })
        Invoke-Installer $currentInstaller $installRoot
        $currentRegistrationsAfterRecovery = @(Get-ProductRegistrations | Where-Object { $_.DisplayVersion -eq $CurrentVersion })
        $legacyRegistrationsAfterRecovery = @(Get-ProductRegistrations | Where-Object { $_.DisplayVersion -eq $PreviousVersion })
        if ($currentRegistrationsAfterRecovery.Count -ne 1 -or
            $legacyRegistrationsAfterRecovery.Count -ne 0 -or
            -not (Test-Path -LiteralPath $mainBinary -PathType Leaf) -or
            (Get-FileHash -LiteralPath $mainBinary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $currentBinarySha256 -or
            -not (Test-Path -LiteralPath $libraryMarker -PathType Leaf) -or
            -not (Test-Path -LiteralPath $configMarker -PathType Leaf)) {
            throw "Current-version recovery after the legacy downgrade did not restore the verified installation."
        }
        $currentRegistration = $currentRegistrationsAfterRecovery[0]
        $checks.Add([ordered]@{
            id = "controlled-downgrade-safety"
            status = "passed"
            mode = "legacy-downgrade-detected-and-current-restored"
            installerExitCode = $downgradeProcess.ExitCode
            currentVersionRestored = $true
            restoredBinarySha256 = $currentBinarySha256
        })
    }

    Invoke-RegisteredUninstall $currentRegistration
    Wait-ForRegistration $CurrentVersion $false | Out-Null
    if ((Get-ProductRegistrations).Count -ne 0) {
        throw "A LongEdit product registration remained after uninstall."
    }
    $checks.Add([ordered]@{ id = "silent-uninstall"; status = "passed" })
    if ((Get-OpenWithProgIds ".md") -contains "LongEdit.Markdown" -or
        (Get-OpenWithProgIds ".markdown") -contains "LongEdit.Markdown") {
        throw "Current Markdown OpenWith ProgID remained after uninstall."
    }
    if ((Get-DefaultProgId ".md") -ne $initialMarkdownDefault -or
        (Get-DefaultProgId ".markdown") -ne $initialMarkdownLongDefault) {
        throw "Markdown default selection was not restored after uninstall."
    }
    $checks.Add([ordered]@{ id = "file-association-recovery"; status = "passed" })

    if (-not (Test-Path -LiteralPath $libraryMarker -PathType Leaf)) {
        throw "External knowledge-library marker was removed by uninstall."
    }
    if (-not (Test-Path -LiteralPath $configMarker -PathType Leaf)) {
        throw "Application configuration marker was removed by uninstall."
    }
    $checks.Add([ordered]@{ id = "uninstall-retains-user-data"; status = "passed" })

    foreach ($name in @(
        "LONGEDIT_E2E_LIBRARY",
        "LONGEDIT_E2E_THEME",
        "LONGEDIT_E2E_STYLE",
        "LONGEDIT_E2E_CODE_THEME",
        "LONGEDIT_E2E_MOTION",
        "WEBVIEW2_USER_DATA_FOLDER",
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "LONGEDIT_CDP_ENDPOINT",
        "LONGEDIT_R5J_LIBRARY",
        "LONGEDIT_R5J_OUTPUT",
        "LONGEDIT_R5J_EXECUTABLE",
        "LONGEDIT_R5J_APP_VERSION",
        "LONGEDIT_R5J_INSTALLER_SHA256",
        "LONGEDIT_R5J_SIGNED_RUNTIME",
        "LONGEDIT_R5L_LIBRARY",
        "LONGEDIT_R5L_OUTPUT",
        "LONGEDIT_R5L_BACKUP",
        "LONGEDIT_R5L_MODE"
    )) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }

    Invoke-Installer $previousInstaller $installRoot
    $rollbackRegistration = @(Wait-ForRegistration $PreviousVersion $true)[0]
    $checks.Add([ordered]@{ id = "rollback-previous-install"; status = "passed"; version = $PreviousVersion })
    $rollbackBinary = Join-Path $installRoot "tauri-app.exe"
    $startedProcess = Start-Process -FilePath $rollbackBinary -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 5
    if ($startedProcess.HasExited) {
        throw "Rolled-back previous version exited before the launch smoke completed."
    }
    $checks.Add([ordered]@{ id = "rollback-first-launch"; status = "passed" })
    Stop-Process -Id $startedProcess.Id -Force
    $startedProcess = $null
    Invoke-RegisteredUninstall $rollbackRegistration
    Wait-ForRegistration $PreviousVersion $false | Out-Null
    if (-not (Test-Path -LiteralPath $libraryMarker -PathType Leaf) -or
        -not (Test-Path -LiteralPath $configMarker -PathType Leaf)) {
        throw "Rollback cleanup removed retained user data."
    }
    $checks.Add([ordered]@{ id = "rollback-cleanup-retains-user-data"; status = "passed" })

    $replacementConfig = [ordered]@{
        libraries = @()
        activeLibraryPath = ""
        savedSearches = @()
    }
    [System.IO.File]::WriteAllText(
        $configPath,
        ($replacementConfig | ConvertTo-Json -Depth 4),
        [System.Text.UTF8Encoding]::new($false)
    )
    Invoke-Installer $currentInstaller $installRoot
    $restoreRegistration = @(Wait-ForRegistration $CurrentVersion $true)[0]
    $restoreBinary = Join-Path $installRoot "tauri-app.exe"
    $env:WEBVIEW2_USER_DATA_FOLDER = $webviewRoot
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9343 --remote-allow-origins=*"
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9343"
    $env:LONGEDIT_R5L_LIBRARY = $libraryRoot
    $env:LONGEDIT_R5L_OUTPUT = $OutputDirectory
    $env:LONGEDIT_R5L_BACKUP = $managementBackup
    $env:LONGEDIT_R5L_MODE = "restore"
    $startedProcess = Start-Process -FilePath $restoreBinary -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
    Wait-ForPort -Port 9343 -Listening $true -Process $startedProcess -Phase "post-rollback-restore"
    & $NodeExecutable $ManagementRollbackSmokeScript
    if ($LASTEXITCODE -ne 0) {
        throw "R5L post-rollback management restore and knowledge-index smoke failed."
    }
    $checks.Add([ordered]@{ id = "post-rollback-management-backup-restore"; status = "passed" })
    $checks.Add([ordered]@{ id = "post-restore-knowledge-index-rebuild"; status = "passed" })
    $checks.Add([ordered]@{ id = "post-restore-representative-file-reopen"; status = "passed" })
    Stop-Process -Id $startedProcess.Id -Force
    $startedProcess = $null
    Wait-ForPort -Port 9343 -Listening $false
    Invoke-RegisteredUninstall $restoreRegistration
    Wait-ForRegistration $CurrentVersion $false | Out-Null
    if (-not (Test-Path -LiteralPath $libraryMarker -PathType Leaf) -or
        -not (Test-Path -LiteralPath $configMarker -PathType Leaf) -or
        -not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        throw "R5L final cleanup removed restored management data."
    }
    $checks.Add([ordered]@{ id = "post-restore-uninstall-retains-management-data"; status = "passed" })

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
        signedArtifactRuntimeProven = $signedArtifactRuntimeProven
        signature = $signatureEvidence
        sourceUserContentIncluded = $false
        checks = [object[]]$checks.ToArray()
        installedArtifactSmokeEvidence = "installed-artifact-smoke.json"
        managementRollbackEvidence = "management-backup-index-evidence.json"
    }
    [System.IO.File]::WriteAllText(
        (Join-Path $OutputDirectory "lifecycle-result.json"),
        ($result | ConvertTo-Json -Depth 8),
        [System.Text.UTF8Encoding]::new($false)
    )
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $EvidenceExporter `
        -EvidenceDirectory $OutputDirectory `
        -OutputPath (Join-Path $OutputDirectory "r5k-windows-evidence.zip") `
        -ExpectedSourceCommit $ExpectedSourceCommit
    if ($LASTEXITCODE -ne 0) {
        throw "R5K Windows evidence bundle export failed."
    }
    Write-Host "R5I disposable lifecycle smoke passed."
}
finally {
    if ($startedProcess -and -not $startedProcess.HasExited) {
        Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Disable-WebView2TestPolicy
}
