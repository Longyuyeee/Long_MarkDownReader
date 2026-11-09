param([Parameter(Mandatory)][string]$Serial, [string]$Adb='E:\Android\Sdk\platform-tools\adb.exe',
  [ValidateSet('/dev/input/event1','/dev/input/event12')][string]$KeyboardDevice='/dev/input/event1',
  [switch]$ScopedSu,
  [string]$HelperDirectory)
$mobileTalkBackSerial=$Serial; $mobileTalkBackAdb=$Adb
$mobileTalkBackKeyboard=$KeyboardDevice
if ((& $Adb -s $Serial emu avd name | Select-Object -First 1).Trim() -notin @('LongEdit_A11y_API35','LongEdit_A11y_Fresh_API35','LongEdit_Compat_API29')) { throw 'Expected a dedicated LongEdit test AVD' }
$mobileTalkBackRootPrefix=@()
if ((& $Adb -s $Serial shell id -u).Trim() -ne '0') {
  if (-not $ScopedSu -or ((& $Adb -s $Serial emu avd name | Select-Object -First 1).Trim() -ne 'LongEdit_Compat_API29') -or ((& $Adb -s $Serial shell getprop ro.build.version.sdk).Trim() -ne '29')) { throw 'Keyboard tests require explicit scoped su on the dedicated API29 AVD or an already-rooted dedicated test AVD' }
  if (((& $Adb -s $Serial shell su 0 id -u) -join '').Trim() -ne '0') { throw 'The dedicated emulator has no working scoped su' }
  $mobileTalkBackRootPrefix=@('su','0')
}
$mobileTalkBackState=(& $Adb -s $Serial shell dumpsys accessibility) -join "`n"
$mobileBoundServices=[regex]::Match($mobileTalkBackState,'(?s)Bound services:\{(.*?)\}\s*Enabled services:').Groups[1].Value
if ($mobileBoundServices -notmatch 'Service\[label=TalkBack,') { throw 'Start TalkBack and wait for its bound service before keyboard testing' }
$mobileKeyboardDescription=(& $Adb -s $Serial shell getevent -lp $KeyboardDevice) -join "`n"
if ($mobileKeyboardDescription -notmatch 'AT Translated Set 2 keyboard' -or $mobileKeyboardDescription -notmatch 'KEY_LEFTALT') { throw 'Unexpected test keyboard; inspect before sending events' }
$mobileKeyboardOutput=Join-Path (Split-Path -Parent $PSScriptRoot) 'release-artifacts\mobile-talkback'
if ($HelperDirectory) { $mobileKeyboardOutput=[IO.Path]::GetFullPath($HelperDirectory) }
New-Item -ItemType Directory -Force -Path $mobileKeyboardOutput | Out-Null
$mobileKeyboardHost=Join-Path $mobileKeyboardOutput 'keyboard-input'
$mobileKeyboardSource=Join-Path $PSScriptRoot 'mobile-talkback-keyboard.c'
if (-not (Test-Path $mobileKeyboardHost) -or (Get-Item $mobileKeyboardSource).LastWriteTimeUtc -gt (Get-Item $mobileKeyboardHost).LastWriteTimeUtc) {
  & 'E:\Android\Sdk\ndk\27.2.12479018\toolchains\llvm\prebuilt\windows-x86_64\bin\x86_64-linux-android29-clang.cmd' -O2 -Wall -Wextra $mobileKeyboardSource -o $mobileKeyboardHost
  if ($LASTEXITCODE -ne 0) { throw 'Test keyboard helper compilation failed' }
}
& $Adb -s $Serial push $mobileKeyboardHost /data/local/tmp/longedit-talkback-keyboard | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Keyboard helper upload failed' }
& $Adb -s $Serial shell chmod 700 /data/local/tmp/longedit-talkback-keyboard
function Send-MobileTalkBackKey {
  param([ValidateSet('next','previous','activate')][string]$Action)
  & $mobileTalkBackAdb -s $mobileTalkBackSerial shell @mobileTalkBackRootPrefix /data/local/tmp/longedit-talkback-keyboard $Action $mobileTalkBackKeyboard
  if ($LASTEXITCODE -ne 0) { throw 'TalkBack test key failed' }
}
function Save-MobileTalkBackScreen {
  param([Parameter(Mandatory)][string]$Path)
  if (Test-Path -LiteralPath $Path) { throw 'Preserve the existing screenshot; use a new name' }
  for ($mobileCaptureAttempt=0; $mobileCaptureAttempt -lt 3; $mobileCaptureAttempt++) {
    & $mobileTalkBackAdb -s $mobileTalkBackSerial shell screencap -p /sdcard/longedit-a11y-screen.png
    if ($LASTEXITCODE -eq 0) {
      & $mobileTalkBackAdb -s $mobileTalkBackSerial pull /sdcard/longedit-a11y-screen.png $Path | Out-Null
      if ($LASTEXITCODE -eq 0 -and (Get-Item -LiteralPath $Path).Length -gt 8) { return }
    }
    Start-Sleep -Milliseconds 300
  }
  throw 'Screenshot readback failed after three attempts'
}
