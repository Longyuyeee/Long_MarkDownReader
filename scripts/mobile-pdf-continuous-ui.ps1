param([Parameter(Mandatory)][string]$Serial,[string]$EvidenceDirectory='docs/evidence/mobile-0.1.0/pdf-continuous-native-2026-10-26')
. (Join-Path $PSScriptRoot 'mobile-pdf-gestures-ui.ps1') -Serial $Serial -EvidenceDirectory $EvidenceDirectory
function Test-MobilePdfContinuousStage {
 param([string]$Stage,[string]$Expected='连续阅读')
 & node scripts/verify-mobile-pdf-continuous-native.mjs --serial $Serial --output $pdfNavigationEvidence --stage $Stage --expect $Expected
 if($LASTEXITCODE -ne 0){throw "Native continuous reading verification failed: $Stage"}
}
function Set-MobilePdfReadingMode {
 param([ValidateSet('single','continuous')][string]$Mode,[ValidateSet('逐页','连续')][string]$Current)
 Invoke-MobilePdfNavigationButton -Text "阅读方式，当前$Current"
 Save-MobilePdfNavigationUi -Name mode-chooser
 Tap-MobileNode -Text $(if($Mode -eq 'continuous'){'连续阅读'}else{'逐页阅读'}) -Class android.widget.ToggleButton
 Find-MobileNode -Text $(if($Mode -eq 'continuous'){'阅读方式，当前连续'}else{'阅读方式，当前逐页'}) -Class android.widget.Button | Out-Null
}
