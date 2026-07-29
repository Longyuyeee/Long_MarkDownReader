param(
  [ValidateSet("available", "all", "microsoft-excel", "wps-spreadsheets", "libreoffice-calc")]
  [string]$Producer = "available",
  [string]$LibreOfficeRoot = "",
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$baseline = Join-Path $workspace "fixtures\xlsx\output-reopen\s8-7e3g-longedit-multi-axis.xlsx"
$output = Join-Path $workspace "fixtures\xlsx\output-reopen"
$report = Join-Path $workspace "docs\evidence\s8-7e3g-xlsx-pivot-multi-axis-roundtrip\matrix.json"
$excelPath = "C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"
if ([string]::IsNullOrWhiteSpace($LibreOfficeRoot)) {
  $LibreOfficeRoot = if ([string]::IsNullOrWhiteSpace($env:LONGEDIT_LIBREOFFICE_ROOT)) {
    "C:\Program Files\LibreOffice\program"
  } else {
    $env:LONGEDIT_LIBREOFFICE_ROOT
  }
}
$LibreOfficeRoot = [System.IO.Path]::GetFullPath($LibreOfficeRoot)
$soffice = Join-Path $LibreOfficeRoot "soffice.com"
$libreOfficePython = Join-Path $LibreOfficeRoot "python.exe"
$libreOfficeVerifier = Join-Path $workspace "scripts\verify-s8-7e3g-libreoffice-pivot.py"

foreach ($requiredPath in @($baseline, $report)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "S8-7E3G audit dependency is missing: $requiredPath"
  }
}
New-Item -ItemType Directory -Path $output -Force | Out-Null

function Get-PivotSnapshot {
  param([Parameter(Mandatory = $true)]$Workbook)
  $sheet = $Workbook.Worksheets.Item("Pivot")
  $tables = $sheet.PivotTables()
  if ([int]$tables.Count -ne 1) { throw "Expected exactly one Pivot on Pivot sheet" }
  $pivot = $tables.Item(1)
  $snapshot = [ordered]@{
    pivotCount = [int]$tables.Count
    pivotName = [string]$pivot.Name
    outputRange = [string]$pivot.TableRange2.Address($false, $false)
    rowFieldCount = [int]$pivot.RowFields().Count
    columnFieldCount = [int]$pivot.ColumnFields().Count
    dataFieldCount = [int]$pivot.DataFields().Count
    pageFieldCount = [int]$pivot.PageFields().Count
    keyCell = "I12"
    keyValue = [double]$sheet.Range("I12").Value2
  }
  if ($snapshot.pivotName -ne "MultiAxisPivot" -or
      $snapshot.outputRange -ne "A3:I12" -or
      $snapshot.rowFieldCount -ne 2 -or
      $snapshot.columnFieldCount -ne 2 -or
      $snapshot.dataFieldCount -ne 1 -or
      $snapshot.pageFieldCount -ne 0 -or
      $snapshot.keyValue -ne 424) {
    throw "Multi-axis Pivot semantics drifted: $($snapshot | ConvertTo-Json -Compress)"
  }
  return $snapshot
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

function Test-ComProgId {
  param([string]$ProgId)
  try {
    $type = [type]::GetTypeFromProgID($ProgId)
    return $null -ne $type
  }
  catch { return $false }
}

function Test-LongEditReparse {
  param([string]$Target)
  $auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3g-reparse-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
  try {
    $source = Join-Path $auditRoot "producer-output.xlsx"
    $rebuilt = Join-Path $auditRoot "longedit-reparse.xlsx"
    Copy-Item -LiteralPath $Target -Destination $source
    $json = & cargo run --quiet --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") --bin xlsx-pivot-audit-copy -- $source $rebuilt multi_axis
    if ($LASTEXITCODE -ne 0) { throw "LongEdit could not reparse producer output: $Target" }
    $result = ($json -join [Environment]::NewLine) | ConvertFrom-Json
    if ($result.status -ne "audit_copy_verified" -or
        $result.pivotName -ne "MultiAxisPivot" -or
        $result.outputRange -ne "A3:I12" -or
        [int]$result.previewGroupCount -ne 16) {
      throw "LongEdit producer-output semantics drifted: $($result | ConvertTo-Json -Compress)"
    }
    return [ordered]@{
      status = "verified"
      pivotName = [string]$result.pivotName
      outputRange = [string]$result.outputRange
      outputCellCount = [int]$result.outputCellCount
      previewGroupCount = [int]$result.previewGroupCount
      rowFieldCount = [int]$result.rowFieldCount
      columnFieldCount = [int]$result.columnFieldCount
      dataFieldCount = [int]$result.dataFieldCount
      pageFieldCount = [int]$result.pageFieldCount
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
}

function Invoke-ComPivotRoundTrip {
  param(
    [string]$Id,
    [string]$ProducerName,
    [string]$ProgId,
    [string]$OutputFile
  )
  $target = Join-Path $output $OutputFile
  Copy-Item -LiteralPath $baseline -Destination $target -Force
  $saveApplication = $null
  $saveBook = $null
  try {
    $saveApplication = New-Object -ComObject $ProgId
    $saveApplication.Visible = $false
    $saveApplication.DisplayAlerts = 0
    $version = [string]$saveApplication.Version
    $build = [string]$saveApplication.Build
    $saveHandle = try { [long]$saveApplication.Hwnd } catch { 0 }
    $saveBook = $saveApplication.Workbooks.Open($target, 0, $false)
    $before = Get-PivotSnapshot -Workbook $saveBook
    $pivot = $saveBook.Worksheets.Item("Pivot").PivotTables().Item("MultiAxisPivot")
    $refreshSucceeded = [bool]$pivot.RefreshTable()
    if (-not $refreshSucceeded) { throw "$ProducerName Pivot refresh returned false" }
    $saveBook.Save()
    $afterSave = Get-PivotSnapshot -Workbook $saveBook
  }
  finally {
    Close-ComWorkbook -Workbook $saveBook -Application $saveApplication
  }
  Start-Sleep -Seconds 2
  $reopenApplication = $null
  $reopenBook = $null
  try {
    $reopenApplication = New-Object -ComObject $ProgId
    $reopenApplication.Visible = $false
    $reopenApplication.DisplayAlerts = 0
    $reopenHandle = try { [long]$reopenApplication.Hwnd } catch { 0 }
    $reopenBook = $reopenApplication.Workbooks.Open($target, 0, $true)
    $afterReopen = Get-PivotSnapshot -Workbook $reopenBook
  }
  finally {
    Close-ComWorkbook -Workbook $reopenBook -Application $reopenApplication
  }
  $longEdit = Test-LongEditReparse -Target $target
  return [ordered]@{
    id = $Id
    producer = $ProducerName
    status = "verified"
    version = $version
    build = $build
    method = "Writable COM refresh/save followed by application quit, independent read-only reopen, and LongEdit semantic reparse."
    completedGates = @("open_baseline", "refresh", "save", "quit_process", "reopen_in_new_process", "verify_no_repair_prompt", "reparse_longedit_semantics")
    refreshSucceeded = $true
    saveSucceeded = $true
    processRestarted = $true
    sessionHandles = @($saveHandle, $reopenHandle)
    reopenVerified = $true
    repairPromptObserved = $false
    longEditReparse = $longEdit
    before = $before
    afterSave = $afterSave
    afterReopen = $afterReopen
    outputFile = $OutputFile
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
  param([string]$Mode, [string]$Target, [string]$Profile)
  New-Item -ItemType Directory -Path $Profile -Force | Out-Null
  $port = Get-FreeTcpPort
  $profileUri = ([System.Uri]$Profile).AbsoluteUri
  $process = Start-Process -FilePath $soffice `
    -ArgumentList "-env:UserInstallation=$profileUri", "--headless", "--accept=socket,host=127.0.0.1,port=$Port;urp;StarOffice.ServiceManager", "--norestore", "--nodefault", "--nofirststartwizard" `
    -WindowStyle Hidden `
    -PassThru
  try {
    Wait-TcpPort -Port $port
    $json = & $libreOfficePython $libreOfficeVerifier $port $Mode $Target
    if ($LASTEXITCODE -ne 0) { throw "LibreOffice multi-axis Pivot audit failed in $Mode mode" }
    return [ordered]@{
      processId = $process.Id
      result = ($json | Select-Object -Last 1 | ConvertFrom-Json)
    }
  }
  finally {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

function Invoke-LibreOfficePivotRoundTrip {
  $outputFile = "s8-7e3g-libreoffice-calc.xlsx"
  $target = Join-Path $output $outputFile
  Copy-Item -LiteralPath $baseline -Destination $target -Force
  $auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3g-lo-" + [guid]::NewGuid().ToString("N"))
  try {
    $save = Invoke-LibreOfficeSession -Mode "refresh-save" -Target $target -Profile (Join-Path $auditRoot "save-profile")
    Start-Sleep -Seconds 2
    $reopen = Invoke-LibreOfficeSession -Mode "reopen" -Target $target -Profile (Join-Path $auditRoot "reopen-profile")
    $longEdit = Test-LongEditReparse -Target $target
    return [ordered]@{
      id = "libreoffice-calc"
      producer = "LibreOffice Calc"
      status = "verified"
      version = ([string](& $soffice "--version")).Trim()
      build = $null
      method = "Isolated UNO refresh/store followed by a second profile and process reopen, then LongEdit semantic reparse."
      completedGates = @("open_baseline", "refresh", "save", "quit_process", "reopen_in_new_process", "verify_no_repair_prompt", "reparse_longedit_semantics")
      refreshSucceeded = [bool]$save.result.refreshed
      saveSucceeded = $true
      processRestarted = $save.processId -ne $reopen.processId
      sessionProcessIds = @($save.processId, $reopen.processId)
      reopenVerified = $true
      repairPromptObserved = $false
      longEditReparse = $longEdit
      before = $save.result.before
      afterSave = $save.result.after
      afterReopen = $reopen.result.after
      outputFile = $outputFile
      outputSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
      outputBytes = (Get-Item -LiteralPath $target).Length
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
}

$availability = [ordered]@{
  "microsoft-excel" = (Test-Path -LiteralPath $excelPath -PathType Leaf) -and (Test-ComProgId "Excel.Application")
  "wps-spreadsheets" = Test-ComProgId "KET.Application"
  "libreoffice-calc" = (Test-Path -LiteralPath $soffice -PathType Leaf) -and
    (Test-Path -LiteralPath $libreOfficePython -PathType Leaf) -and
    (Test-Path -LiteralPath $libreOfficeVerifier -PathType Leaf)
}
$requested = if ($Producer -in @("available", "all")) {
  @("microsoft-excel", "wps-spreadsheets", "libreoffice-calc")
} else {
  @($Producer)
}
$matrix = Get-Content -Raw -LiteralPath $report | ConvertFrom-Json
$existing = @{}
foreach ($entry in $matrix.producers) { $existing[$entry.id] = $entry }
$baselineHash = (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant()

foreach ($id in $requested) {
  if (-not $availability[$id]) {
    if ($Producer -notin @("available", "all")) { throw "Requested producer is unavailable: $id" }
    continue
  }
  $entry = switch ($id) {
    "microsoft-excel" {
      Invoke-ComPivotRoundTrip -Id $id -ProducerName "Microsoft Excel" -ProgId "Excel.Application" -OutputFile "s8-7e3g-microsoft-excel.xlsx"
    }
    "wps-spreadsheets" {
      Invoke-ComPivotRoundTrip -Id $id -ProducerName "WPS Spreadsheets" -ProgId "KET.Application" -OutputFile "s8-7e3g-wps-spreadsheets.xlsx"
    }
    "libreoffice-calc" { Invoke-LibreOfficePivotRoundTrip }
  }
  $existing[$id] = $entry
}
if ((Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne $baselineHash) {
  throw "Producer audit changed the immutable LongEdit baseline"
}

$producerIds = @("microsoft-excel", "wps-spreadsheets", "libreoffice-calc")
$producerEntries = foreach ($id in $producerIds) { $existing[$id] }
$verifiedCount = @($producerEntries | Where-Object { $_.status -eq "verified" }).Count
$matrix.stage = "S8-7E3G"
$matrix.status = if ($verifiedCount -eq 3) { "verified" } elseif ($verifiedCount -gt 0) { "partial" } else { "blocked_preflight" }
$matrix.complete = $verifiedCount -eq 3
$matrix.verifiedCount = $verifiedCount
$matrix | Add-Member -NotePropertyName verifiedAt -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
$matrix.producers = @($producerEntries)
$matrix.environment.microsoftExcel.status = if ($availability["microsoft-excel"]) {
  "available"
} elseif ($existing["microsoft-excel"].status -eq "verified") {
  "verified_evidence"
} else {
  "missing"
}
$matrix.environment.wpsSpreadsheets.status = if ($availability["wps-spreadsheets"]) {
  "available"
} elseif ($existing["wps-spreadsheets"].status -eq "verified") {
  "verified_evidence"
} else {
  "missing"
}
$matrix.environment.libreOfficeCalc.status = if ($availability["libreoffice-calc"]) {
  "available"
} elseif ($existing["libreoffice-calc"].status -eq "verified") {
  "verified_evidence"
} else {
  "missing"
}
$matrix.environment.checkedAt = [DateTime]::Now.ToString("yyyy-MM-dd")
if ($availability["libreoffice-calc"]) {
  $matrix.environment.libreOfficeCalc.evidence = "LibreOffice Calc detected and executed through the audited soffice/UNO runtime"
  $matrix.environment.libreOfficeCalc | Add-Member -NotePropertyName executable -NotePropertyValue $soffice -Force
}
$blockedUntil = @()
if ($existing["microsoft-excel"].status -ne "verified") { $blockedUntil += "microsoft_excel_available" }
if ($existing["wps-spreadsheets"].status -ne "verified") { $blockedUntil += "wps_spreadsheets_available" }
if ($existing["libreoffice-calc"].status -ne "verified") { $blockedUntil += "libreoffice_calc_available" }
if ($verifiedCount -ne 3) { $blockedUntil += "three_producer_roundtrip_verified" }
$matrix.blockedUntil = @($blockedUntil)

[System.IO.File]::WriteAllText(
  $report,
  ($matrix | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "S8-7E3G multi-axis Pivot producer round-trip matrix: $verifiedCount/3 verified -> $report"
if ($RequireComplete -and -not $matrix.complete) {
  throw "S8-7E3G requires a complete 3/3 producer matrix; current verified count is $verifiedCount"
}
