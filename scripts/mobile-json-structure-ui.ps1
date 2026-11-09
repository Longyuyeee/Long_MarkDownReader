param([Parameter(Mandatory)][string]$Serial)
. (Join-Path $PSScriptRoot 'mobile-json-source-ui.ps1') -Serial $Serial
function Save-MobileJsonStructureUi {
    param([ValidatePattern('^[a-z-]+$')][string]$Name)
    $structureEvidence=Join-Path (Get-Location) 'docs/evidence/mobile-0.1.0/json-structure-native-2026-10-24'
    New-Item -ItemType Directory -Force -Path $structureEvidence | Out-Null
    (Get-MobileUi).Save((Join-Path $structureEvidence "$Name.xml"))
    & $mobileTestAdb -s $Serial shell screencap -p /sdcard/longedit-json-structure.png
    & $mobileTestAdb -s $Serial pull /sdcard/longedit-json-structure.png (Join-Path $structureEvidence "$Name.png") | Out-Null
}
function Test-MobileJsonStructureStage {
    param([ValidateSet('before','received','imported','changed','undone','redone','saved','reopened','exported','removed','final')][string]$Stage)
    & node scripts/verify-mobile-json-structure-native.mjs --serial $Serial --output docs/evidence/mobile-0.1.0/json-structure-native-2026-10-24 --stage $Stage
    if ($LASTEXITCODE -ne 0) { throw "JSON structure verification failed: $Stage" }
}
