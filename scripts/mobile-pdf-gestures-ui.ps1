param([Parameter(Mandatory)][string]$Serial,[string]$EvidenceDirectory='docs/evidence/mobile-0.1.0/pdf-gestures-native-2026-10-26')
. (Join-Path $PSScriptRoot 'mobile-pdf-navigation-ui.ps1') -Serial $Serial
$pdfNavigationEvidence=$EvidenceDirectory
function Invoke-MobilePdfPinch {
 param([int]$CenterX,[int]$CenterY,[int]$StartSpan,[int]$EndSpan)
 if($Serial -ne 'emulator-5558' -or ((& $mobileTestAdb -s $Serial shell getprop ro.build.version.sdk) -join '').Trim() -ne '29'){throw 'Dedicated API29 gesture AVD required'}
 $response=(& $mobileTestAdb -s $Serial shell am broadcast -a com.longyuye.mdreader.storagefixture.TEST_PDF_PINCH -p com.longyuye.mdreader.storagefixture --ei cx $CenterX --ei cy $CenterY --ei startSpan $StartSpan --ei endSpan $EndSpan) -join "`n"
 Add-Content -LiteralPath "$pdfNavigationEvidence/gestures.txt" -Value "$([DateTime]::UtcNow.ToString('o')) center=($CenterX,$CenterY) span=$StartSpan->$EndSpan $response"
 if($response -notmatch 'result=1\b'){throw "Native two-pointer PDF gesture failed: $response"}
}
function Test-MobilePdfGestureStage {
 param([string]$Stage,[string]$Expected='双指缩放')
 & node scripts/verify-mobile-pdf-gestures-native.mjs --serial $Serial --output $pdfNavigationEvidence --stage $Stage --expect $Expected
 if($LASTEXITCODE -ne 0){throw "Native PDF gesture verification failed: $Stage"}
}
