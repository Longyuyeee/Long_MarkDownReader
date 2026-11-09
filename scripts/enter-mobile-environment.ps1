param(
    [string]$AndroidRoot = 'E:\Android',
    [string]$NdkVersion = '27.2.12479018'
)

$mobileSdkDirectory = Join-Path $AndroidRoot 'Sdk'
$mobileNdkDirectory = Join-Path $mobileSdkDirectory "ndk\$NdkVersion"
foreach ($mobileRequiredPath in @(
    (Join-Path $mobileSdkDirectory 'platform-tools\adb.exe'),
    (Join-Path $mobileSdkDirectory 'platforms\android-36\android.jar'),
    (Join-Path $mobileNdkDirectory 'source.properties')
)) {
    if (-not (Test-Path -LiteralPath $mobileRequiredPath)) { throw "Missing Android component: $mobileRequiredPath" }
}
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
    throw 'Set JAVA_HOME to a JDK compatible with the generated Gradle project.'
}

# Process-local settings only; no persistent user or machine environment changes.
$env:ANDROID_HOME = $mobileSdkDirectory
$env:NDK_HOME = $mobileNdkDirectory
$env:CARGO_TARGET_DIR = Join-Path $AndroidRoot 'BuildCache\longedit-mobile-cargo'
$env:GRADLE_USER_HOME = Join-Path $AndroidRoot 'GradleCache'
$env:CARGO_BUILD_JOBS = '4'
# Keep temporary files and the Windows copy-packaging fallback off the system disk.
# Include the checkout path so independently advancing worktrees do not share outputs.
$mobilePathHasher = [Security.Cryptography.SHA256]::Create()
try { $mobilePathHash = [BitConverter]::ToString($mobilePathHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes((Split-Path -Parent $PSScriptRoot).ToLowerInvariant()))).Replace('-', '').Substring(0, 12).ToLowerInvariant() }
finally { $mobilePathHasher.Dispose() }
$env:LONGEDIT_ANDROID_FALLBACK_BUILD_DIR = Join-Path $AndroidRoot "BuildCache\longedit-gradle-$mobilePathHash\app"
$env:TEMP = Join-Path $AndroidRoot 'BuildCache\temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
Write-Output "Android SDK: $mobileSdkDirectory; NDK: $NdkVersion"
