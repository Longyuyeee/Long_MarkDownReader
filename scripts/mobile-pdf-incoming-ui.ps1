param([Parameter(Mandatory)][string]$Serial)
. (Join-Path $PSScriptRoot 'mobile-pdf-navigation-ui.ps1') -Serial $Serial
$pdfNavigationEvidence='docs/evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26'
function Send-MobilePdfFixture([string]$Action,[string]$Delivery='') {
 if($Action -notin @('Open PDF chooser','Share PDF chooser','Open PDF','Share PDF','Clip PDF generic','PDF no grant','PDF multiple','PDF web','PDF broken','PDF oversize','PDF unavailable','Replay PDF')){throw 'Known synthetic PDF payload required'}
 if($Delivery -and $Delivery -notmatch '^[a-f0-9-]{36}$'){throw 'Synthetic delivery ID required'}
 if($Delivery){& $mobileTestAdb -s $Serial shell am start -n com.longyuye.mdreader.storagefixture/.PdfShareFixtureActivity --es delivery-id $Delivery | Out-Null}else{& $mobileTestAdb -s $Serial shell am start -n com.longyuye.mdreader.storagefixture/.PdfShareFixtureActivity | Out-Null}
 Tap-MobileNode -Text $Action -Class android.widget.Button
}
function Test-MobilePdfIncomingStage([string]$Stage,[int]$Pdfs,[int]$Records){& node scripts/verify-mobile-pdf-incoming-native.mjs --serial $Serial --output $pdfNavigationEvidence --stage $Stage --pdfs $Pdfs --records $Records;if($LASTEXITCODE -ne 0){throw "PDF incoming native check failed: $Stage"}}
