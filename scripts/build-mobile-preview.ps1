param([string]$AndroidRoot = 'E:\Android')

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'mobile-apk-verification.ps1')
$previewConfig = 'src-tauri/tauri.android.release.conf.json'
$applicationId = 'com.longyuye.mdreader.mobile'
$profile = Get-MobileTargetInfo 'aarch64'

Push-Location $project
try {
    . (Join-Path $PSScriptRoot 'enter-mobile-environment.ps1') -AndroidRoot $AndroidRoot
    $release = Get-Content -LiteralPath $previewConfig -Raw | ConvertFrom-Json
    $env:VITE_LONGEDIT_ANDROID_PREVIEW_VERSION = $release.version
    $sourceCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or (& git status --porcelain --untracked-files=no)) {
        throw 'Commit the tracked release source before building.'
    }
    $output = Join-Path $project "release-artifacts/android-preview-$($release.version)"
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    $log = Join-Path $output 'tauri-release.log'
    $androidProject = Join-Path $project 'src-tauri/gen/android'
    $buildDir = Join-Path $androidProject 'app/build'
    $relativeApk = 'outputs/apk/arm64/release/app-arm64-release-unsigned.apk'
    $built = Invoke-MobileLoggedCommand -FilePath npm.cmd -Arguments @(
        'run','tauri','--','android','build','--apk','--split-per-abi','--target','aarch64','--ci','--config',$previewConfig
    ) -Log $log
    if ($built -ne 0) {
        if (-not (Test-MobileSymlinkCopyFallback -Output (Get-Content -LiteralPath $log -Raw))) {
            throw "Tauri release build failed. See $log"
        }
        $library = Join-Path $env:CARGO_TARGET_DIR "$($profile.Rust)/release/libtauri_app_lib.so"
        $jni = Join-Path $androidProject "app/src/main/jniLibs/$($profile.Abi)"
        New-Item -ItemType Directory -Force -Path $jni | Out-Null
        $copy = Join-Path $jni 'libtauri_app_lib.so'
        Copy-Item -LiteralPath $library -Destination $copy -Force
        if ((Get-FileHash -LiteralPath $library).Hash -ne (Get-FileHash -LiteralPath $copy).Hash) {
            throw 'Release library copy failed hash verification.'
        }
        $buildDir = Join-Path $env:LONGEDIT_ANDROID_FALLBACK_BUILD_DIR 'preview'
        $staleApk = Join-Path $buildDir $relativeApk
        if (Test-Path -LiteralPath $staleApk -PathType Leaf) { Remove-Item -LiteralPath $staleApk }
        $gradleLog = Join-Path $output 'gradle-release.log'
        Push-Location $androidProject
        try {
            $gradle = Invoke-MobileLoggedCommand -FilePath ./gradlew.bat -Arguments @(
                ':app:assembleArm64Release','-x',':app:rustBuildArm64Release',
                "-PlongeditBuildDirectory=$buildDir",'-Pkotlin.incremental=false','--no-watch-fs','--console','plain'
            ) -Log $gradleLog
        } finally { Pop-Location }
        if ($gradle -ne 0) { throw "Gradle release build failed. See $gradleLog" }
    }

    $apk = (Get-Item -LiteralPath (Join-Path $buildDir $relativeApk)).FullName
    $sdkTools = Join-Path $env:ANDROID_HOME 'build-tools/36.0.0'
    $badging = & (Join-Path $sdkTools 'aapt.exe') dump badging $apk
    $expectedIdentity = "package: name='$applicationId' versionCode='$($release.bundle.android.versionCode)' versionName='$($release.version)'"
    if ($LASTEXITCODE -ne 0 -or -not ($badging | Where-Object { $_.StartsWith($expectedIdentity + ' ') }) -or
        'sdkVersion:''29''' -notin $badging -or ($badging -match '^application-debuggable')) {
        throw 'Unexpected release APK metadata or debuggable package.'
    }
    $native = Test-MobileApkNativeIdentity -Apk $apk -Target 'aarch64'
    $readelf = Join-Path $env:NDK_HOME 'toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-readelf.exe'
    $library = Join-Path $output 'libtauri_app_lib.so'
    $zip = [IO.Compression.ZipFile]::OpenRead($apk)
    try {
        [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry('lib/arm64-v8a/libtauri_app_lib.so'), $library, $true)
    } finally { $zip.Dispose() }
    try {
        $segments = @(& $readelf -lW $library | Where-Object { $_ -match '^\s*LOAD\s' })
        if ($LASTEXITCODE -ne 0 -or !$segments.Count) { throw 'Could not read ELF program headers.' }
        foreach ($segment in $segments) {
            if ($segment -notmatch '\s0x([a-f0-9]+)\s*$' -or [Convert]::ToInt64($Matches[1], 16) -lt 16384) {
                throw 'Packaged ELF is not aligned for 16 KB memory pages.'
            }
        }
    } finally { Remove-Item -LiteralPath $library }
    $aligned = Join-Path $output 'LongEdit-Android-arm64-unsigned.apk'
    & (Join-Path $sdkTools 'zipalign.exe') -P 16 -f 4 $apk $aligned
    if ($LASTEXITCODE -ne 0) { throw 'Could not align release APK.' }
    & (Join-Path $sdkTools 'zipalign.exe') -c -P 16 4 $aligned
    if ($LASTEXITCODE -ne 0) { throw 'Release APK alignment verification failed.' }
    if ((& git rev-parse HEAD).Trim() -ne $sourceCommit -or (& git status --porcelain --untracked-files=no)) {
        throw 'Release source changed during the build.'
    }
    [ordered]@{
        sourceCommit = $sourceCommit
        sourceDirty = $false
        applicationId = $applicationId
        versionName = $release.version
        versionCode = $release.bundle.android.versionCode
        minSdk = 29
        debuggable = $false
        signed = $false
        native = $native
        sha256 = (Get-FileHash -LiteralPath $aligned -Algorithm SHA256).Hash.ToLowerInvariant()
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'unsigned-build.json') -Encoding utf8
    Write-Output "Unsigned ARM64 preview APK: $aligned"
} finally { Pop-Location }
