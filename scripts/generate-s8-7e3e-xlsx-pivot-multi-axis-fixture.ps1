param(
  [string]$OutputPath = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $workspace "src-tauri\tests\fixtures\workbook\pivot-multi-axis-microsoft-excel.xlsx"
}
$target = [System.IO.Path]::GetFullPath($OutputPath)
$fixtureRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $workspace "src-tauri\tests\fixtures\workbook")
)
if (-not $target.StartsWith($fixtureRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Fixture output must stay under $fixtureRoot"
}
if ((Test-Path -LiteralPath $target) -and -not $Force) {
  throw "Fixture already exists: $target (pass -Force to regenerate)"
}

$excelPath = "C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"
if (-not (Test-Path -LiteralPath $excelPath -PathType Leaf)) {
  throw "Microsoft Excel is not installed at $excelPath"
}

$rows = @(
  @("Region", "City", "Year", "Quarter", "Sales"),
  @("North", "Beijing", 2025, "Q1", 10),
  @("North", "Beijing", 2025, "Q2", 20),
  @("North", "Beijing", 2026, "Q1", 30),
  @("North", "Beijing", 2026, "Q2", 40),
  @("North", "Tianjin", 2025, "Q1", 11),
  @("North", "Tianjin", 2025, "Q2", 21),
  @("North", "Tianjin", 2026, "Q1", 31),
  @("North", "Tianjin", 2026, "Q2", 41),
  @("South", "Guangzhou", 2025, "Q1", 12),
  @("South", "Guangzhou", 2025, "Q2", 22),
  @("South", "Guangzhou", 2026, "Q1", 32),
  @("South", "Guangzhou", 2026, "Q2", 42),
  @("South", "Shenzhen", 2025, "Q1", 13),
  @("South", "Shenzhen", 2025, "Q2", 23),
  @("South", "Shenzhen", 2026, "Q1", 33),
  @("South", "Shenzhen", 2026, "Q2", 43)
)

function Close-Excel {
  param($Workbook, $Application)
  if ($Workbook) {
    try { $Workbook.Close($false) } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Workbook) | Out-Null
  }
  if ($Application) {
    try { $Application.Quit() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Application) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($target)) -Force | Out-Null
$temporary = Join-Path $env:TEMP ("longedit-s8-7e3e-" + [guid]::NewGuid().ToString("N") + ".xlsx")
$application = $null
$workbook = $null
try {
  Write-Host "S8-7E3E: starting Excel fixture producer"
  $application = New-Object -ComObject Excel.Application
  $application.Visible = $false
  $application.DisplayAlerts = $false
  $application.ScreenUpdating = $false
  $application.EnableEvents = $false
  $workbook = $application.Workbooks.Add()

  Write-Host "S8-7E3E: writing source worksheet"
  $sourceSheet = $workbook.Worksheets.Item(1)
  $sourceSheet.Name = "Source"
  $pivotSheet = $workbook.Worksheets.Add()
  $pivotSheet.Name = "Pivot"

  $matrix = New-Object 'object[,]' $rows.Count, 5
  for ($rowIndex = 0; $rowIndex -lt $rows.Count; $rowIndex += 1) {
    for ($columnIndex = 0; $columnIndex -lt 5; $columnIndex += 1) {
      $matrix[$rowIndex, $columnIndex] = $rows[$rowIndex][$columnIndex]
    }
  }
  $sourceSheet.Range("A1:E17").Value2 = $matrix
  $sourceSheet.Range("A1:E17").Columns.AutoFit() | Out-Null

  $sourceRange = $sourceSheet.Range("A1:E17")
  Write-Host "S8-7E3E: creating Pivot cache and table"
  $cache = $workbook.PivotCaches().Create(1, $sourceRange)
  $pivot = $cache.CreatePivotTable($pivotSheet.Range("A3"), "MultiAxisPivot")

  Write-Host "S8-7E3E: assigning two row and two column fields"
  $region = $pivot.PivotFields("Region")
  $region.Orientation = 1
  $region.Position = 1
  $city = $pivot.PivotFields("City")
  $city.Orientation = 1
  $city.Position = 2
  $year = $pivot.PivotFields("Year")
  $year.Orientation = 2
  $year.Position = 1
  $quarter = $pivot.PivotFields("Quarter")
  $quarter.Orientation = 2
  $quarter.Position = 2
  $null = $pivot.AddDataField($pivot.PivotFields("Sales"), "Sum of Sales", -4157)

  $pivot.RowAxisLayout(1)
  $pivot.InGridDropZones = $false
  $pivot.ShowTableStyleRowStripes = $true
  $pivot.TableStyle2 = "PivotStyleMedium9"
  Write-Host "S8-7E3E: refreshing and saving producer workbook"
  $pivot.RefreshTable() | Out-Null
  $pivotSheet.Columns.AutoFit() | Out-Null

  $workbook.SaveAs($temporary, 51)
}
finally {
  Close-Excel -Workbook $workbook -Application $application
}

$verifyApplication = $null
$verifyWorkbook = $null
try {
  Write-Host "S8-7E3E: independently reopening producer workbook"
  $verifyApplication = New-Object -ComObject Excel.Application
  $verifyApplication.Visible = $false
  $verifyApplication.DisplayAlerts = $false
  $verifyWorkbook = $verifyApplication.Workbooks.Open($temporary, 0, $true)
  $verifyPivot = $verifyWorkbook.Worksheets.Item("Pivot").PivotTables().Item("MultiAxisPivot")
  if ([int]$verifyPivot.RowFields().Count -ne 2) {
    throw "Expected two row fields after independent reopen"
  }
  if ([int]$verifyPivot.ColumnFields().Count -ne 2) {
    throw "Expected two column fields after independent reopen"
  }
  if ([int]$verifyPivot.DataFields().Count -ne 1) {
    throw "Expected one data field after independent reopen"
  }
  $version = [string]$verifyApplication.Version
  $build = [string]$verifyApplication.Build
  $outputRange = [string]$verifyPivot.TableRange2.Address($false, $false)
}
finally {
  Close-Excel -Workbook $verifyWorkbook -Application $verifyApplication
}

Copy-Item -LiteralPath $temporary -Destination $target -Force
Remove-Item -LiteralPath $temporary -Force
$hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
$bytes = (Get-Item -LiteralPath $target).Length
Write-Output "Generated S8-7E3E fixture: $target"
Write-Output "Microsoft Excel version=$version build=$build range=$outputRange bytes=$bytes sha256=$hash"
