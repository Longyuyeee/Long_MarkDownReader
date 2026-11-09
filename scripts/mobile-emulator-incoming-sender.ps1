param([Parameter(Mandatory)][string]$Serial)
$mobileIncomingAdb='E:/Android/Sdk/platform-tools/adb.exe'
if(((& $mobileIncomingAdb -s $Serial emu avd name | Select-Object -First 1) -join '').Trim() -ne 'LongEdit_Compat_API29' -or ((& $mobileIncomingAdb -s $Serial shell getprop ro.build.version.sdk) -join '').Trim() -ne '29') {throw 'Dedicated synthetic API 29 AVD required'}
. (Join-Path $PSScriptRoot 'mobile-emulator-ui.ps1') -Serial $Serial
function Send-MobileIncomingFixture([string]$Action) {
  if($Action -notin @('Open fresh','Open Markdown','Share Markdown','Share Text','Clip URI','Broken UTF8','Oversize','Offline','Wrong extension','No grant','Multiple','Web URI','Replay delivery')) {throw 'Known synthetic payload required'}
  # Re-enter this sender even when its fixture task currently has the PDF or
  # package sender on top. A plain NEW_TASK launch can reveal that other page.
  & $mobileIncomingAdb -s $Serial shell am start -n com.longyuye.mdreader.storagefixture/.ShareFixtureActivity --activity-clear-top | Out-Null
  $mobileActionFound=$false
  for($mobileActionAttempt=0;$mobileActionAttempt -lt 6;$mobileActionAttempt++) {
    $mobileActionUi=Get-MobileUi
    $mobileActionNode=$mobileActionUi.SelectNodes('//node') | Where-Object { $_.text -eq $Action -and $_.class -eq 'android.widget.Button' -and $_.bounds -ne '[0,0][0,0]' } | Select-Object -Last 1
    if($mobileActionNode) {
      $mobileActionBounds=[regex]::Matches($mobileActionNode.bounds,'\d+') | ForEach-Object {[int]$_.Value}
      if($mobileActionBounds[3]-$mobileActionBounds[1] -gt 60) {
        & $mobileIncomingAdb -s $Serial shell input tap ([int](($mobileActionBounds[0]+$mobileActionBounds[2])/2)) ([int](($mobileActionBounds[1]+$mobileActionBounds[3])/2))
        $mobileActionFound=$true;break
      }
    }
    & $mobileIncomingAdb -s $Serial shell input swipe 1000 1900 1000 800 450
  }
  if(-not $mobileActionFound) {throw 'Sender action missing'}
}
