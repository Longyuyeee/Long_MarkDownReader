param([ValidateSet('before','after')][string]$Phase = 'before')
$ErrorActionPreference = 'Stop'
$syncScriptDirectory = $PSScriptRoot
$source = Get-Content (Join-Path $PSScriptRoot 'run-v126-cross-format.ps1') -Raw
$source = $source.Replace('longedit-v126-', 'longedit-v110-inbox-sync-').Replace('docs/evidence/v126-cross-format', "docs/evidence/v110-inbox-sync/$Phase").Replace('scripts/capture-v126-cross-format.mjs', 'scripts/capture-v110-inbox-sync.mjs')
$source = $source.Replace('$PSScriptRoot', '$syncScriptDirectory')
& ([scriptblock]::Create($source))
