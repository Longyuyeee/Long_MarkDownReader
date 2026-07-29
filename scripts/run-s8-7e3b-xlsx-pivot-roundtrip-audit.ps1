param(
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$source = Join-Path $workspace "src-tauri\tests\fixtures\workbook\pivot-producer-apache-poi.xlsx"
$output = Join-Path $workspace "fixtures\xlsx\output-reopen"
$baseline = Join-Path $output "s8-7e3b-longedit-pivot-copy.xlsx"
$auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3b-baseline-" + [guid]::NewGuid().ToString("N"))
$auditSource = Join-Path $auditRoot "pivot-producer-apache-poi.xlsx"
$temporaryBaseline = Join-Path $auditRoot "s8-7e3b-longedit-pivot-copy.xlsx"
New-Item -ItemType Directory -Path $auditRoot, $output -Force | Out-Null
try {
  Copy-Item -LiteralPath $source -Destination $auditSource
  & cargo run --quiet --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin xlsx-pivot-audit-copy -- $auditSource $temporaryBaseline
  if ($LASTEXITCODE -ne 0) { throw "LongEdit Pivot audit-copy CLI failed" }
  Copy-Item -LiteralPath $temporaryBaseline -Destination $baseline -Force
}
finally {
  if (Test-Path -LiteralPath $auditRoot) { Remove-Item -LiteralPath $auditRoot -Recurse -Force }
}

$arguments = @{
  BaselinePath = "fixtures\xlsx\output-reopen\s8-7e3b-longedit-pivot-copy.xlsx"
  OutputDirectory = "fixtures\xlsx\output-reopen"
  ReportPath = "docs\evidence\s8-7e3b-xlsx-pivot-roundtrip\matrix.json"
  RequireComplete = $RequireComplete
}
& (Join-Path $workspace "scripts\verify-s8-7e3b-xlsx-pivot-roundtrip.ps1") @arguments
if ($LASTEXITCODE -ne 0) { throw "S8-7E3B producer round-trip verification failed" }
