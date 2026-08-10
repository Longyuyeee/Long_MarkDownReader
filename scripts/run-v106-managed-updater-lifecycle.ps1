param(
    [Parameter(Mandatory = $true)]
    [string]$PreviousInstallerPath,
    [string]$PreviousVersion = "1.0.5",
    [string]$CurrentVersion = "1.0.6",
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{64}$")]
    [string]$ExpectedPreviousInstallerSha256,
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{64}$")]
    [string]$ExpectedCurrentInstallerSha256,
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 262144000)]
    [long]$ExpectedCurrentInstallerSize,
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{64}$")]
    [string]$ExpectedCurrentExecutableSha256,
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{40}$")]
    [string]$ExpectedTaggedCommit,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedReleaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$NodeExecutable,
    [Parameter(Mandatory = $true)]
    [string]$ProbeScript,
    [string]$OutputDirectory = "C:\LongEditManagedUpdaterOutput",
    [switch]$ConfirmDisposableMachine,
    [switch]$AllowInstallerMutation
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmDisposableMachine -or -not $AllowInstallerMutation) {
    throw "Managed updater lifecycle requires both -ConfirmDisposableMachine and -AllowInstallerMutation."
}
if ($env:LONGEDIT_MANAGED_UPDATER_DISPOSABLE -ne "1") {
    throw "Managed updater lifecycle refuses installer mutation outside an explicitly disposable Windows runner."
}
if (-not (Test-Path -LiteralPath $PreviousInstallerPath -PathType Leaf)) {
    throw "Official previous-version installer is missing."
}
if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
    throw "Node executable is missing."
}
if (-not (Test-Path -LiteralPath $ProbeScript -PathType Leaf)) {
    throw "Managed updater CDP probe is missing."
}

function Get-ProductRegistrations {
    return @(Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | Where-Object {
        $_.Publisher -eq "longyuye" -and $_.MainBinaryName -eq "tauri-app.exe"
    })
}

function Wait-ForRegistration([string]$Version, [bool]$Present, [int]$Attempts = 2400) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
        $matches = @(Get-ProductRegistrations | Where-Object { $_.DisplayVersion -eq $Version })
        if (($Present -and $matches.Count -eq 1) -or (-not $Present -and $matches.Count -eq 0)) {
            return $matches
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Timed out waiting for product registration version=$Version present=$Present."
}

function Invoke-Installer([string]$InstallerPath, [string]$InstallRoot) {
    $process = Start-Process -FilePath $InstallerPath `
        -ArgumentList @("/S", "/D=$InstallRoot") `
        -WindowStyle Hidden `
        -Wait `
        -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Installer exited with $($process.ExitCode)."
    }
}

function Invoke-RegisteredUninstall($Registration) {
    $uninstaller = ([string]$Registration.UninstallString).Trim().Trim('"')
    if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
        throw "Registered uninstaller is missing."
    }
    $process = Start-Process -FilePath $uninstaller -ArgumentList "/S" -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Uninstaller exited with $($process.ExitCode)."
    }
}

function Wait-ForPort([int]$Port, [bool]$Listening, [System.Diagnostics.Process]$Process = $null, [int]$Attempts = 1200) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (($Listening -and $connection) -or (-not $Listening -and -not $connection)) {
            return
        }
        if ($Listening -and $null -ne $Process) {
            $Process.Refresh()
            if ($Process.HasExited) {
                throw "Application exited with code $($Process.ExitCode) before CDP port $Port became available."
            }
        }
        Start-Sleep -Milliseconds 100
    }
    throw "Timed out waiting for port $Port listening=$Listening."
}

function Wait-ForProcessExit([System.Diagnostics.Process]$Process, [int]$Attempts = 2400) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
        $Process.Refresh()
        if ($Process.HasExited) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "Timed out waiting for the previous-version application to exit for update installation."
}

function Get-BinaryVersion([string]$Path) {
    return (Get-Item -LiteralPath $Path).VersionInfo.ProductVersion.Trim()
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
            $script:webViewTestPolicyEntries.Add([ordered]@{ key = $argumentsKey; name = $hostId })
        }
        foreach ($hostId in $webViewHostIds | Where-Object { $_ -ne "*" }) {
            if ($null -ne (Get-ItemProperty -LiteralPath $userDataKey -Name $hostId -ErrorAction SilentlyContinue)) {
                throw "Refusing to overwrite an existing WebView2 user-data policy for $hostId."
            }
            New-ItemProperty -LiteralPath $userDataKey -Name $hostId -PropertyType String `
                -Value $UserDataRoot -Force | Out-Null
            $script:webViewTestPolicyEntries.Add([ordered]@{ key = $userDataKey; name = $hostId })
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

$previousInstallerSha256 = (Get-FileHash -LiteralPath $PreviousInstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($previousInstallerSha256 -ne $ExpectedPreviousInstallerSha256.ToLowerInvariant()) {
    throw "Official v$PreviousVersion installer SHA-256 does not match the release policy."
}
if ((Get-AuthenticodeSignature -LiteralPath $PreviousInstallerPath).Status -ne "NotSigned") {
    throw "Managed updater community baseline unexpectedly has an Authenticode signature."
}
if ((Get-ProductRegistrations).Count -ne 0) {
    throw "Managed updater lifecycle requires a disposable runner with no existing LongEdit registration."
}

$installRoot = "C:\LongEditManagedUpdater"
$libraryRoot = "C:\LongEditManagedUpdaterLibrary"
$webViewRoot = "C:\LongEditManagedUpdaterWebView"
$configRoot = Join-Path $env:APPDATA "com.longyuye.mdreader"
$libraryMarker = Join-Path $libraryRoot "managed-updater-library-marker.txt"
$configMarker = Join-Path $configRoot "managed-updater-config-marker.json"
$configPath = Join-Path $configRoot "config.json"
$updateDirectory = Join-Path $env:TEMP "LongEdit\updates"
$expectedInstallerName = "LongEdit_${CurrentVersion}_x64-setup.exe"
$cachedInstaller = Join-Path $updateDirectory $expectedInstallerName
$startedProcess = $null
$checks = New-Object System.Collections.Generic.List[object]

New-Item -ItemType Directory -Path $OutputDirectory, $libraryRoot, $webViewRoot, $configRoot -Force | Out-Null
[IO.File]::WriteAllText($libraryMarker, "MANAGED_UPDATER_LIBRARY_MUST_SURVIVE", [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($configMarker, '{"stage":"V1.0.6-U1","retain":true}', [Text.UTF8Encoding]::new($false))
$config = [ordered]@{
    libraries = @([ordered]@{
        name = "Managed Updater Synthetic Vault"
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
    savedSearches = @()
}
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))

if (Test-Path -LiteralPath $cachedInstaller -PathType Leaf) {
    throw "Disposable runner already contains the target update installer cache."
}

try {
    Invoke-Installer -InstallerPath $PreviousInstallerPath -InstallRoot $installRoot
    $previousRegistration = @(Wait-ForRegistration -Version $PreviousVersion -Present $true)[0]
    $mainBinary = Join-Path $installRoot "tauri-app.exe"
    if (-not (Test-Path -LiteralPath $mainBinary -PathType Leaf) -or (Get-BinaryVersion $mainBinary) -ne $PreviousVersion) {
        throw "Official previous version was not installed into the isolated root."
    }
    $checks.Add([ordered]@{ id = "official-v1.0.5-fresh-install"; status = "passed"; version = $PreviousVersion; installerSha256 = $previousInstallerSha256 })

    $env:LONGEDIT_E2E_LIBRARY = $libraryRoot
    $env:LONGEDIT_E2E_THEME = "white"
    $env:LONGEDIT_E2E_STYLE = "minimal"
    $env:LONGEDIT_E2E_CODE_THEME = "github"
    $env:LONGEDIT_E2E_MOTION = "reduced"
    $env:WEBVIEW2_USER_DATA_FOLDER = $webViewRoot
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9343 --remote-allow-origins=*"
    $env:LONGEDIT_CDP_ENDPOINT = "http://127.0.0.1:9343"
    $env:LONGEDIT_MANAGED_UPDATER_OUTPUT = $OutputDirectory
    $env:LONGEDIT_MANAGED_UPDATER_PREVIOUS_VERSION = $PreviousVersion
    $env:LONGEDIT_MANAGED_UPDATER_CURRENT_VERSION = $CurrentVersion
    $env:LONGEDIT_MANAGED_UPDATER_INSTALLER_NAME = $expectedInstallerName
    $env:LONGEDIT_MANAGED_UPDATER_INSTALLER_SIZE = [string]$ExpectedCurrentInstallerSize
    $env:LONGEDIT_MANAGED_UPDATER_INSTALLER_SHA256 = $ExpectedCurrentInstallerSha256.ToLowerInvariant()
    $env:LONGEDIT_MANAGED_UPDATER_RELEASE_URL = $ExpectedReleaseUrl

    Enable-WebView2TestPolicy -UserDataRoot $webViewRoot
    $startedProcess = Start-Process -FilePath $mainBinary -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
    Wait-ForPort -Port 9343 -Listening $true -Process $startedProcess
    if (Test-Path -LiteralPath $cachedInstaller -PathType Leaf) {
        throw "Updater downloaded an installer before explicit user confirmation."
    }
    $env:LONGEDIT_MANAGED_UPDATER_MODE = "discover-install"
    & $NodeExecutable $ProbeScript
    if ($LASTEXITCODE -ne 0) {
        throw "Managed updater discovery and confirmation probe failed."
    }
    $discovery = Get-Content -LiteralPath (Join-Path $OutputDirectory "managed-updater-discovery-evidence.json") -Raw | ConvertFrom-Json
    if ($discovery.status -ne "passed" -or
        $discovery.release.currentVersion -ne $PreviousVersion -or
        $discovery.release.latestVersion -ne $CurrentVersion -or
        $discovery.release.available -ne $true -or
        $discovery.confirmation.userActionRequired -ne $true -or
        $discovery.confirmation.installerStartedBeforeConfirmation -ne $false -or
        $discovery.confirmation.clicked -ne $true) {
        throw "Managed updater discovery evidence is incomplete."
    }
    $checks.Add([ordered]@{ id = "official-release-discovery"; status = "passed"; from = $PreviousVersion; to = $CurrentVersion; releaseUrl = $ExpectedReleaseUrl })
    $checks.Add([ordered]@{ id = "explicit-user-confirmation"; status = "passed"; installerStartedBeforeConfirmation = $false })

    Wait-ForProcessExit -Process $startedProcess
    $startedProcess = $null
    Wait-ForPort -Port 9343 -Listening $false
    $currentRegistration = @(Wait-ForRegistration -Version $CurrentVersion -Present $true)[0]
    Wait-ForRegistration -Version $PreviousVersion -Present $false | Out-Null
    if ([string]$currentRegistration.InstallLocation -notlike "*$installRoot*") {
        throw "Managed updater changed the isolated installation root."
    }
    $checks.Add([ordered]@{ id = "silent-overwrite-install"; status = "passed"; installRootPreserved = $true })

    if (-not (Test-Path -LiteralPath $cachedInstaller -PathType Leaf)) {
        throw "Verified managed updater installer cache is missing."
    }
    $cachedInstallerInfo = Get-Item -LiteralPath $cachedInstaller
    $cachedInstallerSha256 = (Get-FileHash -LiteralPath $cachedInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($cachedInstallerInfo.Length -ne $ExpectedCurrentInstallerSize -or
        $cachedInstallerSha256 -ne $ExpectedCurrentInstallerSha256.ToLowerInvariant()) {
        throw "Managed updater cache does not match the official v$CurrentVersion release asset."
    }
    $checks.Add([ordered]@{
        id = "downloaded-installer-sha256"
        status = "passed"
        fileName = $cachedInstallerInfo.Name
        sizeBytes = $cachedInstallerInfo.Length
        sha256 = $cachedInstallerSha256
    })

    if (-not (Test-Path -LiteralPath $mainBinary -PathType Leaf) -or (Get-BinaryVersion $mainBinary) -ne $CurrentVersion) {
        throw "Managed updater did not install the expected current application version."
    }
    $installedExecutableSha256 = (Get-FileHash -LiteralPath $mainBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($installedExecutableSha256 -ne $ExpectedCurrentExecutableSha256.ToLowerInvariant()) {
        throw "Installed v$CurrentVersion executable does not match the published artifact manifest."
    }
    $checks.Add([ordered]@{ id = "installed-version-and-binary"; status = "passed"; version = $CurrentVersion; sha256 = $installedExecutableSha256 })

    if (-not (Test-Path -LiteralPath $libraryMarker -PathType Leaf) -or
        -not (Test-Path -LiteralPath $configMarker -PathType Leaf) -or
        -not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        throw "Managed overwrite installation removed synthetic user data."
    }
    $checks.Add([ordered]@{ id = "overwrite-retains-user-data"; status = "passed"; libraryMarker = $true; configMarker = $true })

    $startedProcess = Start-Process -FilePath $mainBinary -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
    Wait-ForPort -Port 9343 -Listening $true -Process $startedProcess
    $env:LONGEDIT_MANAGED_UPDATER_MODE = "post-upgrade"
    & $NodeExecutable $ProbeScript
    if ($LASTEXITCODE -ne 0) {
        throw "Managed updater post-upgrade probe failed."
    }
    $postUpgrade = Get-Content -LiteralPath (Join-Path $OutputDirectory "managed-updater-post-upgrade-evidence.json") -Raw | ConvertFrom-Json
    if ($postUpgrade.status -ne "passed" -or
        $postUpgrade.release.currentVersion -ne $CurrentVersion -or
        $postUpgrade.release.latestVersion -ne $CurrentVersion -or
        $postUpgrade.release.available -ne $false -or
        $postUpgrade.manualCheckVisible -ne $true) {
        throw "Managed updater post-upgrade evidence is incomplete."
    }
    $checks.Add([ordered]@{ id = "first-launch-after-managed-update"; status = "passed"; version = $CurrentVersion })
    $checks.Add([ordered]@{ id = "post-upgrade-reports-current"; status = "passed"; updateAvailable = $false })

    Stop-Process -Id $startedProcess.Id -Force
    $startedProcess = $null
    Wait-ForPort -Port 9343 -Listening $false
    Invoke-RegisteredUninstall -Registration $currentRegistration
    Wait-ForRegistration -Version $CurrentVersion -Present $false | Out-Null
    if ((Get-ProductRegistrations).Count -ne 0) {
        throw "LongEdit registration remained after managed updater lifecycle cleanup."
    }
    $checks.Add([ordered]@{ id = "post-update-uninstall"; status = "passed" })
    if (-not (Test-Path -LiteralPath $libraryMarker -PathType Leaf) -or
        -not (Test-Path -LiteralPath $configMarker -PathType Leaf) -or
        -not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        throw "Post-update uninstall removed synthetic user data."
    }
    $checks.Add([ordered]@{ id = "uninstall-retains-user-data"; status = "passed"; libraryMarker = $true; configMarker = $true })

    $result = [ordered]@{
        schemaVersion = 1
        stage = "V1.0.6-U1"
        capturedAt = (Get-Date).ToUniversalTime().ToString("o")
        environment = "GitHub-hosted disposable Windows official community release update"
        status = "passed"
        previousVersion = $PreviousVersion
        currentVersion = $CurrentVersion
        previousInstallerSha256 = $previousInstallerSha256
        currentInstallerSha256 = $cachedInstallerSha256
        currentInstallerSizeBytes = $cachedInstallerInfo.Length
        installedExecutableSha256 = $installedExecutableSha256
        releaseUrl = $ExpectedReleaseUrl
        taggedCommit = $ExpectedTaggedCommit.ToLowerInvariant()
        checks = [object[]]$checks.ToArray()
        checksPassed = $checks.Count
        checksFailed = 0
        downloadedFromOfficialRelease = $true
        explicitUserConfirmation = $true
        userDataRetainedAfterOverwrite = $true
        userDataRetainedAfterUninstall = $true
        sourceUserContentIncluded = $false
        authenticodeStatus = "NotSigned"
        communityReleaseEvidence = $true
        enterprisePromotionEligible = $false
    }
    [IO.File]::WriteAllText(
        (Join-Path $OutputDirectory "managed-updater-lifecycle-result.json"),
        ($result | ConvertTo-Json -Depth 8),
        [Text.UTF8Encoding]::new($false)
    )
    Write-Host "v1.0.5 -> v1.0.6 managed updater lifecycle passed."
}
finally {
    if ($startedProcess -and -not $startedProcess.HasExited) {
        Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Disable-WebView2TestPolicy
    foreach ($name in @(
        "LONGEDIT_E2E_LIBRARY",
        "LONGEDIT_E2E_THEME",
        "LONGEDIT_E2E_STYLE",
        "LONGEDIT_E2E_CODE_THEME",
        "LONGEDIT_E2E_MOTION",
        "WEBVIEW2_USER_DATA_FOLDER",
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "LONGEDIT_CDP_ENDPOINT",
        "LONGEDIT_MANAGED_UPDATER_OUTPUT",
        "LONGEDIT_MANAGED_UPDATER_PREVIOUS_VERSION",
        "LONGEDIT_MANAGED_UPDATER_CURRENT_VERSION",
        "LONGEDIT_MANAGED_UPDATER_INSTALLER_NAME",
        "LONGEDIT_MANAGED_UPDATER_INSTALLER_SIZE",
        "LONGEDIT_MANAGED_UPDATER_INSTALLER_SHA256",
        "LONGEDIT_MANAGED_UPDATER_RELEASE_URL",
        "LONGEDIT_MANAGED_UPDATER_MODE"
    )) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    foreach ($registration in @(Get-ProductRegistrations)) {
        try { Invoke-RegisteredUninstall -Registration $registration } catch { Write-Warning $_ }
    }
}
