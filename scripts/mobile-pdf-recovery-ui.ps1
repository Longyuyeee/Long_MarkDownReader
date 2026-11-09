param([Parameter(Mandatory)][string]$Serial)
if (((& E:/Android/Sdk/platform-tools/adb.exe -s $Serial emu avd name | Select-Object -First 1) -join '').Trim() -ne 'LongEdit_Compat_API29') {throw 'Owned API29 test AVD required'}
. (Join-Path $PSScriptRoot 'mobile-json-source-ui.ps1') -Serial $Serial
$pdfRecoveryEvidence='docs/evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25'
function Invoke-MobilePdfRecoveryButton {
 param([Parameter(Mandatory)][string]$Text)
 $argument="'"+$Text.Replace("'", "'\''")+"'"
 for($attempt=0;$attempt -lt 6;$attempt++) {
  $response=(& $mobileTestAdb -s $Serial shell am broadcast -a com.longyuye.mdreader.storagefixture.TEST_CLICK -p com.longyuye.mdreader.storagefixture --es text $argument) -join "`n"
  if($response -match 'result=1\b'){Add-Content -LiteralPath "$pdfRecoveryEvidence/named-actions.txt" -Value "$([DateTime]::UtcNow.ToString('o')) Native Button acknowledged: $Text";return}
  if($response -notmatch 'result=0\b'){break};Start-Sleep -Milliseconds 300
 }
 throw "Native PDF recovery Button failed: $Text $response"
}
function Save-MobilePdfRecoveryUi {
 param([ValidatePattern('^[a-z-]+$')][string]$Name)
 (Get-MobileUi).Save((Join-Path (Get-Location) "$pdfRecoveryEvidence/$Name.xml"))
 & $mobileTestAdb -s $Serial shell screencap -p /sdcard/longedit-pdf-recovery.png
 & $mobileTestAdb -s $Serial pull /sdcard/longedit-pdf-recovery.png "$pdfRecoveryEvidence/$Name.png" | Out-Null
}
function Test-MobilePdfRecoveryStage {
 param([string]$Stage)
 & node scripts/verify-mobile-pdf-recovery-native.mjs --serial $Serial --output $pdfRecoveryEvidence --stage $Stage
 if($LASTEXITCODE -ne 0){throw "Native PDF recovery verification failed: $Stage"}
}
