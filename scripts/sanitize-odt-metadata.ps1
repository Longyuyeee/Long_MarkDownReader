param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [string]$FixtureAuthor = "LongEdit E1B Audit"
)

$ErrorActionPreference = "Stop"
$python = Get-Command python.exe -ErrorAction Stop
$sanitizer = Join-Path $PSScriptRoot "sanitize-odt-metadata.py"
& $python.Source $sanitizer --path $Path --fixture-author $FixtureAuthor
if ($LASTEXITCODE -ne 0) {
  throw "ODT metadata sanitizer failed with exit code $LASTEXITCODE"
}
