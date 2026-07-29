param(
  [switch]$RequireReady
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workspace "fixtures\docx\producers\wps-writer.docx"
$evidence = Join-Path $workspace "fixtures\odt\producers\wps-writer-blocker.json"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-e1b-wps-odf-" + [guid]::NewGuid().ToString("N"))
$wps = $null

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

function Get-OutputInfo {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return [ordered]@{
      outputKind = "missing"
      outputHeader = ""
      outputBytes = 0
    }
  }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $headerLength = [Math]::Min(8, $bytes.Length)
  $header = if ($headerLength -gt 0) {
    ($bytes[0..($headerLength - 1)] | ForEach-Object { $_.ToString("x2") }) -join " "
  } else {
    ""
  }
  $outputKind = "unknown-binary"
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4b) {
    $outputKind = "non-odt-zip"
    $stream = $null
    $archive = $null
    $reader = $null
    try {
      Add-Type -AssemblyName System.IO.Compression
      $stream = [System.IO.File]::OpenRead($Path)
      $archive = [System.IO.Compression.ZipArchive]::new(
        $stream,
        [System.IO.Compression.ZipArchiveMode]::Read,
        $false
      )
      $mimetypeEntry = $archive.GetEntry("mimetype")
      if ($mimetypeEntry) {
        $reader = [System.IO.StreamReader]::new($mimetypeEntry.Open(), [System.Text.Encoding]::ASCII)
        if ($reader.ReadToEnd() -eq "application/vnd.oasis.opendocument.text") {
          $outputKind = "odt-zip"
        }
      }
    }
    catch {
      $outputKind = "invalid-zip"
    }
    finally {
      if ($reader) { $reader.Dispose() }
      if ($archive) { $archive.Dispose() }
      if ($stream) { $stream.Dispose() }
    }
  }
  if ($Bytes.Length -ge 8 -and $Bytes[0] -eq 0xd0 -and $Bytes[1] -eq 0xcf -and $Bytes[2] -eq 0x11 -and $Bytes[3] -eq 0xe0 -and $Bytes[4] -eq 0xa1 -and $Bytes[5] -eq 0xb1 -and $Bytes[6] -eq 0x1a -and $Bytes[7] -eq 0xe1) {
    $outputKind = "ole-compound-document"
  }
  return [ordered]@{
    outputKind = $outputKind
    outputHeader = $header
    outputBytes = $bytes.Length
  }
}

function Get-WpsTypeLibraryRegistration {
  $classesRoot = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::ClassesRoot,
    [Microsoft.Win32.RegistryView]::Registry32
  )
  try {
    $classKey = $classesRoot.OpenSubKey("CLSID\{000209FF-0000-4b30-A977-D214852036FF}\TypeLib")
    if (-not $classKey) { throw "WPS Writer COM TypeLib registration is missing" }
    try { $typeLibraryId = [string]$classKey.GetValue("") } finally { $classKey.Dispose() }
    $version = "3.0"
    $libraryKey = $classesRoot.OpenSubKey("TypeLib\$typeLibraryId\$version\0\win32")
    if (-not $libraryKey) { throw "WPS Writer COM TypeLib path is missing" }
    try { $libraryPath = [string]$libraryKey.GetValue("") } finally { $libraryKey.Dispose() }
    $libraryText = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($libraryPath))
    return [ordered]@{
      id = $typeLibraryId
      version = $version
      file = [System.IO.Path]::GetFileName($libraryPath)
      saveFormatName = "wdFormatOpenDocumentText"
      saveFormatSymbolPresent = $libraryText.Contains("wdFormatOpenDocumentText")
      saveFormatValue = 23
    }
  }
  finally {
    $classesRoot.Dispose()
  }
}

function Invoke-SaveProbe {
  param(
    [object]$Application,
    [string]$Name,
    [string]$Method,
    [int]$FileFormat
  )
  $probeOutput = Join-Path $tempRoot ($Name + ".odt")
  $probeDocument = $null
  $exceptionType = $null
  $exceptionHResult = $null
  try {
    $probeDocument = $Application.Documents.Open($source, $false, $true)
    if ($Method -eq "SaveAs2" -and $FileFormat -ge 0) {
      $probeDocument.SaveAs2($probeOutput, $FileFormat)
    } elseif ($Method -eq "SaveAs" -and $FileFormat -ge 0) {
      $probeDocument.SaveAs($probeOutput, $FileFormat)
    } elseif ($Method -eq "SaveAs2") {
      $probeDocument.SaveAs2($probeOutput)
    } else {
      throw "Unsupported WPS save probe method"
    }
  }
  catch {
    $exceptionType = $_.Exception.GetType().FullName
    $exceptionHResult = "0x{0:x8}" -f ([uint32]$_.Exception.HResult)
  }
  finally {
    if ($probeDocument) {
      try { $probeDocument.Close(0) } catch {}
      Close-ComObject $probeDocument
    }
  }
  $outputInfo = Get-OutputInfo $probeOutput
  if (Test-Path -LiteralPath $probeOutput) {
    Remove-Item -LiteralPath $probeOutput -Force
  }
  return [ordered]@{
    name = $Name
    method = $Method
    requestedFileFormat = if ($FileFormat -ge 0) { $FileFormat } else { $null }
    outputKind = $outputInfo.outputKind
    outputHeader = $outputInfo.outputHeader
    outputBytes = $outputInfo.outputBytes
    exceptionType = $exceptionType
    exceptionHResult = $exceptionHResult
    tempOutputDeleted = -not (Test-Path -LiteralPath $probeOutput)
  }
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
  $typeLibrary = Get-WpsTypeLibraryRegistration
  $saveProbes = @(
    Invoke-SaveProbe $wps "save-as2-format-23" "SaveAs2" 23
    Invoke-SaveProbe $wps "save-as-format-23" "SaveAs" 23
    Invoke-SaveProbe $wps "save-as2-extension-inference" "SaveAs2" -1
  )
  $wps.Quit()
  Close-ComObject $wps
  $wps = $null

  $ready = @($saveProbes | Where-Object { $_.outputKind -eq "odt-zip" }).Count -gt 0
  $result = [ordered]@{
    schemaVersion = 2
    stage = "E1B"
    producerId = "wps-writer"
    auditedAt = (Get-Date).ToUniversalTime().ToString("o")
    status = if ($ready) { "ready" } else { "blocked" }
    blocker = if ($ready) { $null } else { "wps-odf-add-in-missing-invalid-ole-output-rejected" }
    productVersion = (Get-Item -LiteralPath $wpsExecutable).VersionInfo.ProductVersion
    build = $build
    comProgId = "KWPS.Application"
    comTypeLibrary = $typeLibrary
    registeredFileConverters = $registeredFileConverters
    odfNamedComponentCount = $odfNamedFiles.Count
    odfNamedComponents = $odfNamedFiles
    saveProbeSource = [ordered]@{
      sourceFixture = "wps-writer.docx"
    }
    saveProbes = $saveProbes
  }
  [System.IO.File]::WriteAllText(
    $evidence,
    ($result | ConvertTo-Json -Depth 6) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Output ($result | ConvertTo-Json -Depth 6)
  if ($RequireReady -and -not $ready) {
    $summary = ($saveProbes | ForEach-Object { "$($_.name)=$($_.outputKind)" }) -join ", "
    throw "WPS Writer ODF preflight blocked: $summary"
  }
}
finally {
  if ($wps) { try { $wps.Quit() } catch {}; Close-ComObject $wps }
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
