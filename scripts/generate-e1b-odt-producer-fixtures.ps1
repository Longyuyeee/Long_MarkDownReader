param(
  [ValidateSet("all", "word", "wps", "libreoffice")]
  [string]$Producer = "libreoffice"
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $workspace "fixtures\docx\producers"
$fixtureRoot = Join-Path $workspace "fixtures\odt\producers"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-e1b-odt-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $fixtureRoot, $tempRoot -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Close-ComObject {
  param([object]$Value)
  if ($null -ne $Value) {
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) | Out-Null } catch {}
  }
}

function Test-OdtPackage {
  param([string]$Path, [string]$ExpectedText)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 38 -or $bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4b) {
    [System.IO.File]::Delete($Path)
    throw "ODT output is not a ZIP package: $Path"
  }
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    if ($archive.Entries.Count -lt 3 -or $archive.Entries[0].FullName -ne "mimetype") {
      throw "ODT mimetype is not the first package entry: $Path"
    }
    $mimetypeEntry = $archive.GetEntry("mimetype")
    $reader = [System.IO.StreamReader]::new($mimetypeEntry.Open(), [System.Text.Encoding]::ASCII)
    try { $mimetype = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($mimetype -ne "application/vnd.oasis.opendocument.text") {
      throw "ODT mimetype is inconsistent: $mimetype"
    }
    $contentEntry = $archive.GetEntry("content.xml")
    if (-not $contentEntry) { throw "ODT content.xml is missing" }
    $reader = [System.IO.StreamReader]::new($contentEntry.Open(), [System.Text.Encoding]::UTF8)
    try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if (-not $content.Contains($ExpectedText)) {
      throw "ODT content.xml does not contain expected producer text: $ExpectedText"
    }
  }
  catch {
    $archive.Dispose()
    [System.IO.File]::Delete($Path)
    throw
  }
  finally {
    $archive.Dispose()
  }
}

function Test-PackagePrivacy {
  param([string]$Path, [string[]]$Candidates)
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    foreach ($entry in $archive.Entries) {
      if (-not $entry.FullName.EndsWith(".xml")) { continue }
      $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
      try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
      foreach ($candidate in $Candidates | Where-Object { $_ }) {
        if ($content.IndexOf($candidate, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
          throw "ODT fixture leaked a local identity or path in $($entry.FullName)"
        }
      }
    }
  }
  finally {
    $archive.Dispose()
  }
}

function Write-Manifest {
  param(
    [string]$Id,
    [string]$ProducerName,
    [string]$ProductVersion,
    [string]$OutputPath,
    [string]$SourceFixture,
    [string]$ExpectedText
  )
  $manifestPath = Join-Path $fixtureRoot "$Id.json"
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = "E1B"
    id = $Id
    file = [System.IO.Path]::GetFileName($OutputPath)
    producer = $ProducerName
    productVersion = $ProductVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    sha256 = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    size = (Get-Item -LiteralPath $OutputPath).Length
    sourceFixture = $SourceFixture
    expectedText = $ExpectedText
    nativeOdtSave = $true
    sameProducerReopenVerified = $true
    privacySanitized = $true
  }
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 5) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Export-WordOdt {
  $id = "microsoft-word-16"
  $source = Join-Path $sourceRoot "$id.docx"
  $output = Join-Path $fixtureRoot "$id.odt"
  $expected = "Microsoft Word Producer Fixture"
  $word = $null
  $document = $null
  $verification = $null
  $localName = ""
  try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $localName = [string]$word.UserName
    $document = $word.Documents.Open($source, $false, $true)
    $document.SaveAs2($output, 23)
    $document.Close(0)
    Close-ComObject $document
    $document = $null
    $word.Quit()
    Close-ComObject $word
    $word = $null

    Test-OdtPackage $output $expected
    Test-PackagePrivacy $output @($env:USERNAME, $env:USERPROFILE, $localName, $tempRoot)

    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $verification = $word.Documents.Open($output, $false, $true)
    if (-not $verification.Content.Text.Contains($expected)) {
      throw "Microsoft Word ODT reopen did not recover expected text"
    }
    $verification.Close(0)
    Close-ComObject $verification
    $verification = $null
    $word.Quit()
    Close-ComObject $word
    $word = $null
    $version = (Get-Item "C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE").VersionInfo.ProductVersion
    Write-Manifest $id "Microsoft Word" $version $output "$id.docx" $expected
  }
  finally {
    if ($verification) { try { $verification.Close(0) } catch {}; Close-ComObject $verification }
    if ($document) { try { $document.Close(0) } catch {}; Close-ComObject $document }
    if ($word) { try { $word.Quit() } catch {}; Close-ComObject $word }
  }
}

function Export-WpsOdt {
  $id = "wps-writer"
  $source = Join-Path $sourceRoot "$id.docx"
  $output = Join-Path $fixtureRoot "$id.odt"
  $expected = "WPS Writer Producer Fixture"
  $wps = $null
  $document = $null
  $verification = $null
  $localName = ""
  $build = ""
  try {
    $wps = New-Object -ComObject KWPS.Application
    $wps.Visible = $false
    $wps.DisplayAlerts = 0
    $localName = [string]$wps.UserName
    $build = [string]$wps.Build
    $document = $wps.Documents.Open($source, $false, $true)
    $document.SaveAs2($output, 23)
    $document.Close(0)
    Close-ComObject $document
    $document = $null
    $wps.Quit()
    Close-ComObject $wps
    $wps = $null

    Test-OdtPackage $output $expected
    Test-PackagePrivacy $output @($env:USERNAME, $env:USERPROFILE, $localName, $tempRoot)

    $wps = New-Object -ComObject KWPS.Application
    $wps.Visible = $false
    $wps.DisplayAlerts = 0
    $verification = $wps.Documents.Open($output, $false, $true)
    if (-not $verification.Content.Text.Contains($expected)) {
      throw "WPS Writer ODT reopen did not recover expected text"
    }
    $verification.Close(0)
    Close-ComObject $verification
    $verification = $null
    $wps.Quit()
    Close-ComObject $wps
    $wps = $null
    Write-Manifest $id "WPS Writer" $build $output "$id.docx" $expected
  }
  finally {
    if ($verification) { try { $verification.Close(0) } catch {}; Close-ComObject $verification }
    if ($document) { try { $document.Close(0) } catch {}; Close-ComObject $document }
    if ($wps) { try { $wps.Quit() } catch {}; Close-ComObject $wps }
  }
}

function Invoke-LibreOffice {
  param([string[]]$Arguments, [string]$Prefix)
  $soffice = "C:\Program Files\LibreOffice\program\soffice.com"
  $stdout = Join-Path $tempRoot "$Prefix.stdout.log"
  $stderr = Join-Path $tempRoot "$Prefix.stderr.log"
  $process = Start-Process -FilePath $soffice -ArgumentList $Arguments -WindowStyle Hidden -Wait -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  if ($process.ExitCode -ne 0) {
    throw "LibreOffice failed with exit code $($process.ExitCode): $([System.IO.File]::ReadAllText($stderr))"
  }
}

function Export-LibreOfficeOdt {
  $id = "libreoffice-writer"
  $source = Join-Path $sourceRoot "$id.docx"
  $output = Join-Path $fixtureRoot "$id.odt"
  $expected = "LibreOffice Writer Producer Fixture"
  $profile = Join-Path $tempRoot "libreoffice-profile"
  $reopenProfile = Join-Path $tempRoot "libreoffice-reopen-profile"
  $reopen = Join-Path $tempRoot "libreoffice-reopen"
  New-Item -ItemType Directory -Path $profile, $reopenProfile, $reopen -Force | Out-Null
  $profileUri = ([System.Uri]$profile).AbsoluteUri
  $reopenProfileUri = ([System.Uri]$reopenProfile).AbsoluteUri
  Invoke-LibreOffice @(
    "--headless", "--nologo", "--nodefault", "--nofirststartwizard",
    "-env:UserInstallation=$profileUri",
    "--convert-to", "odt:writer8", "--outdir", $fixtureRoot, $source
  ) "convert"
  Test-OdtPackage $output $expected
  Test-PackagePrivacy $output @($env:USERNAME, $env:USERPROFILE, $tempRoot)
  Invoke-LibreOffice @(
    "--headless", "--nologo", "--nodefault", "--nofirststartwizard",
    "-env:UserInstallation=$reopenProfileUri",
    "--convert-to", "txt:Text", "--outdir", $reopen, $output
  ) "reopen"
  $reopenedText = [System.IO.File]::ReadAllText((Join-Path $reopen "$id.txt"))
  if (-not $reopenedText.Contains($expected)) {
    throw "LibreOffice ODT reopen did not recover expected text"
  }
  $version = (Get-Item "C:\Program Files\LibreOffice\program\soffice.bin").VersionInfo.ProductVersion
  Write-Manifest $id "LibreOffice Writer" $version $output "$id.docx" $expected
}

try {
  if ($Producer -in @("all", "word")) { Export-WordOdt }
  if ($Producer -in @("all", "wps")) { Export-WpsOdt }
  if ($Producer -in @("all", "libreoffice")) { Export-LibreOfficeOdt }
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
