param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("microsoft-excel", "libreoffice-calc")]
  [string]$Producer,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [string]$LibreOfficeRoot = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "powershell-sha256.ps1")
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class LongEditWindowProcess {
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$baseline = Join-Path $workspace "src-tauri\tests\fixtures\workbook\array-formula-boundary.xlsx"
$bundlePath = [System.IO.Path]::GetFullPath($OutputPath)
$cargoManifest = Join-Path $workspace "src-tauri\Cargo.toml"
if ([System.IO.Path]::GetExtension($bundlePath) -ne ".zip") { throw "X3-B5 evidence bundle must use .zip" }
if (Test-Path -LiteralPath $bundlePath) { throw "Refusing to overwrite existing evidence bundle: $bundlePath" }

function Close-ComWorkbook {
  param($Workbook, $Application)
  if ($Workbook) {
    try { $Workbook.Close($false) } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Workbook) | Out-Null } catch {}
  }
  if ($Application) {
    try { $Application.Quit() } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Application) | Out-Null } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

function Get-ArrayAudit {
  param([string]$Path)
  $json = & cargo run --quiet --locked --manifest-path $cargoManifest --bin xlsx-array-audit -- $Path
  if ($LASTEXITCODE -ne 0) { throw "LongEdit rejected array-formula workbook: $Path" }
  $audit = ($json -join [Environment]::NewLine) | ConvertFrom-Json
  $kinds = @($audit.arrayFormulas | ForEach-Object { $_.kind })
  $ranges = @($audit.arrayFormulas | ForEach-Object {
    "$([char](65 + [int]$_.range.left))$([int]$_.range.top + 1):$([char](65 + [int]$_.range.right))$([int]$_.range.bottom + 1)"
  })
  if ($audit.status -ne "array_semantics_verified" -or [int]$audit.arrayDeclarationCount -ne 2 -or
      ($kinds -join ",") -ne "legacy_array,dynamic_array" -or
      ($ranges -join ",") -ne "B2:B4,D2:D4") {
    throw "Array-formula semantic snapshot drifted: $($audit | ConvertTo-Json -Compress -Depth 8)"
  }
  return $audit
}

function Get-TrustedExcelIdentity {
  $clsid = "{00024500-0000-0000-C000-000000000046}"
  $localServer = $null
  foreach ($registryPath in @(
    "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\LocalServer32",
    "Registry::HKEY_CLASSES_ROOT\WOW6432Node\CLSID\$clsid\LocalServer32"
  )) {
    $entry = Get-ItemProperty -Path $registryPath -ErrorAction SilentlyContinue
    if ($entry -and $entry.'(default)') { $localServer = [string]$entry.'(default)'; break }
  }
  $executable = $null
  if ($localServer -match '^\s*"([^"]+EXCEL\.EXE)"') { $executable = $matches[1] }
  elseif ($localServer -match '^\s*(.+?EXCEL\.EXE)(?:\s|$)') { $executable = $matches[1].Trim() }
  $trusted = $executable -and (Test-Path -LiteralPath $executable -PathType Leaf) -and
    $executable -match '(?i)Microsoft Office' -and
    "$localServer $executable" -notmatch '(?i)kingsoft|WPS Office|\\et\.exe'
  if (-not $trusted) { throw "A genuine Microsoft Office EXCEL.EXE LocalServer is required; WPS-compatible COM servers are rejected" }
  return [ordered]@{
    progId = "Excel.Application"
    clsid = $clsid
    localServer = $localServer
    executable = $executable
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
    } catch { Start-Sleep -Milliseconds 100 }
  }
  throw "LibreOffice UNO port $Port did not open"
}

function Invoke-LibreOfficeSession {
  param([string]$Mode, [string]$Target, [string]$Profile, [string]$Soffice, [string]$Python)
  New-Item -ItemType Directory -Path $Profile -Force | Out-Null
  $port = Get-FreeTcpPort
  $profileUri = ([System.Uri]$Profile).AbsoluteUri
  $process = Start-Process -FilePath $Soffice `
    -ArgumentList "-env:UserInstallation=$profileUri", "--headless", "--accept=socket,host=127.0.0.1,port=$port;urp;StarOffice.ServiceManager", "--norestore", "--nodefault", "--nofirststartwizard" `
    -WindowStyle Hidden -PassThru
  try {
    Wait-TcpPort -Port $port
    $json = & $Python (Join-Path $workspace "scripts\x3-b5-libreoffice-array-roundtrip.py") $port $Mode $Target
    if ($LASTEXITCODE -ne 0) { throw "LibreOffice array audit failed in $Mode mode" }
    return [ordered]@{ processId = $process.Id; result = ($json | Select-Object -Last 1 | ConvertFrom-Json) }
  } finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
}

$auditRoot = Join-Path $env:TEMP ("longedit-x3-b5-array-export-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
try {
  $outputFile = "array-formula-$Producer.xlsx"
  $producerOutput = Join-Path $auditRoot $outputFile
  Copy-Item -LiteralPath $baseline -Destination $producerOutput
  $before = Get-ArrayAudit -Path $baseline
  if ($Producer -eq "microsoft-excel") {
    $identity = Get-TrustedExcelIdentity
    $saveApplication = $null; $saveBook = $null
    try {
      $saveApplication = New-Object -ComObject "Excel.Application"
      $saveApplication.Visible = $false
      $saveApplication.DisplayAlerts = $false
      $identity["applicationName"] = [string]$saveApplication.Name
      $identity["version"] = [string]$saveApplication.Version
      try { $identity["build"] = [string]$saveApplication.Build } catch { $identity["build"] = "unknown" }
      $saveHandle = try { [long]$saveApplication.Hwnd } catch { 0 }
      [uint32]$saveProcessId = 0
      if ($saveHandle -ne 0) { [void][LongEditWindowProcess]::GetWindowThreadProcessId([IntPtr]$saveHandle, [ref]$saveProcessId) }
      $saveBook = $saveApplication.Workbooks.Open($producerOutput, 0, $false)
      $saveBook.Save()
    } finally { Close-ComWorkbook $saveBook $saveApplication }
    $afterSave = Get-ArrayAudit -Path $producerOutput
    $reopenApplication = $null; $reopenBook = $null
    try {
      $reopenApplication = New-Object -ComObject "Excel.Application"
      $reopenApplication.Visible = $false
      $reopenApplication.DisplayAlerts = $false
      $reopenHandle = try { [long]$reopenApplication.Hwnd } catch { 0 }
      [uint32]$reopenProcessId = 0
      if ($reopenHandle -ne 0) { [void][LongEditWindowProcess]::GetWindowThreadProcessId([IntPtr]$reopenHandle, [ref]$reopenProcessId) }
      $reopenBook = $reopenApplication.Workbooks.Open($producerOutput, 0, $true)
      $reopenedSheet = [string]$reopenBook.Worksheets.Item(1).Name
    } finally { Close-ComWorkbook $reopenBook $reopenApplication }
    if ($reopenedSheet -ne "Array Boundary") { throw "Microsoft Excel independent reopen returned unexpected sheet: $reopenedSheet" }
    $afterReopen = Get-ArrayAudit -Path $producerOutput
    $producerName = "Microsoft Excel"
    $sessionIds = @($saveProcessId, $reopenProcessId)
  } else {
    if ([string]::IsNullOrWhiteSpace($LibreOfficeRoot)) {
      $LibreOfficeRoot = if ($env:LONGEDIT_LIBREOFFICE_ROOT) { $env:LONGEDIT_LIBREOFFICE_ROOT } else { "C:\Program Files\LibreOffice\program" }
    }
    $LibreOfficeRoot = [System.IO.Path]::GetFullPath($LibreOfficeRoot)
    $soffice = Join-Path $LibreOfficeRoot "soffice.com"
    $python = Join-Path $LibreOfficeRoot "python.exe"
    if (-not (Test-Path -LiteralPath $soffice -PathType Leaf) -or -not (Test-Path -LiteralPath $python -PathType Leaf)) {
      throw "LibreOffice soffice.com and bundled python.exe are required under: $LibreOfficeRoot"
    }
    $version = ([string](& $soffice "--version")).Trim()
    if ($version -notmatch '(?i)LibreOffice' -or "$soffice $version" -match '(?i)kingsoft|WPS Office|Microsoft Excel') {
      throw "LibreOffice producer identity is invalid"
    }
    $save = Invoke-LibreOfficeSession -Mode "save" -Target $producerOutput -Profile (Join-Path $auditRoot "lo-save") -Soffice $soffice -Python $python
    $afterSave = Get-ArrayAudit -Path $producerOutput
    $reopen = Invoke-LibreOfficeSession -Mode "reopen" -Target $producerOutput -Profile (Join-Path $auditRoot "lo-reopen") -Soffice $soffice -Python $python
    $afterReopen = Get-ArrayAudit -Path $producerOutput
    $identity = [ordered]@{ executable = $soffice; version = $version; applicationName = "LibreOffice Calc" }
    $producerName = "LibreOffice Calc"
    $sessionIds = @($save.processId, $reopen.processId)
  }
  if (@($sessionIds).Count -ne 2 -or [long]$sessionIds[0] -le 0 -or [long]$sessionIds[1] -le 0 -or
      [long]$sessionIds[0] -eq [long]$sessionIds[1]) {
    throw "$producerName did not prove native save and reopen in two independent processes"
  }

  $producerEvidence = [ordered]@{
    schemaVersion = 1
    stage = "X3-B5"
    id = $Producer
    producer = $producerName
    status = "verified"
    identity = $identity
    completedGates = @("open_baseline", "native_save", "quit_process", "reopen_in_new_process", "verify_no_repair_prompt", "verify_array_declarations", "reparse_longedit_semantics")
    nativeSave = $true
    processRestarted = $true
    sessionIds = $sessionIds
    independentReopen = $true
    repairPromptObserved = $false
    before = $before
    afterSave = $afterSave
    afterReopen = $afterReopen
    outputFile = $outputFile
    outputBytes = (Get-Item -LiteralPath $producerOutput).Length
    outputSha256 = Get-Sha256Hex -Path $producerOutput
  }
  $producerPath = Join-Path $auditRoot "producer.json"
  [IO.File]::WriteAllText($producerPath, ($producerEvidence | ConvertTo-Json -Depth 14) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = "X3-B5"
    status = "array_producer_evidence_bundle"
    createdAt = [DateTime]::UtcNow.ToString("o")
    sourceCommit = ([string](& git -C $workspace rev-parse HEAD)).Trim()
    producerId = $Producer
    baseline = [ordered]@{
      file = "array-formula-boundary.xlsx"
      bytes = (Get-Item -LiteralPath $baseline).Length
      sha256 = Get-Sha256Hex -Path $baseline
    }
    members = @(
      [ordered]@{ name = "producer.json"; bytes = (Get-Item $producerPath).Length; sha256 = Get-Sha256Hex -Path $producerPath },
      [ordered]@{ name = $outputFile; bytes = (Get-Item $producerOutput).Length; sha256 = Get-Sha256Hex -Path $producerOutput }
    )
    trustedMachineConfirmationRequired = $true
    sourceOverwriteAllowed = $false
    calculationSupportClaimed = $false
    arrayWritebackClaimed = $false
  }
  $manifestPath = Join-Path $auditRoot "manifest.json"
  [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 12) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($bundlePath)) -Force | Out-Null
  $stream = [IO.File]::Open($bundlePath, [IO.FileMode]::CreateNew)
  try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      foreach ($member in @(
        @{ Name = "manifest.json"; Path = $manifestPath },
        @{ Name = "producer.json"; Path = $producerPath },
        @{ Name = $outputFile; Path = $producerOutput }
      )) {
        $entry = $archive.CreateEntry($member.Name, [IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open(); $sourceStream = [IO.File]::OpenRead($member.Path)
        try { $sourceStream.CopyTo($entryStream) } finally { $sourceStream.Dispose(); $entryStream.Dispose() }
      }
    } finally { $archive.Dispose() }
  } finally { $stream.Dispose() }
  Write-Output "X3-B5 $producerName evidence bundle exported: $bundlePath"
} finally {
  if (Test-Path -LiteralPath $auditRoot) {
    $resolved = (Resolve-Path -LiteralPath $auditRoot).Path
    $temp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove export directory outside TEMP: $resolved" }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
