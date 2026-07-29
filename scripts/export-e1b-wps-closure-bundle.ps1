param(
  [Parameter(Mandatory)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Import-Module (Join-Path $PSScriptRoot "E1BWpsClosureBundle.psm1") -Force
$result = Export-E1BWpsClosureBundle `
  -FixturePath (Join-Path $workspace "fixtures\odt\producers\wps-writer.odt") `
  -ManifestPath (Join-Path $workspace "fixtures\odt\producers\wps-writer.json") `
  -SourceFixturePath (Join-Path $workspace "fixtures\docx\producers\wps-writer.docx") `
  -OutputPath $OutputPath
Write-Output "E1B WPS closure handoff bundle created: $result"
