param(
    [ValidateSet('x86_64', 'aarch64')][string]$Target = 'x86_64',
    [string]$AndroidRoot = 'E:\Android'
)

$ErrorActionPreference = 'Stop'
$mobileProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'mobile-apk-verification.ps1')
$mobileTargetInfo = Get-MobileTargetInfo $Target
Push-Location $mobileProjectRoot
try {
    . (Join-Path $PSScriptRoot 'enter-mobile-environment.ps1') -AndroidRoot $AndroidRoot
    $mobileOutputDirectory = Join-Path $mobileProjectRoot "release-artifacts\mobile-debug\$Target"
    New-Item -ItemType Directory -Force -Path $mobileOutputDirectory | Out-Null
    $mobileCliLog = Join-Path $mobileOutputDirectory 'tauri-build.log'
    $mobileBuildDirectory = Join-Path $mobileProjectRoot 'src-tauri/gen/android/app/build'
    $mobileCliExitCode = Invoke-MobileLoggedCommand -FilePath npm.cmd -Arguments @('run','tauri','--','android','build','--debug','--apk','--split-per-abi','--target',$Target,'--ci') -Log $mobileCliLog
    $mobileCliOutput = Get-Content -LiteralPath $mobileCliLog -Raw
    if ($mobileCliExitCode -ne 0) {
        # Only recover the known Windows linking limitation, after Cargo succeeded.
        # Compiler failures and other CLI failures must remain build failures.
        if (-not (Test-MobileSymlinkCopyFallback -Output $mobileCliOutput)) {
            throw "Tauri build failed. Read $mobileCliLog"
        }
        $mobileAbi = $mobileTargetInfo.Abi
        $mobileFlavor = $mobileTargetInfo.Flavor
        $mobileRustTarget = $mobileTargetInfo.Rust
        $mobileNativeSource = Join-Path $env:CARGO_TARGET_DIR "$mobileRustTarget\debug\libtauri_app_lib.so"
        if (-not (Test-Path -LiteralPath $mobileNativeSource)) { throw "Missing library: $mobileNativeSource" }
        $mobileJniDirectory = Join-Path $mobileProjectRoot "src-tauri\gen\android\app\src\main\jniLibs\$mobileAbi"
        New-Item -ItemType Directory -Force -Path $mobileJniDirectory | Out-Null
        $mobileNativeCopy = Join-Path $mobileJniDirectory 'libtauri_app_lib.so'
        Copy-Item -LiteralPath $mobileNativeSource -Destination $mobileNativeCopy -Force
        if ((Get-FileHash -LiteralPath $mobileNativeSource).Hash -ne (Get-FileHash -LiteralPath $mobileNativeCopy).Hash) {
            throw 'Copied Android library failed hash verification.'
        }
        Write-Output 'Rust build succeeded. Packaging a verified copy because Windows disallows symlinks.'
        Push-Location (Join-Path $mobileProjectRoot 'src-tauri\gen\android')
        try {
            $mobileGradleLog = Join-Path $mobileOutputDirectory 'gradle-build.log'
            $mobileFlavorDirectory = $mobileTargetInfo.Directory
            $mobileBuildDirectory = $env:LONGEDIT_ANDROID_FALLBACK_BUILD_DIR
            $mobilePreviousApk = Join-Path $mobileBuildDirectory "outputs\apk\$mobileFlavorDirectory\debug\app-$mobileFlavorDirectory-debug.apk"
            # AGP incremental ZIP updates can retain unused bytes from a prior SO.
            # Remove only this generated APK so packaging starts a fresh archive.
            if (Test-Path -LiteralPath $mobilePreviousApk) { Remove-Item -LiteralPath $mobilePreviousApk }
            # jniLibs can live behind a Windows junction on another drive. Do not
            # retain a VFS snapshot that can miss a copied library between ABIs.
            $mobileGradleExitCode = Invoke-MobileLoggedCommand -FilePath ./gradlew.bat -Arguments @(
                ":app:assemble${mobileFlavor}Debug", '-x', ":app:rustBuild${mobileFlavor}Debug",
                "-PlongeditBuildDirectory=$mobileBuildDirectory", '--no-watch-fs', '--console', 'plain'
            ) -Log $mobileGradleLog
            if ($mobileGradleExitCode -ne 0) { throw "Android packaging failed. Read $mobileGradleLog" }
        } finally { Pop-Location }
    }
    $mobileBuiltApk = Get-MobileApkPath -BuildDirectory $mobileBuildDirectory -Target $Target
    $mobileNativeSource = Join-Path $env:CARGO_TARGET_DIR "$($mobileTargetInfo.Rust)\debug\libtauri_app_lib.so"
    $mobileVerification = Get-MobileApkVerification -Apk $mobileBuiltApk -Target $Target -NativeSource $mobileNativeSource -SdkDirectory $env:ANDROID_HOME -ProjectRoot $mobileProjectRoot
    $mobileSavedApk = Join-Path $mobileOutputDirectory (Split-Path -Leaf $mobileBuiltApk)
    Copy-Item -LiteralPath $mobileBuiltApk -Destination $mobileSavedApk -Force
    if ((Get-FileHash -LiteralPath $mobileBuiltApk).Hash -ne (Get-FileHash -LiteralPath $mobileSavedApk).Hash) {
        throw 'Saved APK differs from the verified build output.'
    }
    [ordered]@{
        builtAt = (Get-Date).ToUniversalTime().ToString('o')
        sourceCommit = (& git rev-parse HEAD)
        sourceDirty = [bool](& git status --porcelain)
        target = $Target
        sha256 = (Get-FileHash -LiteralPath $mobileSavedApk -Algorithm SHA256).Hash.ToLowerInvariant()
        bytes = (Get-Item -LiteralPath $mobileSavedApk).Length
        signing = 'Android development debug key; not a release package'
        symlinkCopyFallback = ($mobileCliExitCode -ne 0)
        verification = $mobileVerification
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $mobileOutputDirectory 'build-record.json') -Encoding utf8
    Write-Output "Debug APK: $mobileSavedApk"
} finally { Pop-Location }
