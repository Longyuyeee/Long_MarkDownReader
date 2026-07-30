param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\src-tauri\tests\fixtures\legacy-binary-office')
)

$ErrorActionPreference = 'Stop'
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-e2c-fixtures-" + [guid]::NewGuid().ToString('N'))
$manifestPath = Join-Path $outputRoot 'manifest.json'
$script:Soffice = @(
  (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'),
  (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $script:Soffice) {
  throw 'LibreOffice soffice.com is required for E2C fixture generation.'
}

function New-IsolatedProfile([string]$Name) {
  $path = Join-Path $workRoot $Name
  New-Item -ItemType Directory -Path $path -Force | Out-Null
  return ([uri]$path).AbsoluteUri
}

function Invoke-LibreOffice([string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $script:Soffice @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) {
    throw "LibreOffice failed with exit code $exitCode`: $($output -join [Environment]::NewLine)"
  }
}

function Invoke-Conversion(
  [string]$ProfileName,
  [string]$InputPath,
  [string]$OutputDirectory,
  [string]$Filter
) {
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  $profile = New-IsolatedProfile $ProfileName
  Invoke-LibreOffice @(
    "-env:UserInstallation=$profile",
    '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
    '--convert-to', $Filter,
    '--outdir', $OutputDirectory,
    $InputPath
  )
}

function Get-Evidence([string]$Path, [string]$Signature) {
  return [ordered]@{
    file = [System.IO.Path]::GetFileName($Path)
    bytes = (Get-Item -LiteralPath $Path).Length
    sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    signature = $Signature
  }
}

New-Item -ItemType Directory -Path $outputRoot, $workRoot -Force | Out-Null
$fixedFiles = @(
  'longedit-e2c-spreadsheet.xls',
  'longedit-e2c-spreadsheet-output.xlsx',
  'longedit-e2c-presentation.ppt',
  'longedit-e2c-presentation-output.pptx',
  'manifest.json'
)
foreach ($file in $fixedFiles) {
  Remove-Item -LiteralPath (Join-Path $outputRoot $file) -Force -ErrorAction SilentlyContinue
}

try {
  $fodsPath = Join-Path $workRoot 'longedit-e2c-spreadsheet.fods'
  $fods = @'
<?xml version="1.0" encoding="UTF-8"?>
<office:document
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 office:mimetype="application/vnd.oasis.opendocument.spreadsheet"
 office:version="1.3">
 <office:body>
  <office:spreadsheet>
   <table:table table:name="E2C Spreadsheet">
    <table:table-row>
     <table:table-cell office:value-type="string"><text:p>LongEdit E2C legacy XLS fixture</text:p></table:table-cell>
     <table:table-cell office:value-type="string"><text:p>Status</text:p></table:table-cell>
    </table:table-row>
    <table:table-row>
     <table:table-cell office:value-type="string"><text:p>Source preservation</text:p></table:table-cell>
     <table:table-cell office:value-type="string"><text:p>Verified</text:p></table:table-cell>
    </table:table-row>
    <table:table-row>
     <table:table-cell office:value-type="float" office:value="42"><text:p>42</text:p></table:table-cell>
     <table:table-cell office:value-type="float" office:value="8"><text:p>8</text:p></table:table-cell>
    </table:table-row>
   </table:table>
  </office:spreadsheet>
 </office:body>
</office:document>
'@
  [System.IO.File]::WriteAllText($fodsPath, $fods, [System.Text.UTF8Encoding]::new($false))

  $fodpPath = Join-Path $workRoot 'longedit-e2c-presentation.fodp'
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
  <style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="13.333in" fo:page-height="7.5in" style:print-orientation="landscape"/></style:page-layout>
  <style:master-page style:name="Default" style:page-layout-name="pm1"/>
 </office:automatic-styles>
 <office:body>
  <office:presentation>
   <draw:page draw:name="Slide 1" draw:master-page-name="Default">
    <draw:frame draw:name="Title" presentation:style-name="title" svg:x="1in" svg:y="0.8in" svg:width="11in" svg:height="1in"><draw:text-box><text:p>LongEdit E2C legacy PPT fixture</text:p></draw:text-box></draw:frame>
    <draw:frame draw:name="Body" presentation:style-name="body" svg:x="1in" svg:y="2.2in" svg:width="9in" svg:height="2.5in"><draw:text-box><text:p>Isolated conversion</text:p><text:p>Source digest preservation</text:p><text:p>Modern package structural reread</text:p></draw:text-box></draw:frame>
   </draw:page>
  </office:presentation>
 </office:body>
</office:document>
'@
  [System.IO.File]::WriteAllText($fodpPath, $fodp, [System.Text.UTF8Encoding]::new($false))

  $producerXls = Join-Path $workRoot 'producer-xls'
  Invoke-Conversion 'producer-xls-profile' $fodsPath $producerXls 'xls:MS Excel 97'
  $xlsPath = Join-Path $outputRoot 'longedit-e2c-spreadsheet.xls'
  Copy-Item -LiteralPath (Join-Path $producerXls 'longedit-e2c-spreadsheet.xls') -Destination $xlsPath

  $producerPpt = Join-Path $workRoot 'producer-ppt'
  Invoke-Conversion 'producer-ppt-profile' $fodpPath $producerPpt 'ppt:MS PowerPoint 97'
  $pptPath = Join-Path $outputRoot 'longedit-e2c-presentation.ppt'
  Copy-Item -LiteralPath (Join-Path $producerPpt 'longedit-e2c-presentation.ppt') -Destination $pptPath

  $xlsHashBefore = (Get-FileHash -LiteralPath $xlsPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $pptHashBefore = (Get-FileHash -LiteralPath $pptPath -Algorithm SHA256).Hash.ToLowerInvariant()

  $convertInput = Join-Path $workRoot 'conversion-input'
  New-Item -ItemType Directory -Path $convertInput -Force | Out-Null
  $isolatedXls = Join-Path $convertInput 'spreadsheet.xls'
  $isolatedPpt = Join-Path $convertInput 'presentation.ppt'
  Copy-Item -LiteralPath $xlsPath -Destination $isolatedXls
  Copy-Item -LiteralPath $pptPath -Destination $isolatedPpt

  $convertXlsx = Join-Path $workRoot 'convert-xlsx'
  Invoke-Conversion 'convert-xlsx-profile' $isolatedXls $convertXlsx 'xlsx:Calc MS Excel 2007 XML'
  $xlsxPath = Join-Path $outputRoot 'longedit-e2c-spreadsheet-output.xlsx'
  Copy-Item -LiteralPath (Join-Path $convertXlsx 'spreadsheet.xlsx') -Destination $xlsxPath

  $convertPptx = Join-Path $workRoot 'convert-pptx'
  Invoke-Conversion 'convert-pptx-profile' $isolatedPpt $convertPptx 'pptx:Impress MS PowerPoint 2007 XML'
  $pptxPath = Join-Path $outputRoot 'longedit-e2c-presentation-output.pptx'
  Copy-Item -LiteralPath (Join-Path $convertPptx 'presentation.pptx') -Destination $pptxPath

  $reopenXlsx = Join-Path $workRoot 'reopen-xlsx'
  Invoke-Conversion 'reopen-xlsx-profile' $xlsxPath $reopenXlsx 'pdf:calc_pdf_Export'
  if (-not (Test-Path -LiteralPath (Join-Path $reopenXlsx 'longedit-e2c-spreadsheet-output.pdf') -PathType Leaf)) {
    throw 'Independent XLSX reopen did not produce PDF evidence.'
  }

  $reopenPptx = Join-Path $workRoot 'reopen-pptx'
  Invoke-Conversion 'reopen-pptx-profile' $pptxPath $reopenPptx 'pdf:impress_pdf_Export'
  if (-not (Test-Path -LiteralPath (Join-Path $reopenPptx 'longedit-e2c-presentation-output.pdf') -PathType Leaf)) {
    throw 'Independent PPTX reopen did not produce PDF evidence.'
  }

  $xlsHashAfter = (Get-FileHash -LiteralPath $xlsPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $pptHashAfter = (Get-FileHash -LiteralPath $pptPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($xlsHashBefore -ne $xlsHashAfter -or $pptHashBefore -ne $pptHashAfter) {
    throw 'A legacy source changed during E2C isolated conversion.'
  }

  $version = (& $script:Soffice '--version' 2>&1 | Select-Object -First 1).ToString().Trim()
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = 'E2C'
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    producer = [ordered]@{
      application = 'LibreOffice Calc and Impress'
      version = $version
      projectAuthoredSeeds = $true
      isolatedProfiles = $true
    }
    converter = [ordered]@{
      application = 'LibreOffice Calc and Impress'
      version = $version
      isolatedInputCopies = $true
      isolatedProfiles = $true
      independentOutputReopen = $true
    }
    files = @(
      [ordered]@{
        formatId = 'legacy-xls'
        source = Get-Evidence $xlsPath 'd0cf11e0a1b11ae1'
        output = Get-Evidence $xlsxPath '504b'
        expectedText = 'LongEdit E2C legacy XLS fixture'
        sourcePreserved = $true
      },
      [ordered]@{
        formatId = 'legacy-ppt'
        source = Get-Evidence $pptPath 'd0cf11e0a1b11ae1'
        output = Get-Evidence $pptxPath '504b'
        expectedText = 'LongEdit E2C legacy PPT fixture'
        sourcePreserved = $true
      }
    )
    privacy = [ordered]@{
      projectAuthoredContent = $true
      localIdentityScanned = $true
      localAbsolutePathsExcludedFromManifest = $true
    }
  }
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host "Generated E2C evidence in $outputRoot"
}
finally {
  Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
}
