$ErrorActionPreference = 'Stop'
$inboxScriptDirectory = $PSScriptRoot
$source = Get-Content (Join-Path $PSScriptRoot 'run-v126-cross-format.ps1') -Raw
$source = $source.Replace('longedit-v126-', 'longedit-v110-inbox-').Replace('docs/evidence/v126-cross-format', 'docs/evidence/v110-inbox').Replace('scripts/capture-v126-cross-format.mjs', 'scripts/capture-v110-inbox.mjs')
$source = $source.Replace('$PSScriptRoot', '$inboxScriptDirectory').Replace('Search user-flow regression failed; inspect the failure report', 'Inbox user-flow tests failed; inspect console output')
& ([scriptblock]::Create($source))
