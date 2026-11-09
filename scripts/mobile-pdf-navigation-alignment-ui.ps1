param([Parameter(Mandatory)][string]$Serial,[string]$EvidenceDirectory='docs/evidence/mobile-0.1.0/pdf-navigation-alignment-native-2026-10-26')
. (Join-Path $PSScriptRoot 'mobile-pdf-navigation-ui.ps1') -Serial $Serial
$pdfNavigationEvidence=$EvidenceDirectory
function Test-MobilePdfNavigationAlignmentStage {
    param([Parameter(Mandatory)][string]$Stage)
    & node scripts/verify-mobile-pdf-navigation-alignment-native.mjs --serial $Serial --output $pdfNavigationEvidence --stage $Stage
    if ($LASTEXITCODE -ne 0) {throw "Native visual alignment verification failed: $Stage"}
}
