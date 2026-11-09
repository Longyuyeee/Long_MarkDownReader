param([Parameter(Mandatory)][string]$Serial)
. "$PSScriptRoot/mobile-emulator-ui.ps1" -Serial $Serial
# Synthetic API29 fixture chooser only; every gesture follows a fresh UI dump.
function Select-MobilePackFixture {
    param([Parameter(Mandatory)][string]$Scenario, [switch]$PickerOpen)
    if ($Scenario -notin @('safe','same','stored','traversal','missing','invalid','wrongtype','txt','offline','crc','bomb','symlink')) { throw 'Unknown synthetic package fixture' }
    if (-not $PickerOpen) { Show-MobilePackControl -Text '选择 TextPack / ZIP 附件包'; Tap-MobileNode -Text '选择 TextPack / ZIP 附件包'; Tap-MobileNode -Description 'Show roots' }
    $label="LongEdit Test pack-import-$Scenario"
    for ($attempt=0; $attempt -lt 7; $attempt++) {
        $ui=Get-MobileUi
        $found=$ui.SelectNodes('//node') | Where-Object { $_.text -eq $label -and $_.bounds -ne '[0,0][0,0]' } | Select-Object -Last 1
        if ($found) {
            Tap-MobileNode -Text $label
            $name=if($Scenario -in @('safe','same')) {'携带.textpack'} elseif($Scenario -eq 'wrongtype') {'Wrong.zip'} else {"pack-import-$Scenario.textpack"}
            Tap-MobileNode -Text $name
            return
        }
        & $mobileTestAdb -s $mobileTestSerial shell input swipe 400 1850 400 650 450
    }
    throw "Fixture root not found: $label"
}
function Show-MobilePackControl {
    param([Parameter(Mandatory)][string]$Text)
    for ($attempt=0; $attempt -lt 6; $attempt++) {
        $ui=Get-MobileUi
        $node = $ui.SelectNodes('//node') | Where-Object { $_.text -eq $Text -and $_.bounds -ne '[0,0][0,0]' } | Select-Object -Last 1
        if ($node) {
            $bounds = [regex]::Matches($node.bounds,'\d+') | ForEach-Object { [int]$_.Value }
            # A clipped button at the screen edge can have a nonzero rectangle
            # without a usable hit target. Scroll until the control is visible.
            if ($bounds[3] - $bounds[1] -ge 90) { return }
        }
        # The readonly source field has its own scroll area up to x=1017 on
        # this fixture device. Use the sheet gutter to scroll the outer panel.
        & $mobileTestAdb -s $mobileTestSerial shell input swipe 1045 1860 1045 800 450
    }
    throw "Package control is not visible: $Text"
}
