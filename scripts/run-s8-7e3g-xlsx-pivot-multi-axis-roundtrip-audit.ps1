param(
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$source = Join-Path $workspace "src-tauri\tests\fixtures\workbook\pivot-multi-axis-microsoft-excel.xlsx"
$output = Join-Path $workspace "fixtures\xlsx\output-reopen"
$auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3g-baseline-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot, $output -Force | Out-Null

try {
  $auditSource = Join-Path $auditRoot "multi-axis-source.xlsx"
  $temporaryBaseline = Join-Path $auditRoot "s8-7e3g-longedit-multi-axis.xlsx"
  Copy-Item -LiteralPath $source -Destination $auditSource
  & cargo run --quiet --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin xlsx-pivot-audit-copy -- $auditSource $temporaryBaseline multi_axis
  if ($LASTEXITCODE -ne 0) { throw "LongEdit multi-axis Pivot audit-copy CLI failed" }
  Copy-Item -LiteralPath $temporaryBaseline -Destination (Join-Path $output "s8-7e3g-longedit-multi-axis.xlsx") -Force
}
finally {
  if (Test-Path -LiteralPath $auditRoot) {
    $resolvedAuditRoot = (Resolve-Path -LiteralPath $auditRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolvedAuditRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove audit directory outside TEMP: $resolvedAuditRoot"
    }
    Remove-Item -LiteralPath $resolvedAuditRoot -Recurse -Force
  }
}

& node (Join-Path $workspace "scripts\check-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.mjs")
if ($LASTEXITCODE -ne 0) { throw "S8-7E3G multi-axis Pivot preflight check failed" }

if ($RequireComplete) {
  throw "S8-7E3G complete producer round-trip is not available on this machine: Excel and LibreOffice are missing. Use the fixed LongEdit baseline and matrix contract on a 3-producer workstation."
}
