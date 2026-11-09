param([Parameter(Mandatory)][string]$Serial)
. (Join-Path $PSScriptRoot 'mobile-json-source-ui.ps1') -Serial $Serial
function Save-MobileCodeLanguagesUi {
 param([ValidatePattern('^[a-z-]+$')][string]$Name)
 $lineEvidence=Join-Path (Get-Location) 'docs/evidence/mobile-0.1.0/code-languages-native-2026-10-25'
 (Get-MobileUi).Save((Join-Path $lineEvidence "$Name.xml"))
 & $mobileTestAdb -s $Serial shell screencap -p /sdcard/longedit-code-languages.png
 & $mobileTestAdb -s $Serial pull /sdcard/longedit-code-languages.png (Join-Path $lineEvidence "$Name.png") | Out-Null
}
function Test-MobileCodeLanguagesStage {
 param([ValidateSet('before','received','imported','located','changed','undone','redone','saved','navigated','exported','reopened','removed','final','vue-received','vue-imported','vue-exported','vue-removed','sql-received','sql-imported','sql-removed','complete')][string]$Stage)
 & node scripts/verify-mobile-code-languages-native.mjs --serial $Serial --output docs/evidence/mobile-0.1.0/code-languages-native-2026-10-25 --stage $Stage
 if ($LASTEXITCODE -ne 0) {throw "Code languages verification failed: $Stage"}
}
function Open-MobileCodeLanguagesReceipt {
 param([ValidateSet('MobileRust.rs','MobileComponent.vue','分享源码.sql')][string]$Name)
 # Start inside the real import-record list. Never use the pending-content
 # banner after restart: it may point at a pre-existing synthetic receipt.
 $lineUi=Get-MobileUi
 $lineButtons=@($lineUi.SelectNodes('//node') | Where-Object {$_.class -eq 'android.widget.Button' -and $_.text.StartsWith($Name + ' ')})
 if ($lineButtons.Count -ne 1) {throw 'Expected exactly this run source receipt'}
 Invoke-MobileCodeLanguagesButton -Text $lineButtons[0].text
 Find-MobileNode -Text $Name | Out-Null
}

function Invoke-MobileCodeLanguagesButton {
 param([Parameter(Mandatory)][ValidateLength(1,256)][string]$Text)
 $lineButtonArgument="'" + $Text.Replace("'", "'\''") + "'"
 for ($lineTry=0; $lineTry -lt 5; $lineTry++) {
  $lineResult=(& $mobileTestAdb -s $Serial shell am broadcast -a com.longyuye.mdreader.storagefixture.TEST_CLICK -p com.longyuye.mdreader.storagefixture --es text $lineButtonArgument) -join "\n"
  if ($LASTEXITCODE -eq 0 -and $lineResult -match 'result=1\b') {
   Add-Content -LiteralPath 'docs/evidence/mobile-0.1.0/code-languages-native-2026-10-25/named-actions.txt' -Value "$([DateTime]::UtcNow.ToString('o')) Named native Button action acknowledged: $Text"
   return
  }
  if ($lineResult -notmatch 'result=0\b') {break}
  Start-Sleep -Milliseconds 200
 }
 throw "Native named button failed: $Text $lineResult"
}

function GoTo-MobileCodeLine {
 param([ValidateRange(1,999999999)][int]$Line)
 $lineGoUi=Get-MobileUi
 if ($lineGoUi.SelectNodes('//node') | Where-Object {$_.text -eq '前往这一行' -and $_.class -eq 'android.widget.Button'}) {Invoke-MobileCodeLanguagesButton -Text '定位行'}
 Invoke-MobileCodeLanguagesButton -Text '定位行'
 Find-MobileNode -Text '前往这一行' | Out-Null
 # The form retains the previous number; clear it through normal key input.
 & $mobileTestAdb -s $Serial shell input keyevent 123 67 67 67 67 67 67 67 67 67
 & $mobileTestAdb -s $Serial shell input text $Line
 Find-MobileNode -Text ([string]$Line) -Class android.widget.EditText | Out-Null
 Invoke-MobileCodeLanguagesButton -Text '前往这一行'
 Hide-MobileJsonKeyboard
 $lineGoUi=Get-MobileUi
 if ($lineGoUi.SelectNodes('//node') | Where-Object {$_.text -eq '前往这一行' -and $_.class -eq 'android.widget.Button'}) {throw 'Line navigation form did not close'}
 Find-MobileNode -Text "第 $Line 行" | Out-Null
}
