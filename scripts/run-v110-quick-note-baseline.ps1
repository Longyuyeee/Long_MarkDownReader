$ErrorActionPreference = 'Stop'
$baselineScriptDirectory = $PSScriptRoot
# Reuse the isolated native build/fixture/process cleanup harness without changing historical evidence.
$source = Get-Content (Join-Path $PSScriptRoot 'run-v126-cross-format.ps1') -Raw
$source = $source.Replace('longedit-v126-', 'longedit-v110-baseline-').Replace('docs/evidence/v126-cross-format', 'docs/evidence/v110-quick-note-baseline').Replace('scripts/capture-v126-cross-format.mjs', 'scripts/capture-v110-quick-note-baseline.mjs')
$source = $source.Replace('$PSScriptRoot', '$baselineScriptDirectory')
$source = $source.Replace('Search user-flow regression failed; inspect the failure report', 'QuickNote baseline capture failed; inspect the console output')
& ([scriptblock]::Create($source))
