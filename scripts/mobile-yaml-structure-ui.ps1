param([Parameter(Mandatory)][string]$Serial)
. (Join-Path $PSScriptRoot 'mobile-json-source-ui.ps1') -Serial $Serial
function Invoke-MobileYamlStructureButton {
    param([Parameter(Mandatory)][ValidateLength(1,256)][string]$Text)
    # The inherited helpers verify the dedicated AVD. This shell-only receiver
    # also rejects other hardware, APIs and packages, and stores no UI content.
    $mobileButtonArgument="'" + $Text.Replace("'", "'\''") + "'"
    for ($attempt=0; $attempt -lt 5; $attempt++) {
        $result=(& $mobileTestAdb -s $Serial shell am broadcast -a com.longyuye.mdreader.storagefixture.TEST_CLICK -p com.longyuye.mdreader.storagefixture --es text $mobileButtonArgument) -join "`n"
        if ($LASTEXITCODE -eq 0 -and $result -match 'result=1\b') {
            $actionLog=Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/evidence/mobile-0.1.0/yaml-structure-native-2026-10-24/named-actions.txt'
            Add-Content -LiteralPath $actionLog -Value "$([DateTime]::UtcNow.ToString('o')) Android named action acknowledged: $Text"
            return
        }
        if ($result -notmatch 'result=0\b') { break }
        Start-Sleep -Milliseconds 200
    }
    throw "Named accessibility action failed: $Text $result"
}
function Save-MobileYamlStructureUi {
    param([ValidatePattern('^[a-z-]+$')][string]$Name)
    $operationsEvidence=Join-Path (Get-Location) 'docs/evidence/mobile-0.1.0/yaml-structure-native-2026-10-24'
    New-Item -ItemType Directory -Force -Path $operationsEvidence | Out-Null
    (Get-MobileUi).Save((Join-Path $operationsEvidence "$Name.xml"))
    & $mobileTestAdb -s $Serial shell screencap -p /sdcard/longedit-yaml-structure.png
    & $mobileTestAdb -s $Serial pull /sdcard/longedit-yaml-structure.png (Join-Path $operationsEvidence "$Name.png") | Out-Null
}
function Test-MobileYamlStructureStage {
    param([ValidateSet('before','received','imported','previewed','changed','undone','redone','saved','navigated','exported','reopened','removed','final')][string]$Stage)
    & node scripts/verify-mobile-yaml-structure-native.mjs --serial $Serial --output docs/evidence/mobile-0.1.0/yaml-structure-native-2026-10-24 --stage $Stage
    if ($LASTEXITCODE -ne 0) { throw "YAML source verification failed: $Stage" }
}

function Invoke-MobileYamlStructureField {
    param([Parameter(Mandatory)][string]$Label)
    $field=(Get-MobileUi).SelectNodes('//node') | Where-Object { $_.class -eq 'android.widget.Button' -and $_.text.StartsWith($Label + ' ') } | Select-Object -First 1
    if (-not $field) { throw "Missing YAML field: $Label" }
    Invoke-MobileYamlStructureButton -Text $field.text
}
