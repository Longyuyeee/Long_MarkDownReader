$ErrorActionPreference = 'Stop'
$quickNoteScriptDirectory = $PSScriptRoot
$source = Get-Content (Join-Path $PSScriptRoot 'run-v126-cross-format.ps1') -Raw
$source = $source.Replace('longedit-v126-', 'longedit-v110-quick-').Replace('docs/evidence/v126-cross-format', 'docs/evidence/v110-quick-note').Replace('scripts/capture-v126-cross-format.mjs', 'scripts/capture-v110-quick-note.mjs')
$source = $source.Replace('$PSScriptRoot', '$quickNoteScriptDirectory').Replace('Search user-flow regression failed; inspect the failure report', 'QuickNote tests failed; inspect console output')
& ([scriptblock]::Create($source))
