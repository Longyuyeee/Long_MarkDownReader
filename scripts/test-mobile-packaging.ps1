param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'mobile-apk-verification.ps1')
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) "release-artifacts/mobile-packaging-tests/$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$checks = [Collections.Generic.List[string]]::new()
$mobileStdErrLog = Join-Path $OutputDirectory 'native-stderr.log'
$mobileExit = Invoke-MobileLoggedCommand -FilePath powershell.exe -Arguments @('-NoProfile','-Command',"[Console]::Error.WriteLine('NDK informational stderr'); exit 0") -Log $mobileStdErrLog
if ($mobileExit -ne 0 -or (Get-Content -LiteralPath $mobileStdErrLog -Raw) -notmatch 'NDK informational stderr') { throw 'Successful native stderr was lost or treated as a build failure.' }
if ($ErrorActionPreference -ne 'Stop') { throw 'Native logging changed caller error handling.' }
$checks.Add('native informational stderr is logged without aborting a successful command')
$mobileFailureLog = Join-Path $OutputDirectory 'native-failure.log'
$mobileExit = Invoke-MobileLoggedCommand -FilePath powershell.exe -Arguments @('-NoProfile','-Command',"[Console]::Error.WriteLine('compiler failure'); exit 23") -Log $mobileFailureLog
if ($mobileExit -ne 23 -or (Get-Content -LiteralPath $mobileFailureLog -Raw) -notmatch 'compiler failure') { throw 'Native failure exit code or diagnostics were lost.' }
$checks.Add('native failure keeps its actual nonzero exit code and diagnostics')
$mobileColorFinished = "$([char]27)[1m$([char]27)[92m    Finished$([char]27)[0m ``dev`` profile [unoptimized]"
if (-not (Test-MobileSymlinkCopyFallback "$mobileColorFinished`nCreation symbolic link is not allowed for this system.")) { throw 'Colored successful Cargo output prevented the known copy fallback.' }
$checks.Add('ANSI Cargo success permits only the known symbolic-link copy fallback')
if (Test-MobileSymlinkCopyFallback 'error: could not compile; Creation symbolic link is not allowed') { throw 'A failed compiler cannot enter the packaging fallback.' }
$checks.Add('compiler failure without successful Rust profile never permits copy fallback')
if (Test-MobileSymlinkCopyFallback "$mobileColorFinished`nGradle compilation failed") { throw 'Other packaging failures cannot enter the symbolic-link fallback.' }
$checks.Add('other packaging failures never permit symbolic-link fallback')
function Assert-Rejected {
    param([scriptblock]$Action, [string]$Pattern, [string]$Name)
    $rejected = $false
    try { & $Action | Out-Null } catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw }
        $rejected = $true
    }
    if (-not $rejected) { throw "Expected rejection: $Name" }
    $checks.Add($Name)
}
function New-TestApk {
    param([string]$Path, [string]$Abi, [int]$Machine, [switch]$ForeignAbi, [switch]$MissingApp, [switch]$Truncated)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $zip = [IO.Compression.ZipFile]::Open($Path, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $header = [byte[]]::new(24)
        $header[0], $header[1], $header[2], $header[3], $header[4], $header[5] = 0x7f, 0x45, 0x4c, 0x46, 2, 1
        $header[18] = $Machine
        $name = if ($MissingApp) { 'libother.so' } else { 'libtauri_app_lib.so' }
        $stream = $zip.CreateEntry("lib/$Abi/$name").Open()
        try { $stream.Write($header, 0, $(if ($Truncated) { 8 } else { $header.Length })) } finally { $stream.Dispose() }
        if ($ForeignAbi) { $zip.CreateEntry('lib/armeabi-v7a/libother.so') | Out-Null }
    } finally { $zip.Dispose() }
}
$oldApk = Join-Path $OutputDirectory 'outputs/apk/x86_64/debug/app-x86_64-debug.apk'
$newApk = Join-Path $OutputDirectory 'outputs/apk/arm64/debug/app-arm64-debug.apk'
New-TestApk $oldApk x86_64 62
New-TestApk $newApk arm64-v8a 183
(Get-Item -LiteralPath $oldApk).LastWriteTimeUtc = [DateTime]::UtcNow.AddDays(-1)
(Get-Item -LiteralPath $newApk).LastWriteTimeUtc = [DateTime]::UtcNow
if ((Get-MobileApkPath $OutputDirectory x86_64) -ne (Get-Item $oldApk).FullName) { throw 'Selected the newer foreign architecture.' }
$checks.Add('select requested APK even when the other ABI is newer')
$empty = Join-Path $OutputDirectory 'empty'
New-Item -ItemType Directory -Path $empty | Out-Null
Assert-Rejected { Get-MobileApkPath $empty aarch64 } 'Missing aarch64' 'missing requested target never falls back to another APK'
foreach ($case in @(@{ Path = $oldApk; Target = 'x86_64'; Machine = 62 }, @{ Path = $newApk; Target = 'aarch64'; Machine = 183 })) {
    $result = Test-MobileApkNativeIdentity $case.Path $case.Target
    if ($result.elfMachine -ne $case.Machine) { throw 'Wrong machine.' }
    $checks.Add("accept actual $($case.Target) ELF")
}
Assert-Rejected { Test-MobileApkNativeIdentity $newApk x86_64 } 'ABI mismatch' 'wrong ABI rejected'
$wrongElf = Join-Path $OutputDirectory 'wrong-elf.apk'
New-TestApk $wrongElf arm64-v8a 62
Assert-Rejected { Test-MobileApkNativeIdentity $wrongElf aarch64 } 'ELF' 'directory label cannot disguise wrong ELF'
$mixed = Join-Path $OutputDirectory 'mixed.apk'
New-TestApk $mixed arm64-v8a 183 -ForeignAbi
Assert-Rejected { Test-MobileApkNativeIdentity $mixed aarch64 } 'ABI mismatch' 'unexpected second ABI rejected'
$missing = Join-Path $OutputDirectory 'missing-app.apk'
New-TestApk $missing arm64-v8a 183 -MissingApp
Assert-Rejected { Test-MobileApkNativeIdentity $missing aarch64 } 'no application' 'missing application library rejected'
$short = Join-Path $OutputDirectory 'short.apk'
New-TestApk $short arm64-v8a 183 -Truncated
Assert-Rejected { Test-MobileApkNativeIdentity $short aarch64 } 'Truncated' 'truncated native library rejected'
$source = Join-Path $OutputDirectory 'different.so'
[IO.File]::WriteAllBytes($source, [byte[]](1, 2, 3))
Assert-Rejected { Test-MobileApkNativeIdentity $newApk aarch64 -NativeSource $source } 'differs' 'stale packaged library rejected'
$badging = "package: name='test.mobile.dev' versionCode='1002011' versionName='1.2.11'`nsdkVersion:'29'`ntargetSdkVersion:'36'`napplication-debuggable"
$cert = 'Signer #1 certificate SHA-256 digest: ' + ('a' * 64)
$metadata = ConvertFrom-MobileApkMetadata $badging $cert test.mobile.dev 1.2.11
if ($metadata.versionCode -ne 1002011 -or $metadata.minSdk -ne 29) { throw 'Metadata parsing failed.' }
$checks.Add('verified identity, version, API and certificate recorded')
Assert-Rejected { ConvertFrom-MobileApkMetadata $badging $cert test.mobile.dev 1.2.11 -ExpectedVersionCode 1002012 } 'version code' 'stale Android upgrade code rejected'
Assert-Rejected { ConvertFrom-MobileApkMetadata $badging $cert another.app 1.2.11 } 'identity/version' 'foreign application identity rejected'
Assert-Rejected { ConvertFrom-MobileApkMetadata $badging $cert test.mobile.dev 1.2.12 } 'identity/version' 'stale version rejected'
Assert-Rejected { ConvertFrom-MobileApkMetadata ($badging.Replace("sdkVersion:'29'", "sdkVersion:'30'")) $cert test.mobile.dev 1.2.11 } 'minimum' 'raised minimum API rejected'
Assert-Rejected { ConvertFrom-MobileApkMetadata $badging '' test.mobile.dev 1.2.11 } 'signer' 'unverified signer metadata rejected'
Assert-Rejected { ConvertFrom-MobileApkMetadata ($badging.Replace('application-debuggable', '')) $cert test.mobile.dev 1.2.11 } 'debug' 'release package cannot be labelled debug'
[ordered]@{ kind = 'android-packaging-regression'; checkedAt = [DateTime]::UtcNow.ToString('o'); passed = $true; count = $checks.Count; checks = @($checks.ToArray()) } | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $OutputDirectory 'verification.json') -Encoding utf8
Write-Output "$($checks.Count) packaging checks passed. Evidence: $OutputDirectory"
