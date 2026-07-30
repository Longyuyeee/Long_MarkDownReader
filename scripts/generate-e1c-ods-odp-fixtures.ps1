param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\src-tauri\tests\fixtures\odf-content')
)

$ErrorActionPreference = 'Stop'
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-e1c-fixtures-" + [guid]::NewGuid().ToString('N'))
$script:Soffice = @(
  (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'),
  (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $script:Soffice) {
  throw 'LibreOffice soffice.com is required for E1C fixture generation.'
}

function Invoke-Conversion(
  [string]$ProfileName,
  [string]$InputPath,
  [string]$OutputDirectory,
  [string]$Filter
) {
  $profilePath = Join-Path $workRoot $ProfileName
  New-Item -ItemType Directory -Path $profilePath, $OutputDirectory -Force | Out-Null
  $profile = ([uri]$profilePath).AbsoluteUri
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $script:Soffice "-env:UserInstallation=$profile" `
      '--headless' '--nologo' '--nodefault' '--nofirststartwizard' '--norestore' `
      '--convert-to' $Filter '--outdir' $OutputDirectory $InputPath 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) {
    throw "LibreOffice failed with exit code $exitCode`: $($output -join [Environment]::NewLine)"
  }
}

function Get-Evidence([string]$Path, [string]$ExpectedText) {
  return [ordered]@{
    file = [System.IO.Path]::GetFileName($Path)
    bytes = (Get-Item -LiteralPath $Path).Length
    sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    signature = '504b'
    expectedText = $ExpectedText
    sourcePreserved = $true
  }
}

New-Item -ItemType Directory -Path $outputRoot, $workRoot -Force | Out-Null
foreach ($file in @('longedit-e1c-spreadsheet.ods', 'longedit-e1c-presentation.odp', 'manifest.json')) {
  Remove-Item -LiteralPath (Join-Path $outputRoot $file) -Force -ErrorAction SilentlyContinue
}

try {
  $fodsPath = Join-Path $workRoot 'longedit-e1c-spreadsheet.fods'
  $fods = @'
<?xml version="1.0" encoding="UTF-8"?>
<office:document
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 office:mimetype="application/vnd.oasis.opendocument.spreadsheet"
 office:version="1.3">
 <office:body><office:spreadsheet>
  <table:table table:name="Overview">
   <table:table-row>
    <table:table-cell office:value-type="string"><text:p>LongEdit E1C ODS fixture</text:p></table:table-cell>
    <table:table-cell office:value-type="string"><text:p>Status</text:p></table:table-cell>
   </table:table-row>
   <table:table-row>
    <table:table-cell office:value-type="float" office:value="42"><text:p>42</text:p></table:table-cell>
    <table:table-cell table:formula="of:=SUM([.A2];8)" office:value-type="float" office:value="50"><text:p>50</text:p></table:table-cell>
   </table:table-row>
  </table:table>
  <table:table table:name="Notes">
   <table:table-row><table:table-cell office:value-type="string"><text:p>Read-only structured preview</text:p></table:table-cell></table:table-row>
  </table:table>
 </office:spreadsheet></office:body>
</office:document>
'@
  [System.IO.File]::WriteAllText($fodsPath, $fods, [System.Text.UTF8Encoding]::new($false))

  $fodpPath = Join-Path $workRoot 'longedit-e1c-presentation.fodp'
  $fodp = @'
<?xml version="1.0" encoding="UTF-8"?>
<office:document
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
 xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 office:mimetype="application/vnd.oasis.opendocument.presentation"
 office:version="1.3">
 <office:styles>
  <style:style style:name="title" style:family="presentation"><style:text-properties fo:font-size="28pt" fo:font-weight="bold"/></style:style>
  <style:style style:name="body" style:family="presentation"><style:text-properties fo:font-size="18pt"/></style:style>
 </office:styles>
 <office:automatic-styles>
  <style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="13.333in" fo:page-height="7.5in"/></style:page-layout>
  <style:master-page style:name="Default" style:page-layout-name="pm1"/>
 </office:automatic-styles>
 <office:body><office:presentation>
  <draw:page draw:name="Overview" draw:master-page-name="Default">
   <draw:frame draw:name="Title" presentation:style-name="title" svg:x="1in" svg:y="0.8in" svg:width="11in" svg:height="1in"><draw:text-box><text:p>LongEdit E1C ODP fixture</text:p></draw:text-box></draw:frame>
   <draw:frame draw:name="Body" presentation:style-name="body" svg:x="1in" svg:y="2.2in" svg:width="10in" svg:height="3in"><draw:text-box><text:p>Structured slide preview</text:p><text:p>Search and precise location</text:p></draw:text-box></draw:frame>
   <presentation:notes><draw:page><draw:frame><draw:text-box><text:p>Presenter note for E1C</text:p></draw:text-box></draw:frame></draw:page></presentation:notes>
  </draw:page>
  <draw:page draw:name="Closure" draw:master-page-name="Default">
   <draw:frame draw:name="Title"><draw:text-box><text:p>Source remains unchanged</text:p></draw:text-box></draw:frame>
  </draw:page>
 </office:presentation></office:body>
</office:document>
'@
  [System.IO.File]::WriteAllText($fodpPath, $fodp, [System.Text.UTF8Encoding]::new($false))

  $odsOutput = Join-Path $workRoot 'ods-output'
  Invoke-Conversion 'ods-producer-profile' $fodsPath $odsOutput 'ods:calc8'
  $odsPath = Join-Path $outputRoot 'longedit-e1c-spreadsheet.ods'
  Copy-Item -LiteralPath (Join-Path $odsOutput 'longedit-e1c-spreadsheet.ods') -Destination $odsPath

  $odpOutput = Join-Path $workRoot 'odp-output'
  Invoke-Conversion 'odp-producer-profile' $fodpPath $odpOutput 'odp:impress8'
  $odpPath = Join-Path $outputRoot 'longedit-e1c-presentation.odp'
  Copy-Item -LiteralPath (Join-Path $odpOutput 'longedit-e1c-presentation.odp') -Destination $odpPath

  $odsHash = (Get-FileHash -LiteralPath $odsPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $odpHash = (Get-FileHash -LiteralPath $odpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $odsReopen = Join-Path $workRoot 'ods-reopen'
  Invoke-Conversion 'ods-reopen-profile' $odsPath $odsReopen 'pdf:calc_pdf_Export'
  $odpReopen = Join-Path $workRoot 'odp-reopen'
  Invoke-Conversion 'odp-reopen-profile' $odpPath $odpReopen 'pdf:impress_pdf_Export'
  if (-not (Test-Path -LiteralPath (Join-Path $odsReopen 'longedit-e1c-spreadsheet.pdf')) `
      -or -not (Test-Path -LiteralPath (Join-Path $odpReopen 'longedit-e1c-presentation.pdf'))) {
    throw 'Independent ODS/ODP reopen did not produce PDF evidence.'
  }
  if ($odsHash -ne (Get-FileHash -LiteralPath $odsPath -Algorithm SHA256).Hash.ToLowerInvariant() `
      -or $odpHash -ne (Get-FileHash -LiteralPath $odpPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
    throw 'An E1C source changed during independent reopen.'
  }

  $version = (& $script:Soffice '--version' 2>&1 | Select-Object -First 1).ToString().Trim()
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = 'E1C'
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    producer = [ordered]@{
      application = 'LibreOffice Calc and Impress'
      version = $version
      projectAuthoredSeeds = $true
      isolatedProfiles = $true
      independentReopen = $true
    }
    files = @(
      [ordered]@{ formatId = 'ods'; evidence = Get-Evidence $odsPath 'LongEdit E1C ODS fixture' },
      [ordered]@{ formatId = 'odp'; evidence = Get-Evidence $odpPath 'LongEdit E1C ODP fixture' }
    )
    privacy = [ordered]@{
      projectAuthoredContent = $true
      localIdentityScanned = $true
      localAbsolutePathsExcludedFromManifest = $true
    }
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $outputRoot 'manifest.json'),
    ($manifest | ConvertTo-Json -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host "Generated E1C evidence in $outputRoot"
}
finally {
  Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
}
