param([Parameter(Mandatory)][string]$Serial)
$mobilePackIncomingAdb = 'E:/Android/Sdk/platform-tools/adb.exe'
if (((& $mobilePackIncomingAdb -s $Serial emu avd name | Select-Object -First 1) -join '').Trim() -ne 'LongEdit_Compat_API29') { throw 'Dedicated synthetic API29 AVD required' }
. (Join-Path $PSScriptRoot 'mobile-emulator-ui.ps1') -Serial $Serial
function Send-MobilePackIncomingFixture {
    param([Parameter(Mandatory)][string]$Action, [string]$DeliveryId)
    if ($Action -notin @('Open pack chooser','Share pack chooser','Open pack','Share pack','Octet pack','Clip pack','Same pack','Wrong ZIP','Broken pack','Offline pack','No pack grant','Multiple packs','No pack file','Replay pack')) { throw 'Known synthetic delivery required' }
    $arguments = @('-s',$Serial,'shell','am','start','-n','com.longyuye.mdreader.storagefixture/.PackShareFixtureActivity')
    if ($DeliveryId) { if ($DeliveryId -notmatch '^[a-f0-9-]{36}$') { throw 'Owned delivery ID required' }; $arguments += @('--es','delivery-id',$DeliveryId) }
    & $mobilePackIncomingAdb @arguments | Out-Null
    for ($attempt=0; $attempt -lt 7; $attempt++) {
        $ui=Get-MobileUi
        $node=$ui.SelectNodes('//node') | Where-Object { $_.text -eq $Action -and $_.class -eq 'android.widget.Button' -and $_.bounds -ne '[0,0][0,0]' } | Select-Object -Last 1
        if ($node) {
            $bounds=[regex]::Matches($node.bounds,'\d+') | ForEach-Object { [int]$_.Value }
            if ($bounds[3]-$bounds[1] -gt 60) { Tap-MobileNode -Text $Action -Class 'android.widget.Button'; return }
        }
        & $mobilePackIncomingAdb -s $Serial shell input swipe 1000 1850 1000 750 450
    }
    throw 'Synthetic package sender action missing'
}
function Wait-MobilePackReview {
    for ($attempt=0; $attempt -lt 6; $attempt++) {
        $ui=Get-MobileUi
        $ready=$ui.SelectNodes('//node') | Where-Object { $_.text -eq '返回导入记录' -and $_.enabled -eq 'true' -and $_.bounds -ne '[0,0][0,0]' }
        $close=$ui.SelectNodes('//node') | Where-Object { $_.text -eq '关闭面板' -and $_.enabled -eq 'true' -and $_.bounds -ne '[0,0][0,0]' }
        if ($ready -and $close) { return }
    }
    throw 'Package review did not finish acknowledgement'
}
