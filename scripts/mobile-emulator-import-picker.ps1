param([Parameter(Mandatory)][string]$Serial)
# Test helper for the owned 1080px API 29 AVD and synthetic provider only.
$mobileImportAdb='E:/Android/Sdk/platform-tools/adb.exe'
if(((& $mobileImportAdb -s $Serial emu avd name | Select-Object -First 1) -join '').Trim() -ne 'LongEdit_Compat_API29' -or ((& $mobileImportAdb -s $Serial shell getprop ro.build.version.sdk) -join '').Trim() -ne '29') { throw 'Dedicated API 29 AVD required' }
. (Join-Path $PSScriptRoot 'mobile-emulator-ui.ps1') -Serial $Serial
function Select-MobileImportFixture([string]$Scenario,[string]$FileName) {
  if($Scenario -notin @('safe','same','txt','invalid','large','offline','wrongtype')) { throw 'Synthetic import scenario required' }
  Tap-MobileNode -Text '选择文件'
  Tap-MobileNode -Description 'Show roots'
  $mobileRootSelected=$false
  for($mobileRootAttempt=0;$mobileRootAttempt -lt 6;$mobileRootAttempt++) {
    $mobileRootUi=Get-MobileUi
    $mobileRootNode=$mobileRootUi.SelectNodes('//node') | Where-Object { $_.text -eq "LongEdit Test import-$Scenario" -and $_.bounds -match '^\[176,\d+\]\[748,\d+\]$' } | Select-Object -Last 1
    if($mobileRootNode) {
      $mobileRootBounds=[regex]::Matches($mobileRootNode.bounds,'\d+') | ForEach-Object { [int]$_.Value }
      & $mobileImportAdb -s $Serial shell input tap 450 ([int](($mobileRootBounds[1]+$mobileRootBounds[3])/2))
      $mobileRootSelected=$true;break
    }
    & $mobileImportAdb -s $Serial shell input swipe 500 1900 500 850 500
  }
  if(-not $mobileRootSelected) {throw 'Expected synthetic provider root missing'}
  Tap-MobileNode -Text $FileName
}
