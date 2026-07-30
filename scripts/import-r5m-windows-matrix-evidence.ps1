param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("windows-10-x64", "windows-11-x64")]
    [string]$WindowsVersion,
    [Parameter(Mandatory = $true)]
    [string]$BundlePath
)

$ErrorActionPreference = "Stop"
$importer = Join-Path $PSScriptRoot "import-r5k-windows-evidence-bundle.ps1"
if (-not (Test-Path -LiteralPath $importer -PathType Leaf)) {
    throw "R5M base evidence importer is missing."
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $importer `
    -BundlePath $BundlePath `
    -TargetName $WindowsVersion `
    -ExpectedWindowsClass $WindowsVersion
if ($LASTEXITCODE -ne 0) {
    throw "R5M $WindowsVersion evidence import failed."
}

Write-Host "R5M $WindowsVersion evidence lane imported."
