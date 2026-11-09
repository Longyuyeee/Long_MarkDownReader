param([Parameter(Mandatory)][string]$Serial)
. (Join-Path $PSScriptRoot 'mobile-pack-incoming-ui.ps1') -Serial $Serial
. (Join-Path $PSScriptRoot 'mobile-pack-import-ui.ps1') -Serial $Serial

function Close-MobileExternalPackPanel {
    # The whole sheet scrolls. UIAutomator can report an inverted rectangle
    # for a header above the viewport; obtain a usable rectangle before tapping.
    for ($attempt=0; $attempt -lt 6; $attempt++) {
        $ui=Get-MobileUi
        $node=$ui.SelectNodes('//node') | Where-Object { $_.text -eq '关闭面板' } | Select-Object -Last 1
        if ($node) {
            $bounds=[regex]::Matches($node.bounds,'\d+') | ForEach-Object { [int]$_.Value }
            if ($bounds.Count -eq 4 -and $bounds[3]-$bounds[1] -ge 90) { Tap-MobileNode -Text '关闭面板'; return }
        }
        & $mobileTestAdb -s $Serial shell input swipe 1045 800 1045 1860 450
    }
    throw 'Package panel header is not visible'
}

function Send-MobileExternalPackFixture {
    param([Parameter(Mandatory)][ValidateSet('Share public ZIP','Share FSNotes ZIP','Open public ZIP','Share ordinary ZIP','Share multiple ZIP','Share missing ZIP')][string]$Action)
    & $mobileTestAdb -s $Serial shell am start -n com.longyuye.mdreader.storagefixture/.ExternalPackFixtureActivity | Out-Null
    Tap-MobileNode -Text $Action -Class 'android.widget.Button'
}

function Remove-MobileExternalPackReview {
    Show-MobilePackControl -Text '移除这份导入记录'
    Tap-MobileNode -Text '移除这份导入记录'
    Show-MobilePackControl -Text '确认移除导入记录'
    Tap-MobileNode -Text '确认移除导入记录'
    Find-MobileNode -Text '导入记录已移除，源文件和已存入的笔记、附件仍保留。' | Out-Null
}
