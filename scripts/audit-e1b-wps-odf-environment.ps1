param(
  [switch]$RequireReady
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workspace "fixtures\docx\producers\wps-writer.docx"
$evidence = Join-Path $workspace "fixtures\odt\producers\wps-writer-blocker.json"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-e1b-wps-odf-" + [guid]::NewGuid().ToString("N"))
$output = Join-Path $tempRoot "wps-writer.odt"
$wps = $null
$document = $null

function Close-ComObject {
  param([object]$Value)
  if ($null -ne $Value) {
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) | Out-Null } catch {}
  }
}

function Resolve-WpsExecutable {
  $registryPaths = @(
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\wps.exe",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\wps.exe",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\wps.exe"
  )
  foreach ($registryPath in $registryPaths) {
    if (-not (Test-Path -LiteralPath $registryPath)) { continue }
    $candidate = [string](Get-Item -LiteralPath $registryPath).GetValue("")
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  $command = Get-Command "wps.exe" -ErrorAction SilentlyContinue
  if ($command -and (Test-Path -LiteralPath $command.Source)) {
    return (Resolve-Path -LiteralPath $command.Source).Path
  }
  throw "WPS Writer executable is not registered or discoverable"
}

function Get-OutputKind {
  param([byte[]]$Bytes)
  if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0x50 -and $Bytes[1] -eq 0x4b) {
    return "odt-zip"
  }
  if ($Bytes.Length -ge 8 -and $Bytes[0] -eq 0xd0 -and $Bytes[1] -eq 0xcf -and $Bytes[2] -eq 0x11 -and $Bytes[3] -eq 0xe0 -and $Bytes[4] -eq 0xa1 -and $Bytes[5] -eq 0xb1 -and $Bytes[6] -eq 0x1a -and $Bytes[7] -eq 0xe1) {
    return "ole-compound-document"
  }
  return "unknown-binary"
}

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
try {
  $wpsExecutable = Resolve-WpsExecutable
  $installRoot = Split-Path -Parent (Split-Path -Parent $wpsExecutable)
  $odfNamedFiles = @(
    Get-ChildItem -LiteralPath $installRoot -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "(?i)odf|opendocument|openoffice|oasis" } |
      ForEach-Object { $_.FullName.Substring($installRoot.Length).TrimStart("\") }
  )

  $wps = New-Object -ComObject KWPS.Application
  $wps.Visible = $false
  $wps.DisplayAlerts = 0
  $build = [string]$wps.Build
  $registeredFileConverters = [int]$wps.FileConverters.Count
  $document = $wps.Documents.Open($source, $false, $true)
  $document.SaveAs2($output, 23)
  $document.Close(0)
  Close-ComObject $document
  $document = $null
  $wps.Quit()
  Close-ComObject $wps
  $wps = $null

  if (-not (Test-Path -LiteralPath $output)) {
    throw "WPS Writer did not create the SaveAs2 probe output"
  }
  $bytes = [System.IO.File]::ReadAllBytes($output)
  $outputKind = Get-OutputKind $bytes
  $headerLength = [Math]::Min(8, $bytes.Length)
  $header = if ($headerLength -gt 0) {
    ($bytes[0..($headerLength - 1)] | ForEach-Object { $_.ToString("x2") }) -join " "
  } else {
    ""
  }
  Remove-Item -LiteralPath $output -Force
  $tempOutputDeleted = -not (Test-Path -LiteralPath $output)
  $ready = $outputKind -eq "odt-zip"
  $result = [ordered]@{
    schemaVersion = 1
    stage = "E1B"
    producerId = "wps-writer"
    auditedAt = (Get-Date).ToUniversalTime().ToString("o")
    status = if ($ready) { "ready" } else { "blocked" }
    blocker = if ($ready) { $null } else { "wps-odf-add-in-missing-invalid-ole-output-rejected" }
    productVersion = (Get-Item -LiteralPath $wpsExecutable).VersionInfo.ProductVersion
    build = $build
    comProgId = "KWPS.Application"
    registeredFileConverters = $registeredFileConverters
    odfNamedComponentCount = $odfNamedFiles.Count
    odfNamedComponents = $odfNamedFiles
    saveProbe = [ordered]@{
      sourceFixture = "wps-writer.docx"
      requestedFileFormat = 23
      outputKind = $outputKind
      outputHeader = $header
      outputBytes = $bytes.Length
      tempOutputDeleted = $tempOutputDeleted
    }
  }
  [System.IO.File]::WriteAllText(
    $evidence,
    ($result | ConvertTo-Json -Depth 6) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Output ($result | ConvertTo-Json -Depth 6)
  if ($RequireReady -and -not $ready) {
    throw "WPS Writer ODF preflight blocked: SaveAs2 format 23 produced $outputKind ($header)"
  }
}
finally {
  if ($document) { try { $document.Close(0) } catch {}; Close-ComObject $document }
  if ($wps) { try { $wps.Quit() } catch {}; Close-ComObject $wps }
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
