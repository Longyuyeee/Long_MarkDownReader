param([Parameter(Mandatory)][string]$Serial)
. (Join-Path $PSScriptRoot 'mobile-external-packs-ui.ps1') -Serial $Serial
function Send-MobileJsonFixture {
    param([ValidateSet('Share JSON chooser','Open JSON file','Share unfinished JSON','Share JSON text')][string]$Action)
    & $mobileTestAdb -s $Serial shell am start -n com.longyuye.mdreader.storagefixture/.JsonFixtureActivity | Out-Null
    Tap-MobileNode -Text $Action -Class 'android.widget.Button'
}
function Wait-MobileJsonReview {
    for ($attempt=0; $attempt -lt 6; $attempt++) {
        $ui=Get-MobileUi
        $ready=$ui.SelectNodes('//node') | Where-Object { $_.text -eq '返回记录' -and $_.enabled -eq 'true' -and $_.bounds -ne '[0,0][0,0]' }
        $close=$ui.SelectNodes('//node') | Where-Object { $_.text -eq '关闭面板' -and $_.enabled -eq 'true' -and $_.bounds -ne '[0,0][0,0]' }
        if ($ready -and $close) { return }
    }
    throw 'JSON source review did not finish acknowledgement'
}
function Save-MobileJsonUi {
    param([ValidatePattern('^[a-z-]+$')][string]$Name)
    $output=Join-Path (Get-Location) 'docs/evidence/mobile-0.1.0/json-source-native-2026-10-24'
    (Get-MobileUi).Save((Join-Path $output "$Name.xml"))
    & $mobileTestAdb -s $Serial shell screencap -p /sdcard/longedit-json-source.png
    & $mobileTestAdb -s $Serial pull /sdcard/longedit-json-source.png (Join-Path $output "$Name.png") | Out-Null
}
function Hide-MobileJsonKeyboard {
    $state=(& $mobileTestAdb -s $Serial shell dumpsys input_method) -join "`n"
    if ($state -match 'mInputShown=true') { & $mobileTestAdb -s $Serial shell input keyevent 4 }
}
function Remove-MobileJsonReview {
    Show-MobilePackControl -Text '移除此条导入记录'
    Tap-MobileNode -Text '移除此条导入记录'
    Show-MobilePackControl -Text '确认移除记录'
    Tap-MobileNode -Text '确认移除记录'
    Find-MobileNode -Text '已移除导入记录，源文件和已存入的笔记继续保留。' | Out-Null
}
