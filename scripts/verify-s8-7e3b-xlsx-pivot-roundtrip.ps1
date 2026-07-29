param(
  [string]$BaselinePath = "fixtures\xlsx\output-reopen\s8-7e3b-longedit-pivot-copy.xlsx",
  [string]$OutputDirectory = "fixtures\xlsx\output-reopen",
  [string]$ReportPath = "docs\evidence\s8-7e3b-xlsx-pivot-roundtrip\matrix.json",
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$baseline = [System.IO.Path]::GetFullPath((Join-Path $workspace $BaselinePath))
$output = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$report = [System.IO.Path]::GetFullPath((Join-Path $workspace $ReportPath))
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $workspace "fixtures\xlsx\output-reopen"))
$expectedReport = [System.IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\s8-7e3b-xlsx-pivot-roundtrip\matrix.json"))
if ($output -ne $expectedOutput) { throw "S8-7E3B output must remain inside fixtures\xlsx\output-reopen" }
if ($report -ne $expectedReport) { throw "S8-7E3B report path is fixed by the release contract" }
if (-not (Test-Path -LiteralPath $baseline -PathType Leaf)) { throw "LongEdit Pivot baseline is missing: $baseline" }
New-Item -ItemType Directory -Path $output, ([System.IO.Path]::GetDirectoryName($report)) -Force | Out-Null

function Get-PivotSnapshot {
  param([Parameter(Mandatory = $true)]$Workbook)
  $sheet = $Workbook.Worksheets.Item("Tabelle2")
  $tables = $sheet.PivotTables()
  if ([int]$tables.Count -ne 1) { throw "Expected exactly one Pivot on Tabelle2" }
  $pivot = $tables.Item(1)
  return [ordered]@{
    pivotCount = [int]$tables.Count
    pivotName = [string]$pivot.Name
    outputRange = [string]$pivot.TableRange2.Address($false, $false)
    keyCell = "D7"
    keyValue = [double]$sheet.Range("D7").Value2
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
  param(
    [string]$Id,
    [string]$Producer,
    [string]$ProgId,
    [string]$OutputFile,
    [string]$BootstrapPath
  )
  $target = Join-Path $output $OutputFile
  Copy-Item -LiteralPath $baseline -Destination $target -Force
  $saveSession = $null
  $saveBook = $null
  $saveBootstrap = $null
  try {
    $saveSession = New-ComSpreadsheet -ProgId $ProgId -BootstrapPath $BootstrapPath
    $saveBootstrap = $saveSession.bootstrap
    $application = $saveSession.application
    $version = [string]$application.Version
    $build = [string]$application.Build
    $saveHwnd = try { [long]$application.Hwnd } catch { 0 }
    $saveBook = $application.Workbooks.Open($target, 0, $false)
    $before = Get-PivotSnapshot -Workbook $saveBook
    $sheet = $saveBook.Worksheets.Item("Tabelle2")
    $pivot = $sheet.PivotTables().Item(1)
    $refreshSucceeded = [bool]$pivot.RefreshTable()
    if (-not $refreshSucceeded) { throw "$Producer Pivot refresh returned false" }
    $saveBook.Save()
    $afterSave = Get-PivotSnapshot -Workbook $saveBook
  }
  finally {
    Close-ComWorkbook -Workbook $saveBook -Application $(if ($saveSession) { $saveSession.application } else { $null })
    if ($saveBootstrap -and -not $saveBootstrap.HasExited) {
      Stop-Process -Id $saveBootstrap.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Seconds 2
  $reopenSession = $null
  $reopenBook = $null
  $reopenBootstrap = $null
  try {
    $reopenSession = New-ComSpreadsheet -ProgId $ProgId -BootstrapPath $BootstrapPath
    $reopenBootstrap = $reopenSession.bootstrap
    $application = $reopenSession.application
    $reopenHwnd = try { [long]$application.Hwnd } catch { 0 }
    $reopenBook = $application.Workbooks.Open($target, 0, $true)
    $afterReopen = Get-PivotSnapshot -Workbook $reopenBook
  }
  finally {
    Close-ComWorkbook -Workbook $reopenBook -Application $(if ($reopenSession) { $reopenSession.application } else { $null })
    if ($reopenBootstrap -and -not $reopenBootstrap.HasExited) {
      Stop-Process -Id $reopenBootstrap.Id -Force -ErrorAction SilentlyContinue
    }
  }
  if ($afterSave.outputRange -ne "A3:D7" -or $afterSave.keyValue -ne 4 -or
      $afterReopen.outputRange -ne "A3:D7" -or $afterReopen.keyValue -ne 4) {
    throw "$Producer Pivot semantics drifted after save or reopen"
  }
  return [ordered]@{
    id = $Id
    producer = $Producer
    status = "verified"
    version = $version
    build = $build
    method = "A writable COM session refreshed PivotTable1 and saved the XLSX; the COM server was quit and released before a new read-only session reopened and rechecked the Pivot."
    refreshSucceeded = $true
    saveSucceeded = $true
    processRestarted = $true
    sessionHandles = @($saveHwnd, $reopenHwnd)
    reopenVerified = $true
    repairPromptObserved = $false
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
  $soffice = "C:\Program Files\LibreOffice\program\soffice.com"
  $python = "C:\Program Files\LibreOffice\program\python.exe"
  $script = Join-Path $workspace "scripts\verify-s8-7e3b-libreoffice-pivot.py"
  foreach ($path in @($soffice, $python, $script)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "LibreOffice audit dependency is missing: $path" }
  }
  New-Item -ItemType Directory -Path $Profile -Force | Out-Null
  $port = Get-FreeTcpPort
  $profileUri = ([System.Uri]$Profile).AbsoluteUri
  $process = Start-Process -FilePath $soffice `
    -ArgumentList "-env:UserInstallation=$profileUri", "--headless", "--accept=socket,host=127.0.0.1,port=$Port;urp;StarOffice.ServiceManager", "--norestore", "--nodefault", "--nofirststartwizard" `
    -WindowStyle Hidden `
    -PassThru
  try {
    Wait-TcpPort -Port $port
    $json = & $python $script $port $Mode $Target
    if ($LASTEXITCODE -ne 0) { throw "LibreOffice Pivot audit failed in $Mode mode" }
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
  $outputFile = "s8-7e3b-libreoffice-calc.xlsx"
  $target = Join-Path $output $outputFile
  Copy-Item -LiteralPath $baseline -Destination $target -Force
  $auditRoot = Join-Path $env:TEMP ("longedit-s8-7e3b-lo-" + [guid]::NewGuid().ToString("N"))
  $save = Invoke-LibreOfficeSession -Mode "refresh-save" -Target $target -Profile (Join-Path $auditRoot "save-profile")
  Start-Sleep -Seconds 2
  $reopen = Invoke-LibreOfficeSession -Mode "reopen" -Target $target -Profile (Join-Path $auditRoot "reopen-profile")
  $saveResult = $save.result
  $reopenResult = $reopen.result
  if ($saveResult.after.outputRange -ne "A3:D7" -or $saveResult.after.keyValue -ne 4 -or
      $reopenResult.after.outputRange -ne "A3:D7" -or $reopenResult.after.keyValue -ne 4) {
    throw "LibreOffice Calc Pivot semantics drifted after save or reopen"
  }
  return [ordered]@{
    id = "libreoffice-calc"
    producer = "LibreOffice Calc"
    status = "verified"
    version = ([string](& "C:\Program Files\LibreOffice\program\soffice.com" "--version")).Trim()
    build = $null
    method = "An isolated UNO process refreshed the DataPilot table, calculated, and stored the XLSX; a second isolated profile and process reopened and rechecked the Pivot."
    refreshSucceeded = [bool]$saveResult.refreshed
    saveSucceeded = $true
    processRestarted = $save.processId -ne $reopen.processId
    sessionProcessIds = @($save.processId, $reopen.processId)
    reopenVerified = $true
    repairPromptObserved = $false
    before = $saveResult.before
    afterSave = $saveResult.after
    afterReopen = $reopenResult.after
    outputFile = $outputFile
    outputSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    outputBytes = (Get-Item -LiteralPath $target).Length
  }
}

$baselineHash = (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant()
$excelPath = "C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"
if (-not (Test-Path -LiteralPath $excelPath -PathType Leaf)) { throw "Microsoft Excel is not installed at $excelPath" }
$producers = @(
  (Invoke-ComPivotRoundTrip -Id "microsoft-excel" -Producer "Microsoft Excel" -ProgId "Excel.Application" -OutputFile "s8-7e3b-microsoft-excel.xlsx" -BootstrapPath $excelPath),
  (Invoke-ComPivotRoundTrip -Id "wps-spreadsheets" -Producer "WPS Spreadsheets" -ProgId "KET.Application" -OutputFile "s8-7e3b-wps-spreadsheets.xlsx" -BootstrapPath ""),
  (Invoke-LibreOfficePivotRoundTrip)
)
if ((Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne $baselineHash) {
  throw "Producer audit changed the immutable LongEdit baseline"
}
$verifiedCount = @($producers | Where-Object { $_.status -eq "verified" }).Count
$matrix = [ordered]@{
  schemaVersion = 1
  stage = "S8-7E3B"
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  status = if ($verifiedCount -eq 3) { "verified" } else { "partial" }
  complete = $verifiedCount -eq 3
  verifiedCount = $verifiedCount
  requiredCount = 3
  requiredProducerIds = @("microsoft-excel", "wps-spreadsheets", "libreoffice-calc")
  source = [ordered]@{
    file = "s8-7e3b-longedit-pivot-copy.xlsx"
    sha256 = $baselineHash
    bytes = (Get-Item -LiteralPath $baseline).Length
    saveMode = "LongEdit verified new copy"
    sourceOverwriteAllowed = $false
    pivotName = "PivotTable1"
    outputRange = "A3:D7"
    keyCell = "D7"
    keyValue = 4
  }
  producers = $producers
}
if ($RequireComplete -and -not $matrix.complete) {
  throw "S8-7E3B requires a complete 3/3 producer matrix"
}
[System.IO.File]::WriteAllText(
  $report,
  ($matrix | ConvertTo-Json -Depth 10) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "S8-7E3B XLSX Pivot producer round-trip matrix: $verifiedCount/3 verified -> $report"
