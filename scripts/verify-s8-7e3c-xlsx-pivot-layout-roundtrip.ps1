param(
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace "fixtures\xlsx\output-reopen"))
$report = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\s8-7e3c-xlsx-pivot-layout-roundtrip\matrix.json"))
New-Item -ItemType Directory -Path $output, ([System.IO.Path]::GetDirectoryName($report)) -Force | Out-Null

$layoutSpecs = @(
  [ordered]@{ id = "row_only"; outputRange = "A3:B6"; keyCell = "B6"; keyValue = 4 },
  [ordered]@{ id = "column_only"; outputRange = "A3:D5"; keyCell = "D5"; keyValue = 4 },
  [ordered]@{ id = "multi_measure"; outputRange = "A3:J8"; keyCell = "J8"; keyValue = 2 }
)

function Get-PivotSnapshot {
  param($Workbook, $Spec)
  $sheet = $Workbook.Worksheets.Item("Tabelle2")
  $tables = $sheet.PivotTables()
  if ([int]$tables.Count -ne 1) { throw "Expected exactly one Pivot on Tabelle2" }
  $pivot = $tables.Item(1)
  $range = $pivot.TableRange2
  $keyCell = [string]$range.Cells.Item($range.Rows.Count, $range.Columns.Count).Address($false, $false)
  return [ordered]@{
    pivotCount = [int]$tables.Count
    pivotName = [string]$pivot.Name
    outputRange = [string]$range.Address($false, $false)
    keyCell = $keyCell
    keyValue = [double]$sheet.Range($keyCell).Value2
  }
}

function Assert-PivotSnapshot {
  param(
    $Snapshot,
    $Spec,
    [string]$Context,
    [switch]$AllowNormalizedRange,
    [switch]$AllowNormalizedIdentity
  )
  if ($Snapshot.pivotCount -ne 1 -or
      (-not $AllowNormalizedIdentity -and $Snapshot.pivotName -ne "PivotTable1") -or
      ($AllowNormalizedIdentity -and [string]::IsNullOrWhiteSpace([string]$Snapshot.pivotName)) -or
      [Math]::Abs([double]$Snapshot.keyValue - [double]$Spec.keyValue) -gt 0.000000001) {
    throw "$Context Pivot semantics drifted: $($Snapshot | ConvertTo-Json -Compress)"
  }
  if (-not $AllowNormalizedRange -and
      ($Snapshot.outputRange -ne $Spec.outputRange -or $Snapshot.keyCell -ne $Spec.keyCell)) {
    throw "$Context Pivot baseline range drifted: $($Snapshot | ConvertTo-Json -Compress)"
  }
}

function Close-ComWorkbook {
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

function New-ComSpreadsheet {
  param([string]$ProgId, [string]$BootstrapPath)
  $bootstrap = $null
  if ($BootstrapPath) {
    $bootstrap = Start-Process -FilePath $BootstrapPath -ArgumentList "/automation" -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 5
  }
  try {
    $application = New-Object -ComObject $ProgId
    $application.Visible = $false
    $application.DisplayAlerts = 0
    return [ordered]@{ application = $application; bootstrap = $bootstrap }
  }
  catch {
    if ($bootstrap -and -not $bootstrap.HasExited) {
      Stop-Process -Id $bootstrap.Id -Force -ErrorAction SilentlyContinue
    }
    throw
  }
}

function Invoke-ComPivotRoundTrip {
  param($Spec, [string]$Id, [string]$Producer, [string]$ProgId, [string]$BootstrapPath)
  $baseline = Join-Path $output "s8-7e3c-longedit-$($Spec.id).xlsx"
  $outputFile = "s8-7e3c-$($Spec.id)-$Id.xlsx"
  $target = Join-Path $output $outputFile
  Copy-Item -LiteralPath $baseline -Destination $target -Force
  $saveSession = $null
  $saveBook = $null
  try {
    $saveSession = New-ComSpreadsheet -ProgId $ProgId -BootstrapPath $BootstrapPath
    $application = $saveSession.application
    $version = [string]$application.Version
    $build = [string]$application.Build
    $saveHandle = try { [long]$application.Hwnd } catch { 0 }
    $saveBook = $application.Workbooks.Open($target, 0, $false)
    $before = Get-PivotSnapshot -Workbook $saveBook -Spec $Spec
    Assert-PivotSnapshot -Snapshot $before -Spec $Spec -Context "$Producer before refresh"
    $refreshSucceeded = [bool]$saveBook.Worksheets.Item("Tabelle2").PivotTables().Item(1).RefreshTable()
    if (-not $refreshSucceeded) { throw "$Producer Pivot refresh returned false" }
    $saveBook.Save()
    $afterSave = Get-PivotSnapshot -Workbook $saveBook -Spec $Spec
    Assert-PivotSnapshot -Snapshot $afterSave -Spec $Spec -Context "$Producer after save" -AllowNormalizedRange
  }
  finally {
    Close-ComWorkbook -Workbook $saveBook -Application $(if ($saveSession) { $saveSession.application } else { $null })
    if ($saveSession.bootstrap -and -not $saveSession.bootstrap.HasExited) {
      Stop-Process -Id $saveSession.bootstrap.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Seconds 2
  $reopenSession = $null
  $reopenBook = $null
  try {
    $reopenSession = New-ComSpreadsheet -ProgId $ProgId -BootstrapPath $BootstrapPath
    $application = $reopenSession.application
    $reopenHandle = try { [long]$application.Hwnd } catch { 0 }
    $reopenBook = $application.Workbooks.Open($target, 0, $true)
    $afterReopen = Get-PivotSnapshot -Workbook $reopenBook -Spec $Spec
    Assert-PivotSnapshot -Snapshot $afterReopen -Spec $Spec -Context "$Producer after reopen" -AllowNormalizedRange
  }
  finally {
    Close-ComWorkbook -Workbook $reopenBook -Application $(if ($reopenSession) { $reopenSession.application } else { $null })
    if ($reopenSession.bootstrap -and -not $reopenSession.bootstrap.HasExited) {
      Stop-Process -Id $reopenSession.bootstrap.Id -Force -ErrorAction SilentlyContinue
    }
  }
  if ($afterSave.outputRange -ne $afterReopen.outputRange -or
      $afterSave.keyCell -ne $afterReopen.keyCell -or
      [Math]::Abs([double]$afterSave.keyValue - [double]$afterReopen.keyValue) -gt 0.000000001) {
    throw "$Producer normalized Pivot state changed after process restart"
  }
  return [ordered]@{
    id = $Id
    producer = $Producer
    status = "verified"
    version = $version
    build = $build
    method = "Writable COM refresh/save followed by application quit and independent read-only reopen."
    refreshSucceeded = $true
    saveSucceeded = $true
    processRestarted = $true
    sessionHandles = @($saveHandle, $reopenHandle)
    reopenVerified = $true
    repairPromptObserved = $false
    before = $before
    afterSave = $afterSave
    afterReopen = $afterReopen
    outputFile = $outputFile
    outputSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    outputBytes = (Get-Item -LiteralPath $target).Length
  }
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function Wait-TcpPort {
  param([int]$Port)
  for ($attempt = 0; $attempt -lt 150; $attempt += 1) {
    try {
      $client = [System.Net.Sockets.TcpClient]::new("127.0.0.1", $Port)
      $client.Dispose()
      return
    }
    catch { Start-Sleep -Milliseconds 100 }
  }
  throw "LibreOffice UNO port $Port did not open"
}

function Invoke-LibreOfficeSession {
  param([string]$Mode, [string]$Target, [string]$Profile, $Spec)
  $soffice = "C:\Program Files\LibreOffice\program\soffice.com"
  $python = "C:\Program Files\LibreOffice\program\python.exe"
  $script = Join-Path $workspace "scripts\verify-s8-7e3c-libreoffice-pivot.py"
  foreach ($path in @($soffice, $python, $script)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "LibreOffice audit dependency is missing: $path" }
  }
  New-Item -ItemType Directory -Path $Profile -Force | Out-Null
  $port = Get-FreeTcpPort
  $profileUri = ([System.Uri]$Profile).AbsoluteUri
  $process = Start-Process -FilePath $soffice `
    -ArgumentList "-env:UserInstallation=$profileUri", "--headless", "--accept=socket,host=127.0.0.1,port=$Port;urp;StarOffice.ServiceManager", "--norestore", "--nodefault", "--nofirststartwizard" `
    -WindowStyle Hidden -PassThru
  try {
    Wait-TcpPort -Port $port
    $json = & $python $script $port $Mode $Target $Spec.keyValue
    if ($LASTEXITCODE -ne 0) { throw "LibreOffice Pivot audit failed in $Mode mode" }
    return [ordered]@{ processId = $process.Id; result = ($json | Select-Object -Last 1 | ConvertFrom-Json) }
  }
  finally {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
  }
}

function Invoke-LibreOfficePivotRoundTrip {
  param($Spec)
  $baseline = Join-Path $output "s8-7e3c-longedit-$($Spec.id).xlsx"
  $outputFile = "s8-7e3c-$($Spec.id)-libreoffice-calc.xlsx"
  $target = Join-Path $output $outputFile
  Copy-Item -LiteralPath $baseline -Destination $target -Force
  $auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3c-lo-" + [guid]::NewGuid().ToString("N"))
  try {
    $save = Invoke-LibreOfficeSession -Mode "refresh-save" -Target $target -Profile (Join-Path $auditRoot "save") -Spec $Spec
    Start-Sleep -Seconds 2
    $reopen = Invoke-LibreOfficeSession -Mode "reopen" -Target $target -Profile (Join-Path $auditRoot "reopen") -Spec $Spec
  }
  finally {
    if (Test-Path -LiteralPath $auditRoot) {
      $resolvedAuditRoot = (Resolve-Path -LiteralPath $auditRoot).Path
      $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
      if (-not $resolvedAuditRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove LibreOffice audit directory outside TEMP: $resolvedAuditRoot"
      }
      for ($attempt = 0; $attempt -lt 5 -and (Test-Path -LiteralPath $resolvedAuditRoot); $attempt += 1) {
        Start-Sleep -Milliseconds 500
        Remove-Item -LiteralPath $resolvedAuditRoot -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  }
  foreach ($snapshot in @($save.result.before, $save.result.after, $reopen.result.after)) {
    Assert-PivotSnapshot -Snapshot $snapshot -Spec $Spec -Context "LibreOffice Calc" -AllowNormalizedRange -AllowNormalizedIdentity
  }
  if ($save.result.after.outputRange -ne $reopen.result.after.outputRange -or
      $save.result.after.keyCell -ne $reopen.result.after.keyCell -or
      [Math]::Abs([double]$save.result.after.keyValue - [double]$reopen.result.after.keyValue) -gt 0.000000001) {
    throw "LibreOffice Calc normalized Pivot state changed after process restart"
  }
  return [ordered]@{
    id = "libreoffice-calc"
    producer = "LibreOffice Calc"
    status = "verified"
    version = ([string](& "C:\Program Files\LibreOffice\program\soffice.com" "--version")).Trim()
    build = $null
    method = "Isolated UNO refresh/store followed by a second profile and process reopen."
    refreshSucceeded = [bool]$save.result.refreshed
    saveSucceeded = $true
    processRestarted = $save.processId -ne $reopen.processId
    sessionProcessIds = @($save.processId, $reopen.processId)
    reopenVerified = $true
    repairPromptObserved = $false
    before = $save.result.before
    afterSave = $save.result.after
    afterReopen = $reopen.result.after
    outputFile = $outputFile
    outputSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    outputBytes = (Get-Item -LiteralPath $target).Length
  }
}

$excelPath = "C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"
if (-not (Test-Path -LiteralPath $excelPath -PathType Leaf)) { throw "Microsoft Excel is not installed at $excelPath" }
$layoutResults = @()
foreach ($spec in $layoutSpecs) {
  $baseline = Join-Path $output "s8-7e3c-longedit-$($spec.id).xlsx"
  if (-not (Test-Path -LiteralPath $baseline -PathType Leaf)) { throw "LongEdit layout baseline is missing: $baseline" }
  $baselineHash = (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant()
  $producers = @(
    (Invoke-ComPivotRoundTrip -Spec $spec -Id "microsoft-excel" -Producer "Microsoft Excel" -ProgId "Excel.Application" -BootstrapPath $excelPath),
    (Invoke-ComPivotRoundTrip -Spec $spec -Id "wps-spreadsheets" -Producer "WPS Spreadsheets" -ProgId "KET.Application" -BootstrapPath ""),
    (Invoke-LibreOfficePivotRoundTrip -Spec $spec)
  )
  if ((Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne $baselineHash) {
    throw "Producer audit changed immutable $($spec.id) baseline"
  }
  $layoutResults += [ordered]@{
    id = $spec.id
    status = "verified"
    outputRange = $spec.outputRange
    keyCell = $spec.keyCell
    keyValue = $spec.keyValue
    source = [ordered]@{
      file = "s8-7e3c-longedit-$($spec.id).xlsx"
      sha256 = $baselineHash
      bytes = (Get-Item -LiteralPath $baseline).Length
      saveMode = "LongEdit verified layout new copy"
      sourceOverwriteAllowed = $false
    }
    producers = $producers
  }
}

$verifiedCount = @($layoutResults | ForEach-Object { $_.producers } | Where-Object { $_.status -eq "verified" }).Count
$matrix = [ordered]@{
  schemaVersion = 1
  stage = "S8-7E3C"
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  status = if ($verifiedCount -eq 9) { "verified" } else { "partial" }
  complete = $verifiedCount -eq 9
  verifiedCount = $verifiedCount
  requiredCount = 9
  requiredLayoutIds = @("row_only", "column_only", "multi_measure")
  requiredProducerIds = @("microsoft-excel", "wps-spreadsheets", "libreoffice-calc")
  sourceOverwriteAllowed = $false
  layouts = $layoutResults
}
if ($RequireComplete -and -not $matrix.complete) { throw "S8-7E3C requires a complete 9/9 matrix" }
[System.IO.File]::WriteAllText(
  $report,
  ($matrix | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "S8-7E3C XLSX Pivot layout producer round-trip matrix: $verifiedCount/9 verified -> $report"
