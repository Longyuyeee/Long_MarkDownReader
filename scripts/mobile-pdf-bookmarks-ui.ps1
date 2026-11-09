param([Parameter(Mandatory)][string]$Serial,[string]$EvidenceDirectory='docs/evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26')
. (Join-Path $PSScriptRoot 'mobile-pdf-navigation-ui.ps1') -Serial $Serial
$pdfNavigationEvidence=$EvidenceDirectory
function Set-MobileBookmarkInput {
    param([Parameter(Mandatory)][string]$Value)
    if($Value.Length -gt 160){throw 'Focused fixture input is limited to 160 UTF-16 units'}
    $encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))
    $response=(& $mobileTestAdb -s $Serial shell am broadcast -a com.longyuye.mdreader.storagefixture.TEST_FOCUSED_INPUT -p com.longyuye.mdreader.storagefixture --es valueBase64 $encoded) -join "`n"
    if($response -notmatch 'result=1\b'){throw "Focused native bookmark input failed: $response"}
    Find-MobileNode -Text $Value -Class android.widget.EditText | Out-Null
}
function Test-MobilePdfBookmarksStage {
    param([Parameter(Mandatory)][string]$Stage)
    & node scripts/verify-mobile-pdf-bookmarks-native.mjs --serial $Serial --output $pdfNavigationEvidence --stage $Stage
    if($LASTEXITCODE -ne 0){throw "Native bookmark verification failed: $Stage"}
}
