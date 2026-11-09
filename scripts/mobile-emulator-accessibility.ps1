param(
  [Parameter(Mandatory)][string]$Serial,
  [Parameter(Mandatory)][ValidateSet('Enable','Restore')][string]$Mode,
  [Parameter(Mandatory)][string]$StateFile,
  [string]$Adb='E:\Android\Sdk\platform-tools\adb.exe'
)
$ErrorActionPreference='Stop'
$mobileFixtureService='com.longyuye.mdreader.storagefixture/.FixtureAccessibilityService'
$mobileFixtureAvd=((& $Adb -s $Serial emu avd name | Select-Object -First 1) -join '').Trim()
if($mobileFixtureAvd -ne 'LongEdit_Compat_API29' -or ((& $Adb -s $Serial shell getprop ro.build.version.sdk) -join '').Trim() -ne '29') {throw 'Only the dedicated synthetic API 29 AVD is supported'}
function Read-MobileSecure([string]$Name) { return ((& $Adb -s $Serial shell settings get secure $Name) -join '').Trim() }
$mobileCurrentServices=Read-MobileSecure 'enabled_accessibility_services'
if($Mode -eq 'Enable') {
  if(Test-Path -LiteralPath $StateFile) {throw 'Prior settings file exists; restore or inspect it before enabling again'}
  $mobileCurrentEnabled=Read-MobileSecure 'accessibility_enabled'
  if($mobileCurrentServices -ne 'null' -or $mobileCurrentEnabled -notin @('null','0')) {throw 'Existing accessibility settings must be preserved'}
  @{serial=$Serial;avd=$mobileFixtureAvd;services=$mobileCurrentServices;enabled=$mobileCurrentEnabled} | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding utf8
  & $Adb -s $Serial shell settings put secure enabled_accessibility_services $mobileFixtureService
  if($LASTEXITCODE -ne 0) {throw 'Could not enable test service'}
  & $Adb -s $Serial shell settings put secure accessibility_enabled 1
  if($LASTEXITCODE -ne 0) {throw 'Could not enable accessibility on the test emulator'}
  Write-Output 'Test-only service enabled; it keeps WebView accessibility active without inspecting events or enabling touch exploration. Restore after testing.'
} else {
  $mobilePrior=Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  if($mobilePrior.serial -ne $Serial -or $mobilePrior.avd -ne $mobileFixtureAvd -or $mobilePrior.services -ne 'null' -or $mobilePrior.enabled -notin @('null','0')) {throw 'Prior settings do not match this dedicated emulator'}
  if($mobileCurrentServices -ne $mobileFixtureService -and $mobileCurrentServices -ne 'null') {throw 'Accessibility settings changed; do not overwrite them'}
  & $Adb -s $Serial shell settings delete secure enabled_accessibility_services
  if($mobilePrior.enabled -eq 'null') { & $Adb -s $Serial shell settings delete secure accessibility_enabled }
  else { & $Adb -s $Serial shell settings put secure accessibility_enabled $mobilePrior.enabled }
  if((Read-MobileSecure 'enabled_accessibility_services') -ne $mobilePrior.services -or (Read-MobileSecure 'accessibility_enabled') -ne $mobilePrior.enabled) {throw 'Restored settings did not match the recorded state'}
  Write-Output 'Original emulator accessibility settings restored; the test service is disabled.'
}
