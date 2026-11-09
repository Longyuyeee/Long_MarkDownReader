# Shared by the Android build and its packaging regression checks. No device writes.
function Invoke-MobileLoggedCommand {
    param([string]$FilePath, [string[]]$Arguments, [string]$Log)
    $mobileCommand = Get-Command -Name $FilePath -CommandType Application -ErrorAction Stop
    $mobilePreviousPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5 converts redirected native stderr into error
        # records. An informational NDK message must not abort the build before
        # its actual exit code can be checked. Keep diagnostics in the log.
        $ErrorActionPreference = 'Continue'
        $global:LASTEXITCODE = $null
        & $mobileCommand.Source @Arguments *> $Log
        $mobileExitCode = $global:LASTEXITCODE
    } finally { $ErrorActionPreference = $mobilePreviousPreference }
    if ($null -eq $mobileExitCode) { throw "Native command did not return an exit code: $FilePath" }
    return [int]$mobileExitCode
}

function Test-MobileSymlinkCopyFallback {
    param([string]$Output)
    # Cargo can force ANSI color even when stderr is redirected. Match the
    # actual successful profile line without weakening the compiler-success gate.
    $mobilePlainOutput = $Output -replace '\x1B\[[0-?]*[ -/]*[@-~]', ''
    return ($mobilePlainOutput -match 'Creation symbolic link is not allowed' -and
        $mobilePlainOutput -match 'Finished .*profile')
}

function Get-MobileTargetInfo {
    param([ValidateSet('x86_64', 'aarch64')][string]$Target)
    if ($Target -eq 'aarch64') {
        return @{ Abi = 'arm64-v8a'; Flavor = 'Arm64'; Directory = 'arm64'; Rust = 'aarch64-linux-android'; Machine = 183 }
    }
    return @{ Abi = 'x86_64'; Flavor = 'X86_64'; Directory = 'x86_64'; Rust = 'x86_64-linux-android'; Machine = 62 }
}

function Get-MobileApkPath {
    param([string]$BuildDirectory, [ValidateSet('x86_64', 'aarch64')][string]$Target)
    $info = Get-MobileTargetInfo $Target
    $apk = Join-Path $BuildDirectory "outputs/apk/$($info.Directory)/debug/app-$($info.Directory)-debug.apk"
    if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { throw "Missing $Target debug APK: $apk" }
    return (Get-Item -LiteralPath $apk).FullName
}

function Test-MobileApkNativeIdentity {
    param([string]$Apk, [ValidateSet('x86_64', 'aarch64')][string]$Target, [string]$NativeSource)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Add-Type -AssemblyName System.IO.Compression
    $info = Get-MobileTargetInfo $Target
    $zip = [IO.Compression.ZipFile]::OpenRead($Apk)
    try {
        $libraries = @($zip.Entries | Where-Object { $_.FullName -match '^lib/[^/]+/[^/]+\.so$' })
        $abis = @($libraries | ForEach-Object { $_.FullName.Split('/')[1] } | Sort-Object -Unique)
        if ($abis.Count -ne 1 -or $abis[0] -ne $info.Abi) { throw "APK ABI mismatch: expected $($info.Abi), got $($abis -join ',')" }
        $entry = $zip.GetEntry("lib/$($info.Abi)/libtauri_app_lib.so")
        if (-not $entry) { throw 'APK has no application native library.' }
        $stream = $entry.Open()
        try {
            $header = [byte[]]::new(20)
            $count = 0
            while ($count -lt $header.Length) {
                $read = $stream.Read($header, $count, $header.Length - $count)
                if ($read -eq 0) { throw 'Truncated ELF header.' }
                $count += $read
            }
            if ([BitConverter]::ToString($header[0..3]) -ne '7F-45-4C-46' -or $header[4] -ne 2 -or $header[5] -ne 1 -or
                [BitConverter]::ToUInt16($header, 18) -ne $info.Machine) { throw "Native ELF does not match $($info.Abi)." }
        } finally { $stream.Dispose() }
        # Reopen to hash the entire packaged library, including its ELF header.
        $stream = $entry.Open()
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $nativeHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $hasher.Dispose(); $stream.Dispose() }
        if ($NativeSource -and $nativeHash -ne (Get-FileHash -LiteralPath $NativeSource -Algorithm SHA256).Hash.ToLowerInvariant()) {
            throw 'Packaged native library differs from the successful Rust build.'
        }
        return @{ abi = $info.Abi; elfMachine = $info.Machine; nativeSha256 = $nativeHash; nativeBytes = $entry.Length }
    } finally { $zip.Dispose() }
}

function ConvertFrom-MobileApkMetadata {
    param([string]$Badging, [string]$Certificates, [string]$ExpectedId, [string]$ExpectedVersion, [int]$ExpectedMinSdk = 29, [int]$ExpectedVersionCode = 0, [bool]$ExpectedDebuggable = $true)
    if ($Badging -notmatch "package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'") { throw 'Missing APK package metadata.' }
    $id, $code, $version = $Matches[1], [int]$Matches[2], $Matches[3]
    if ($id -ne $ExpectedId -or $version -ne $ExpectedVersion) { throw "Unexpected APK identity/version: $id $version" }
    if ($ExpectedVersionCode -gt 0 -and $code -ne $ExpectedVersionCode) { throw 'Unexpected APK version code.' }
    if ($Badging -notmatch "(?m)^sdkVersion:'(\d+)'" -or [int]$Matches[1] -ne $ExpectedMinSdk) { throw 'Unexpected minimum Android API.' }
    $minSdk = [int]$Matches[1]
    if ($Badging -notmatch "(?m)^targetSdkVersion:'(\d+)'") { throw 'Missing target SDK.' }
    $targetSdk = [int]$Matches[1]
    if (($Badging -match '(?m)^application-debuggable') -ne $ExpectedDebuggable) { throw 'Unexpected APK debuggable status.' }
    $signers = @([regex]::Matches($Certificates, 'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})'))
    if ($signers.Count -ne 1) { throw 'Expected one verified APK signer.' }
    return @{ applicationId = $id; versionName = $version; versionCode = $code; minSdk = $minSdk; targetSdk = $targetSdk; certificateSha256 = $signers[0].Groups[1].Value.ToLowerInvariant() }
}

function Get-MobileApkVerification {
    param([string]$Apk, [ValidateSet('x86_64', 'aarch64')][string]$Target, [string]$NativeSource, [string]$SdkDirectory, [string]$ProjectRoot)
    $native = Test-MobileApkNativeIdentity -Apk $Apk -Target $Target -NativeSource $NativeSource
    $tools = Join-Path $SdkDirectory 'build-tools/36.0.0'
    $badging = (& (Join-Path $tools 'aapt.exe') dump badging $Apk 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'aapt could not inspect the APK.' }
    $certificates = (& (Join-Path $tools 'apksigner.bat') verify --verbose --print-certs $Apk 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
    $android = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src-tauri/tauri.android.conf.json') -Raw | ConvertFrom-Json
    $base = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
    $metadata = ConvertFrom-MobileApkMetadata -Badging $badging -Certificates $certificates -ExpectedId $android.identifier -ExpectedVersion $base.version -ExpectedMinSdk $android.bundle.android.minSdkVersion -ExpectedVersionCode $android.bundle.android.versionCode
    return $native + $metadata
}
