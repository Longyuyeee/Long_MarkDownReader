param([Parameter(Mandatory)][string]$Serial,[string]$EvidenceDirectory='docs/evidence/mobile-0.1.0/pdf-password-native-2026-10-26')
. (Join-Path $PSScriptRoot 'mobile-pdf-navigation-ui.ps1') -Serial $Serial
$pdfNavigationEvidence=$EvidenceDirectory
function Test-MobilePdfPasswordStage {
 param([string]$Stage,[string]$Expected='这份 PDF 需要密码')
 & node scripts/verify-mobile-pdf-password-native.mjs --serial $Serial --output $pdfNavigationEvidence --stage $Stage --expect $Expected
 if($LASTEXITCODE -ne 0){throw "Native password verification failed: $Stage"}
}
function Enter-MobilePdfTestPassword {
 param([ValidateSet('correct','wrong')][string]$Kind)
 # Only public synthetic fixture passwords are supported by this development helper.
 Tap-MobileNode -Class android.widget.EditText
 & $mobileTestAdb -s $Serial shell input text $(if($Kind -eq 'correct'){'LongEdit-2026!'}else{'wrong-fixture'})
 Invoke-MobilePdfNavigationButton -Text '打开文档'
}
