param(
    [Parameter(Mandatory)][string]$KeyStore,
    [Parameter(Mandatory)][string]$KeyAlias,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$CertificateSha256,
    [string]$AndroidRoot = 'E:\Android',
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$applicationId = 'com.longyuye.mdreader.mobile'
. (Join-Path $PSScriptRoot 'mobile-apk-verification.ps1')
if (!$env:LONGEDIT_ANDROID_STORE_PASSWORD) { throw 'Provide LONGEDIT_ANDROID_STORE_PASSWORD through the local secret environment.' }
$key = (Get-Item -LiteralPath $KeyStore).FullName
$keyPassword = if ($env:LONGEDIT_ANDROID_KEY_PASSWORD) { 'env:LONGEDIT_ANDROID_KEY_PASSWORD' } else { 'env:LONGEDIT_ANDROID_STORE_PASSWORD' }
$release = Get-Content -LiteralPath (Join-Path $project 'src-tauri/tauri.android.release.conf.json') -Raw | ConvertFrom-Json
$inputDir = Join-Path $project "release-artifacts/android-preview-$($release.version)"
$unsigned = Join-Path $inputDir 'LongEdit-Android-arm64-unsigned.apk'
$record = Get-Content -LiteralPath (Join-Path $inputDir 'unsigned-build.json') -Raw | ConvertFrom-Json
if ($record.applicationId -ne $applicationId -or $record.versionName -ne $release.version -or
    $record.versionCode -ne $release.bundle.android.versionCode -or $record.debuggable -ne $false -or
    $record.signed -ne $false -or $record.sourceDirty -ne $false -or
    $record.sha256 -ne (Get-FileHash -LiteralPath $unsigned).Hash) {
    throw 'Unsigned artifact does not match the clean preview build record.'
}
if (!$OutputDirectory) { $OutputDirectory = Join-Path $inputDir 'signed' }
$out = New-Item -ItemType Directory -Force -Path $OutputDirectory
$name = 'LongEdit-Android-arm64.apk'
$apk = Join-Path $out.FullName $name
$sums = Join-Path $out.FullName 'SHA256SUMS.txt'
if ((Test-Path -LiteralPath $apk) -or (Test-Path -LiteralPath $sums)) { throw 'Choose a fresh signed output directory.' }
$temporary = Join-Path $out.FullName ('.sign-' + [guid]::NewGuid().ToString('N') + '.apk')
$tools = Join-Path $AndroidRoot 'Sdk/build-tools/36.0.0'
$signer = Join-Path $tools 'apksigner.bat'
try {
    & $signer sign --ks $key --ks-key-alias $KeyAlias --ks-pass env:LONGEDIT_ANDROID_STORE_PASSWORD --key-pass $keyPassword --out $temporary $unsigned
    if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
    $certificates = (& $signer verify --verbose --print-certs $temporary) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $certificates -match '(?im)^Signer #\d+ certificate DN:.*\bCN=Android Debug\b') {
        throw 'Release signature verification failed or the certificate is an Android debug certificate.'
    }
    $badging = (& (Join-Path $tools 'aapt.exe') dump badging $temporary) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the signed APK.' }
    $metadata = ConvertFrom-MobileApkMetadata -Badging $badging -Certificates $certificates -ExpectedId $applicationId -ExpectedVersion $release.version -ExpectedVersionCode $release.bundle.android.versionCode -ExpectedDebuggable $false
    if ($metadata.certificateSha256 -ne $CertificateSha256) { throw 'Certificate fingerprint does not match the release key.' }
    $native = Test-MobileApkNativeIdentity -Apk $temporary -Target 'aarch64'
    if ($native.nativeSha256 -ne $record.native.nativeSha256) { throw 'Signed APK native library differs from the verified build.' }
    & (Join-Path $tools 'zipalign.exe') -c -P 16 4 $temporary
    if ($LASTEXITCODE -ne 0) { throw 'Signed APK alignment verification failed.' }
    $hash = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
    Move-Item -LiteralPath $temporary -Destination $apk
    "$hash  $name" | Set-Content -LiteralPath $sums -Encoding ascii
    Write-Output "Signed preview APK: $apk"
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    if (Test-Path -LiteralPath "$temporary.idsig") { Remove-Item -LiteralPath "$temporary.idsig" }
}
