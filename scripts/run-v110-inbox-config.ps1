param([ValidateSet('before','after')][string]$Phase = 'before')
$ErrorActionPreference = 'Stop'
$configScriptDirectory = $PSScriptRoot
$source = Get-Content (Join-Path $PSScriptRoot 'run-v126-cross-format.ps1') -Raw
$source = $source.Replace('longedit-v126-', 'longedit-v110-inbox-config-').Replace('docs/evidence/v126-cross-format', "docs/evidence/v110-inbox-config/$Phase").Replace('scripts/capture-v126-cross-format.mjs', 'scripts/capture-v110-inbox.mjs')
$source = $source.Replace('$PSScriptRoot', '$configScriptDirectory')
if ($Phase -eq 'after') { $source = $source.Replace('scripts/capture-v110-inbox.mjs', 'scripts/capture-v110-inbox-config.mjs') }
& ([scriptblock]::Create($source))
