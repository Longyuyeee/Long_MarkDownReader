param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("windows-10-x64", "windows-11-x64")]
    [string]$WindowsVersion,
    [Parameter(Mandatory = $true)]
    [string]$BundlePath,
    [string]$ArtifactManifestPath = "docs/evidence/r5n-signed-release/signed-installer-manifest.json"
)

$ErrorActionPreference = "Stop"
$importer = Join-Path $PSScriptRoot "import-r5k-windows-evidence-bundle.ps1"
if (-not (Test-Path -LiteralPath $importer -PathType Leaf)) {
    throw "R5N base evidence importer is missing."
}
$targetName = "signed-$WindowsVersion"

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $importer `
    -BundlePath $BundlePath `
    -TargetName $targetName `
    -ExpectedWindowsClass $WindowsVersion `
    -ArtifactManifestPath $ArtifactManifestPath
if ($LASTEXITCODE -ne 0) {
    throw "R5N signed $WindowsVersion evidence import failed."
}

Write-Host "R5N signed $WindowsVersion evidence lane imported."
