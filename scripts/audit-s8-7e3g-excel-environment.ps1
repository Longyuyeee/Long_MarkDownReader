param(
  [string]$ReportPath = "docs\evidence\s8-7e3g-xlsx-pivot-multi-axis-roundtrip\excel-environment.json"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$report = [System.IO.Path]::GetFullPath((Join-Path $workspace $ReportPath))
$expectedReport = [System.IO.Path]::GetFullPath(
  (Join-Path $workspace "docs\evidence\s8-7e3g-xlsx-pivot-multi-axis-roundtrip\excel-environment.json")
)
if ($report -ne $expectedReport) { throw "S8-7E3G Excel environment report path is fixed by contract" }

$clsid = "{00024500-0000-0000-C000-000000000046}"
$registryCandidates = @(
  "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\LocalServer32",
  "Registry::HKEY_CLASSES_ROOT\WOW6432Node\CLSID\$clsid\LocalServer32"
)
$localServer = $null
foreach ($registryPath in $registryCandidates) {
  $entry = Get-ItemProperty -Path $registryPath -ErrorAction SilentlyContinue
  if ($entry -and $entry.'(default)') {
    $localServer = [string]$entry.'(default)'
    break
  }
}

$application = $null
$identity = $null
$status = "missing"
try {
  $type = [type]::GetTypeFromProgID("Excel.Application")
  if ($type) {
    $application = New-Object -ComObject Excel.Application
    $productCode = $null
    try { $productCode = [string]$application.ProductCode } catch {}
    $identity = [ordered]@{
      name = [string]$application.Name
      version = [string]$application.Version
      build = [string]$application.Build
      path = [string]$application.Path
      productCode = $productCode
    }
    $identityText = "$($identity.path) $localServer"
    if ($identityText -match "(?i)kingsoft|WPS Office|\\et\.exe") {
      $status = "compatible_server_not_microsoft_excel"
    } elseif ($identity.path -match "(?i)Microsoft Office" -and $localServer -match "(?i)EXCEL\.EXE") {
      $status = "available"
    } else {
      $status = "untrusted_identity"
    }
  }
}
catch {
  $status = "activation_failed"
  $activationError = $_.Exception.Message
}
finally {
  if ($application) {
    try { $application.Quit() } catch {}
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$result = [ordered]@{
  schemaVersion = 1
  stage = "S8-7E3G-D"
  checkedAt = [DateTime]::UtcNow.ToString("o")
  status = $status
  trustedMicrosoftExcelAvailable = $status -eq "available"
  progId = "Excel.Application"
  clsid = $clsid
  localServer = $localServer
  identity = $identity
  activationError = $activationError
  openedWorkbook = $false
  writesUserFile = $false
  requiredIdentityGates = @(
    "excel_com_activation",
    "local_server_is_excel_exe",
    "application_path_is_microsoft_office",
    "local_server_is_not_kingsoft_or_wps"
  )
  nextAction = if ($status -eq "available") {
    "run_microsoft_excel_roundtrip"
  } else {
    "export_evidence_on_trusted_microsoft_excel_machine"
  }
}
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($report)) -Force | Out-Null
[System.IO.File]::WriteAllText(
  $report,
  ($result | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output "S8-7E3G Excel environment: $status -> $report"
