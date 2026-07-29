param(
  [Parameter(Mandatory)]
  [string]$BundlePath
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Import-Module (Join-Path $PSScriptRoot "E1BWpsClosureBundle.psm1") -Force
$result = Import-E1BWpsClosureBundle `
  -BundlePath $BundlePath `
  -DestinationDirectory (Join-Path $workspace "fixtures\odt\producers") `
  -SourceFixturePath (Join-Path $workspace "fixtures\docx\producers\wps-writer.docx")
Write-Output ($result | ConvertTo-Json -Depth 3)
Write-Output "WPS evidence imported. Run audit:e1b-odt-desktop before changing the producer matrix or format registry."
