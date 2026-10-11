$ErrorActionPreference = 'Stop'
$nativeScriptDirectory = $PSScriptRoot
$source = Get-Content (Join-Path $PSScriptRoot 'run-v126-cross-format.ps1') -Raw
$source = $source.Replace('longedit-v126-', 'longedit-v110-inbox-native-').Replace('docs/evidence/v126-cross-format', 'docs/evidence/v110-inbox-native').Replace('scripts/capture-v126-cross-format.mjs', 'scripts/capture-v110-inbox-native.mjs')
$source = $source.Replace('$PSScriptRoot', '$nativeScriptDirectory')
$source = $source.Replace("'LONGEDIT_E2E_LIBRARY','LONGEDIT_E2E_THEME'", "'LONGEDIT_E2E_LIBRARY','LONGEDIT_E2E_CONFIG_DIR','LONGEDIT_E2E_THEME'")
$source = $source.Replace('$env:LONGEDIT_E2E_LIBRARY = $library', '$env:LONGEDIT_E2E_LIBRARY = $library' + "`n" + '$env:LONGEDIT_E2E_CONFIG_DIR = Join-Path $auditRoot ''config''')
$restart = @'
    Stop-Process -Id $app.Id
    $app.WaitForExit()
    $app = Start-Process -FilePath (Join-Path $workspace 'src-tauri/target/debug/tauri-app.exe') -WorkingDirectory (Join-Path $workspace 'src-tauri') -WindowStyle Hidden -PassThru
    & node scripts/capture-v110-inbox-native.mjs --restart
    if ($LASTEXITCODE -ne 0) { throw 'Inbox restart persistence failed' }
'@
$needle = "if (`$LASTEXITCODE -ne 0) { throw 'Search user-flow regression failed; inspect the failure report' }"
if (-not $source.Contains($needle)) { throw 'Runner insertion point changed' }
$source = $source.Replace($needle, $needle + "`n" + $restart)
& ([scriptblock]::Create($source))
