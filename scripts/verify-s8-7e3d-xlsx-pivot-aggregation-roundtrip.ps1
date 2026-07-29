param(
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace "fixtures\xlsx\output-reopen"))
$report = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\s8-7e3d-xlsx-pivot-aggregation-roundtrip\matrix.json"))
New-Item -ItemType Directory -Path $output, ([System.IO.Path]::GetDirectoryName($report)) -Force | Out-Null

$aggregationSpecs = @(
  [ordered]@{ id = "count"; outputRange = "A3:D6"; keyCell = "D6"; keyValue = 2 },
  [ordered]@{ id = "average"; outputRange = "A3:D6"; keyCell = "D6"; keyValue = 2 },
  [ordered]@{ id = "max"; outputRange = "A3:D6"; keyCell = "D6"; keyValue = 3 },
  [ordered]@{ id = "min"; outputRange = "A3:D6"; keyCell = "D6"; keyValue = 1 },
  [ordered]@{ id = "product"; outputRange = "A3:D6"; keyCell = "D6"; keyValue = 3 },
  [ordered]@{ id = "countNums"; outputRange = "A3:D6"; keyCell = "D6"; keyValue = 2 }
)

function Get-PivotAggregationToken {
  param([string]$Path)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $archive.GetEntry("xl/pivotTables/pivotTable1.xml")
    if (-not $entry) { throw "Pivot definition is missing from $Path" }
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $manager = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
    $manager.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    $fields = @($xml.SelectNodes("//x:dataFields/x:dataField", $manager))
    if ($fields.Count -ne 1) { throw "Expected one Pivot data field in $Path" }
    $token = [string]$fields[0].GetAttribute("subtotal")
    return $(if ([string]::IsNullOrWhiteSpace($token)) { "sum" } else { $token })
  }
  finally {
    $archive.Dispose()
  }
}

function Get-PivotSnapshot {
  param($Workbook)
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
  param($Snapshot, $Spec, [string]$Context, [switch]$AllowNormalizedRange, [switch]$AllowNormalizedIdentity)
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
    if ($bootstrap -and -not $bootstrap.HasExited) { Stop-Process -Id $bootstrap.Id -Force -ErrorAction SilentlyContinue }
    throw
  }
}

function Invoke-ComPivotRoundTrip {
  param($Spec, [string]$Id, [string]$Producer, [string]$ProgId, [string]$BootstrapPath)
  $baseline = Join-Path $output "s8-7e3d-longedit-$($Spec.id).xlsx"
  $outputFile = "s8-7e3d-$($Spec.id)-$Id.xlsx"
  $target = Join-Path $output $outputFile
  Copy-Item -LiteralPath $baseline -Destination $target -Force
  $beforeAggregation = Get-PivotAggregationToken -Path $target
  if ($beforeAggregation -ne $Spec.id) { throw "$Producer baseline aggregation drifted to $beforeAggregation" }
  $saveSession = $null
  $saveBook = $null
  try {
    $saveSession = New-ComSpreadsheet -ProgId $ProgId -BootstrapPath $BootstrapPath
    $application = $saveSession.application
    $version = [string]$application.Version
    $build = [string]$application.Build
    $saveHandle = try { [long]$application.Hwnd } catch { 0 }
    $saveBook = $application.Workbooks.Open($target, 0, $false)
    $before = Get-PivotSnapshot -Workbook $saveBook
    Assert-PivotSnapshot -Snapshot $before -Spec $Spec -Context "$Producer before refresh"
    if (-not [bool]$saveBook.Worksheets.Item("Tabelle2").PivotTables().Item(1).RefreshTable()) {
      throw "$Producer Pivot refresh returned false"
    }
    $saveBook.Save()
    $afterSave = Get-PivotSnapshot -Workbook $saveBook
    Assert-PivotSnapshot -Snapshot $afterSave -Spec $Spec -Context "$Producer after save" -AllowNormalizedRange
  }
  finally {
    Close-ComWorkbook -Workbook $saveBook -Application $(if ($saveSession) { $saveSession.application } else { $null })
    if ($saveSession.bootstrap -and -not $saveSession.bootstrap.HasExited) { Stop-Process -Id $saveSession.bootstrap.Id -Force -ErrorAction SilentlyContinue }
  }
  $afterSaveAggregation = Get-PivotAggregationToken -Path $target
  Start-Sleep -Seconds 2
  $reopenSession = $null
  $reopenBook = $null
  try {
    $reopenSession = New-ComSpreadsheet -ProgId $ProgId -BootstrapPath $BootstrapPath
    $application = $reopenSession.application
    $reopenHandle = try { [long]$application.Hwnd } catch { 0 }
    $reopenBook = $application.Workbooks.Open($target, 0, $true)
    $afterReopen = Get-PivotSnapshot -Workbook $reopenBook
    Assert-PivotSnapshot -Snapshot $afterReopen -Spec $Spec -Context "$Producer after reopen" -AllowNormalizedRange
  }
  finally {
    Close-ComWorkbook -Workbook $reopenBook -Application $(if ($reopenSession) { $reopenSession.application } else { $null })
    if ($reopenSession.bootstrap -and -not $reopenSession.bootstrap.HasExited) { Stop-Process -Id $reopenSession.bootstrap.Id -Force -ErrorAction SilentlyContinue }
  }
  $afterReopenAggregation = Get-PivotAggregationToken -Path $target
  if ($afterSaveAggregation -ne $Spec.id -or $afterReopenAggregation -ne $Spec.id) {
    throw "$Producer rewrote $($Spec.id) aggregation to $afterSaveAggregation/$afterReopenAggregation"
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
    method = "Writable COM refresh/save followed by application quit, independent reopen, and OOXML subtotal reparse."
    refreshSucceeded = $true
    saveSucceeded = $true
    processRestarted = $true
    sessionHandles = @($saveHandle, $reopenHandle)
    reopenVerified = $true
    aggregationBefore = $beforeAggregation
    aggregationAfterSave = $afterSaveAggregation
    aggregationAfterReopen = $afterReopenAggregation
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
  $baseline = Join-Path $output "s8-7e3d-longedit-$($Spec.id).xlsx"
  $outputFile = "s8-7e3d-$($Spec.id)-libreoffice-calc.xlsx"
  $target = Join-Path $output $outputFile
  Copy-Item -LiteralPath $baseline -Destination $target -Force
  $beforeAggregation = Get-PivotAggregationToken -Path $target
  $auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3d-lo-" + [guid]::NewGuid().ToString("N"))
  try {
    $save = Invoke-LibreOfficeSession -Mode "refresh-save" -Target $target -Profile (Join-Path $auditRoot "save") -Spec $Spec
    $afterSaveAggregation = Get-PivotAggregationToken -Path $target
    Start-Sleep -Seconds 2
    $reopen = Invoke-LibreOfficeSession -Mode "reopen" -Target $target -Profile (Join-Path $auditRoot "reopen") -Spec $Spec
    $afterReopenAggregation = Get-PivotAggregationToken -Path $target
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
  if ($afterSaveAggregation -ne $Spec.id -or $afterReopenAggregation -ne $Spec.id) {
    throw "LibreOffice Calc rewrote $($Spec.id) aggregation to $afterSaveAggregation/$afterReopenAggregation"
  }
  return [ordered]@{
    id = "libreoffice-calc"
    producer = "LibreOffice Calc"
    status = "verified"
    version = ([string](& "C:\Program Files\LibreOffice\program\soffice.com" "--version")).Trim()
    build = $null
    method = "Isolated UNO refresh/store, second-profile reopen, and OOXML subtotal reparse."
    refreshSucceeded = [bool]$save.result.refreshed
    saveSucceeded = $true
    processRestarted = $save.processId -ne $reopen.processId
    sessionProcessIds = @($save.processId, $reopen.processId)
    reopenVerified = $true
    aggregationBefore = $beforeAggregation
    aggregationAfterSave = $afterSaveAggregation
    aggregationAfterReopen = $afterReopenAggregation
    repairPromptObserved = $false
    before = $save.result.before
    afterSave = $save.result.after
    afterReopen = $reopen.result.after
    outputFile = $outputFile
    outputSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    outputBytes = (Get-Item -LiteralPath $target).Length
  }
}

function Invoke-ProducerAttempt {
  param(
    [string]$Id,
    [string]$Producer,
    [scriptblock]$Operation
  )
  for ($attempt = 1; $attempt -le 2; $attempt += 1) {
    try {
      return & $Operation
    }
    catch {
      $message = $_.Exception.Message
      $isTransientRpc = $message -match "RPC|remote procedure|Call was rejected"
      if ($attempt -lt 2 -and $isTransientRpc) {
        Start-Sleep -Seconds 8
        continue
      }
      return [ordered]@{
        id = $Id
        producer = $Producer
        status = "blocked"
        error = $message
        refreshSucceeded = $false
        saveSucceeded = $false
        processRestarted = $false
        reopenVerified = $false
        repairPromptObserved = $null
      }
    }
  }
}

$excelPath = "C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"
if (-not (Test-Path -LiteralPath $excelPath -PathType Leaf)) { throw "Microsoft Excel is not installed at $excelPath" }
$aggregationResults = @()
foreach ($spec in $aggregationSpecs) {
  $baseline = Join-Path $output "s8-7e3d-longedit-$($spec.id).xlsx"
  if (-not (Test-Path -LiteralPath $baseline -PathType Leaf)) { throw "LongEdit aggregation baseline is missing: $baseline" }
  $baselineHash = (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant()
  $producers = @(
    (Invoke-ProducerAttempt -Id "microsoft-excel" -Producer "Microsoft Excel" -Operation {
      Invoke-ComPivotRoundTrip -Spec $spec -Id "microsoft-excel" -Producer "Microsoft Excel" -ProgId "Excel.Application" -BootstrapPath $excelPath
    }),
    (Invoke-ProducerAttempt -Id "wps-spreadsheets" -Producer "WPS Spreadsheets" -Operation {
      Invoke-ComPivotRoundTrip -Spec $spec -Id "wps-spreadsheets" -Producer "WPS Spreadsheets" -ProgId "KET.Application" -BootstrapPath ""
    }),
    (Invoke-ProducerAttempt -Id "libreoffice-calc" -Producer "LibreOffice Calc" -Operation {
      Invoke-LibreOfficePivotRoundTrip -Spec $spec
    })
  )
  if ((Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne $baselineHash) {
    throw "Producer audit changed immutable $($spec.id) baseline"
  }
  $verifiedProducerCount = @($producers | Where-Object { $_.status -eq "verified" }).Count
  $aggregationResults += [ordered]@{
    id = $spec.id
    status = if ($verifiedProducerCount -eq 3) { "verified" } else { "blocked" }
    verifiedProducerCount = $verifiedProducerCount
    outputRange = $spec.outputRange
    keyCell = $spec.keyCell
    keyValue = $spec.keyValue
    source = [ordered]@{
      file = "s8-7e3d-longedit-$($spec.id).xlsx"
      sha256 = $baselineHash
      bytes = (Get-Item -LiteralPath $baseline).Length
      saveMode = "LongEdit verified aggregation new copy"
      sourceOverwriteAllowed = $false
    }
    producers = $producers
  }
}

$verifiedCount = @($aggregationResults | ForEach-Object { $_.producers } | Where-Object { $_.status -eq "verified" }).Count
$outcomeCount = @($aggregationResults | ForEach-Object { $_.producers }).Count
$verifiedAggregations = @($aggregationResults | Where-Object { $_.status -eq "verified" } | ForEach-Object { $_.id })
$blockedAggregations = @($aggregationResults | Where-Object { $_.status -eq "blocked" } | ForEach-Object { $_.id })
$matrix = [ordered]@{
  schemaVersion = 1
  stage = "S8-7E3D"
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  status = if ($verifiedCount -eq 18) { "verified" } else { "partially_verified" }
  complete = $outcomeCount -eq 18
  verifiedCount = $verifiedCount
  outcomeCount = $outcomeCount
  requiredCount = 18
  reliableCopyWhitelist = $verifiedAggregations
  blockedAggregations = $blockedAggregations
  requiredAggregationIds = @("count", "average", "max", "min", "product", "countNums")
  requiredProducerIds = @("microsoft-excel", "wps-spreadsheets", "libreoffice-calc")
  sourceOverwriteAllowed = $false
  aggregations = $aggregationResults
}
[System.IO.File]::WriteAllText(
  $report,
  ($matrix | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
if ($RequireComplete -and -not $matrix.complete) { throw "S8-7E3D requires all 18 producer outcomes" }
Write-Output "S8-7E3D XLSX Pivot aggregation producer round-trip matrix: $verifiedCount/18 verified; whitelist=$($verifiedAggregations -join ',') -> $report"
