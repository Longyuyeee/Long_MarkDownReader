param([Parameter(Mandatory)][string]$Serial)
. (Join-Path $PSScriptRoot 'mobile-code-languages-ui.ps1') -Serial $Serial
function Invoke-MobilePdfButton {
 param([Parameter(Mandatory)][string]$Text)
 $pdfArgument="'" + $Text.Replace("'", "'\''") + "'"
 for($pdfAttempt=0;$pdfAttempt -lt 6;$pdfAttempt++) {
  $pdfResponse=(& $mobileTestAdb -s $Serial shell am broadcast -a com.longyuye.mdreader.storagefixture.TEST_CLICK -p com.longyuye.mdreader.storagefixture --es text $pdfArgument) -join "`n"
  if($pdfResponse -match 'result=1\b') {Add-Content -LiteralPath 'docs/evidence/mobile-0.1.0/pdf-reading-native-2026-10-25/named-actions.txt' -Value "$([DateTime]::UtcNow.ToString('o')) Native Button acknowledged: $Text";return}
  if($pdfResponse -notmatch 'result=0\b') {break}
  Start-Sleep -Milliseconds 300
 }
 throw "PDF native button failed: $Text $pdfResponse"
}
function Save-MobilePdfUi {
 param([ValidatePattern('^[a-z-]+$')][string]$Name)
 $pdfEvidence=Join-Path (Get-Location) 'docs/evidence/mobile-0.1.0/pdf-reading-native-2026-10-25'
 (Get-MobileUi).Save((Join-Path $pdfEvidence "$Name.xml"))
 & $mobileTestAdb -s $Serial shell screencap -p /sdcard/longedit-pdf.png
 & $mobileTestAdb -s $Serial pull /sdcard/longedit-pdf.png (Join-Path $pdfEvidence "$Name.png") | Out-Null
}
function Test-MobilePdfStage {
 param([string]$Stage)
 & node scripts/verify-mobile-pdf-reading-native.mjs --serial $Serial --output docs/evidence/mobile-0.1.0/pdf-reading-native-2026-10-25 --stage $Stage
 if($LASTEXITCODE -ne 0) {throw "PDF native verification failed: $Stage"}
}
