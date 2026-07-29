param(
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$source = Join-Path $workspace "src-tauri\tests\fixtures\workbook\pivot-producer-apache-poi.xlsx"
$output = Join-Path $workspace "fixtures\xlsx\output-reopen"
$auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3c-baselines-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot, $output -Force | Out-Null

$layouts = @("row_only", "column_only", "multi_measure")
try {
  foreach ($layout in $layouts) {
    $auditSource = Join-Path $auditRoot "$layout-source.xlsx"
    $temporaryBaseline = Join-Path $auditRoot "s8-7e3c-longedit-$layout.xlsx"
    Copy-Item -LiteralPath $source -Destination $auditSource
    & cargo run --quiet --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin xlsx-pivot-audit-copy -- $auditSource $temporaryBaseline $layout
    if ($LASTEXITCODE -ne 0) { throw "LongEdit Pivot $layout audit-copy CLI failed" }
    Copy-Item -LiteralPath $temporaryBaseline -Destination (Join-Path $output "s8-7e3c-longedit-$layout.xlsx") -Force
  }
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

& (Join-Path $workspace "scripts\verify-s8-7e3c-xlsx-pivot-layout-roundtrip.ps1") -RequireComplete:$RequireComplete
if ($LASTEXITCODE -ne 0) { throw "S8-7E3C producer round-trip verification failed" }
