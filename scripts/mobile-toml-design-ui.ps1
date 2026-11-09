param([Parameter(Mandatory)][string]$Serial)
. (Join-Path $PSScriptRoot 'mobile-json-source-ui.ps1') -Serial $Serial
function Invoke-MobileTomlDesignButton {
    param([Parameter(Mandatory)][ValidateLength(1,256)][string]$Text)
    # The inherited helpers verify the dedicated AVD. This shell-only receiver
    # also rejects other hardware, APIs and packages, and stores no UI content.
    $mobileButtonArgument="'" + $Text.Replace("'", "'\''") + "'"
    for ($attempt=0; $attempt -lt 5; $attempt++) {
        $result=(& $mobileTestAdb -s $Serial shell am broadcast -a com.longyuye.mdreader.storagefixture.TEST_CLICK -p com.longyuye.mdreader.storagefixture --es text $mobileButtonArgument) -join "`n"
        if ($LASTEXITCODE -eq 0 -and $result -match 'result=1\b') {
            $actionLog=Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24/named-actions.txt'
            Add-Content -LiteralPath $actionLog -Value "$([DateTime]::UtcNow.ToString('o')) Android named action acknowledged: $Text"
            return
        }
        if ($result -notmatch 'result=0\b') { break }
        Start-Sleep -Milliseconds 200
    }
    throw "Named accessibility action failed: $Text $result"
}
function Save-MobileTomlDesignUi {
    param([ValidatePattern('^[a-z-]+$')][string]$Name)
    $operationsEvidence=Join-Path (Get-Location) 'docs/evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24'
    New-Item -ItemType Directory -Force -Path $operationsEvidence | Out-Null
    (Get-MobileUi).Save((Join-Path $operationsEvidence "$Name.xml"))
    & $mobileTestAdb -s $Serial shell screencap -p /sdcard/longedit-toml-source.png
    & $mobileTestAdb -s $Serial pull /sdcard/longedit-toml-source.png (Join-Path $operationsEvidence "$Name.png") | Out-Null
}
function Test-MobileTomlDesignStage {
    param([ValidateSet('before','received','imported','repaired','undone','redone','saved','mode-switched','exported','reopened','removed','final')][string]$Stage)
    & node scripts/verify-mobile-toml-design-native.mjs --serial $Serial --output docs/evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24 --stage $Stage
    if ($LASTEXITCODE -ne 0) { throw "TOML source verification failed: $Stage" }
}
function Set-MobileTomlDesignMode {
    param([Parameter(Mandatory)][ValidateSet('阅读','源码')][string]$Mode)
    # Android WebView exposes aria-pressed buttons as ToggleButton. The test
    # receiver intentionally accepts only Button; use a fresh native UIA tap.
    $modeLabel=if ($Mode -eq '阅读') { '切换到阅读' } else { '切换到源码编辑' }
    Tap-MobileNode -Text $modeLabel -Class 'android.widget.ToggleButton'
    $modeLog=Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24/named-actions.txt'
    Add-Content -LiteralPath $modeLog -Value "$([DateTime]::UtcNow.ToString('o')) Native ToggleButton tapped from fresh UIA bounds: $modeLabel"
}
