param()

$ErrorActionPreference = "Stop"
$excelClsid = "{00024500-0000-0000-C000-000000000046}"
$localServer = $null
foreach ($registryPath in @(
  "Registry::HKEY_CLASSES_ROOT\CLSID\$excelClsid\LocalServer32",
  "Registry::HKEY_CLASSES_ROOT\WOW6432Node\CLSID\$excelClsid\LocalServer32"
)) {
  $value = Get-ItemPropertyValue -Path $registryPath -Name "(default)" -ErrorAction SilentlyContinue
  if ($value) { $localServer = [string]$value; break }
}
$excelStatus = if ($localServer -match '(?i)kingsoft|WPS Office|\\et\.exe') {
  "compatible_server_not_microsoft_excel"
} elseif ($localServer -match '(?i)EXCEL\.EXE' -and $localServer -match '(?i)Microsoft Office') {
  "available"
} elseif ($localServer) {
  "untrusted_identity"
} else {
  "missing"
}

$libreOfficeCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($env:LONGEDIT_LIBREOFFICE_ROOT)) {
  $libreOfficeCandidates += (Join-Path $env:LONGEDIT_LIBREOFFICE_ROOT "soffice.com")
}
$libreOfficeCandidates += @(
  "C:\Program Files\LibreOffice\program\soffice.com",
  "C:\Program Files (x86)\LibreOffice\program\soffice.com"
)
$pathCommand = Get-Command soffice.com -ErrorAction SilentlyContinue
if ($pathCommand) { $libreOfficeCandidates += $pathCommand.Source }
$libreOfficeCandidates = @($libreOfficeCandidates | Select-Object -Unique)
$libreOfficeExecutable = @($libreOfficeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)

$report = [ordered]@{
  schemaVersion = 1
  stage = "X3-B6"
  auditedAt = [DateTime]::UtcNow.ToString("o")
  status = if ($excelStatus -eq "available" -and $libreOfficeExecutable.Count -eq 1) { "ready" } else { "blocked_environment" }
  microsoftExcel = [ordered]@{
    status = $excelStatus
    clsid = $excelClsid
    localServer = $localServer
    trustedMicrosoftExcelAvailable = $excelStatus -eq "available"
  }
  libreOfficeCalc = [ordered]@{
    status = if ($libreOfficeExecutable.Count -eq 1) { "available" } else { "missing" }
    executable = if ($libreOfficeExecutable.Count -eq 1) { [string]$libreOfficeExecutable[0] } else { $null }
    candidates = $libreOfficeCandidates
  }
  safety = [ordered]@{
    activatedComApplication = $false
    openedWorkbook = $false
    writesUserFile = $false
  }
}
$report | ConvertTo-Json -Depth 8
