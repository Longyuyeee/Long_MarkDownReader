param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\docs\evidence\post-v115-m1cc-ods-formula-style')
)

$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixture = Join-Path $workspace 'src-tauri\tests\fixtures\odf-content\longedit-e1c-spreadsheet.ods'
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
$soffice = @(
  (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'),
  (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $soffice) { throw 'LibreOffice Calc is required for M1C-C.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-ZipText([string]$Path, [string]$EntryName) {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $archive.GetEntry($EntryName)
    if (-not $entry) { throw "$Path is missing $EntryName" }
    $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally { $archive.Dispose() }
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
    $stream.Dispose()
  }
}

function Invoke-LibreOffice([string]$ProfilePath, [string[]]$Arguments, [string]$FailureMessage) {
  New-Item -ItemType Directory -Path $ProfilePath -Force | Out-Null
  $profileUri = ([uri]$ProfilePath).AbsoluteUri
  $process = Start-Process -FilePath $soffice -WindowStyle Hidden -PassThru -ArgumentList (@(
    "-env:UserInstallation=$profileUri",
    '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore'
  ) + $Arguments)
  if (-not $process.WaitForExit(60000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "$FailureMessage (timed out after 60 seconds)"
  }
  if ($process.ExitCode -ne 0) { throw "$FailureMessage (exit code $($process.ExitCode))" }
}

$root = Join-Path $env:TEMP ("longedit-m1cc-{0}-{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$loOutput = Join-Path $root 'lo-output'
$loRoundtrip = Join-Path $root 'lo-roundtrip'
$loProfile = Join-Path $root 'lo-profile-export'
$loStyleProfile = Join-Path $root 'lo-profile-style'
$precedentCopy = Join-Path $root 'formula-precedent-copy.ods'
$styleProbe = Join-Path $root 'style-probe.fods'
New-Item -ItemType Directory -Path $root,$loOutput,$loRoundtrip,$loProfile -Force | Out-Null
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null

try {
  $sourceDigestBefore = Get-Sha256 $fixture
  $sourceContent = Get-ZipText $fixture 'content.xml'
  $sourceStyles = Get-ZipText $fixture 'styles.xml'
  $formulaMatch = [regex]::Match($sourceContent, 'table:formula="([^"]+)"[^>]*office:value="([^"]+)"[^>]*>\s*<text:p>([^<]+)</text:p>')
  if (-not $formulaMatch.Success) { throw 'The real ODS formula and cached value were not found.' }
  $formula = $formulaMatch.Groups[1].Value
  $cachedBefore = $formulaMatch.Groups[2].Value
  if ($formula -ne 'of:=SUM([.A2];8)' -or $cachedBefore -ne '50') {
    throw "Formula baseline drifted: $formula / $cachedBefore"
  }

  $env:LONGEDIT_M1CC_OUTPUT = $precedentCopy
  & cargo test --locked --manifest-path (Join-Path $workspace 'src-tauri\Cargo.toml') export_m1cc_formula_precedent_copy -- --ignored --nocapture
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $precedentCopy)) {
    throw 'LongEdit failed to export the isolated formula-precedent copy.'
  }
  $patchedContent = Get-ZipText $precedentCopy 'content.xml'
  if ($patchedContent -notmatch 'office:value="84\.5"[^>]*>\s*<text:p>84\.5</text:p>') {
    throw 'LongEdit did not patch Overview!A2 to 84.5.'
  }
  $patchedFormula = [regex]::Match($patchedContent, 'table:formula="([^"]+)"[^>]*office:value="([^"]+)"[^>]*>\s*<text:p>([^<]+)</text:p>')
  if ($patchedFormula.Groups[1].Value -ne $formula -or $patchedFormula.Groups[2].Value -ne '50') {
    throw 'The formula or its cached value changed during the precedent-only patch.'
  }

  Write-Output 'M1C-C: reopening the LongEdit copy in LibreOffice for formula recalculation...'
  Invoke-LibreOffice $loProfile @('--convert-to', 'csv', '--outdir', $loOutput, $precedentCopy) 'LibreOffice failed to reopen and export the formula-precedent copy.'
  $csv = Join-Path $loOutput 'formula-precedent-copy.csv'
  $csvText = Get-Content -LiteralPath $csv -Raw -Encoding UTF8
  $formulaRow = ($csvText -split "`r?`n")[1]
  $values = $formulaRow -split ',' | ForEach-Object { $_.Trim('"') }
  if ($values.Count -lt 2 -or $values[0] -ne '84.5' -or $values[1] -ne '92.5') {
    throw "LibreOffice formula recalculation mismatch: $formulaRow"
  }

  $styleNames = [regex]::Matches($sourceStyles, '<style:style\s+[^>]*style:name="([^"]+)"[^>]*style:family="table-cell"') | ForEach-Object { $_.Groups[1].Value }
  foreach ($requiredStyle in @('Default','Status','Good','Bad')) {
    if ($styleNames -notcontains $requiredStyle) { throw "Missing table-cell style: $requiredStyle" }
  }
  if ($sourceStyles -notmatch 'style:name="Good"[^>]*style:family="table-cell"[^>]*style:parent-style-name="Status"' -or
      $sourceStyles -notmatch 'style:name="Status"[^>]*style:family="table-cell"[^>]*style:parent-style-name="Default"') {
    throw 'The expected Good -> Status -> Default inheritance chain is missing.'
  }

  $probeContent = @'
<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
 <office:styles>
  <style:style style:name="Default" style:family="table-cell"/>
  <style:style style:name="Status" style:family="table-cell" style:parent-style-name="Default"/>
  <style:style style:name="Good" style:family="table-cell" style:parent-style-name="Status"><style:table-cell-properties fo:background-color="#ccffcc"/><style:text-properties fo:color="#006600"/></style:style>
 </office:styles>
 <office:automatic-styles><style:style style:name="ceLongEditProbe" style:family="table-cell" style:parent-style-name="Good"/></office:automatic-styles>
 <office:body><office:spreadsheet><table:table table:name="StyleProbe"><table:table-row><table:table-cell table:style-name="ceLongEditProbe" office:value-type="string"><text:p>LongEdit style probe</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body>
</office:document>
'@
  [System.IO.File]::WriteAllText($styleProbe, $probeContent, [System.Text.UTF8Encoding]::new($false))
  Write-Output 'M1C-C: reopening and saving the existing named-style probe in LibreOffice...'
  Invoke-LibreOffice $loStyleProfile @('--convert-to', 'xlsx', '--outdir', $loRoundtrip, $styleProbe) 'LibreOffice rejected the existing named-style probe.'
  $roundtrip = Join-Path $loRoundtrip 'style-probe.xlsx'
  $roundtripSheet = [xml](Get-ZipText $roundtrip 'xl/worksheets/sheet1.xml')
  $roundtripStyles = [xml](Get-ZipText $roundtrip 'xl/styles.xml')
  $a1 = $roundtripSheet.SelectSingleNode("//*[local-name()='c' and @r='A1']")
  if (-not $a1 -or $null -eq $a1.s) { throw 'LibreOffice XLSX output did not retain an A1 style index.' }
  $styleIndex = [int]$a1.s
  $cellFormats = $roundtripStyles.SelectNodes("//*[local-name()='cellXfs']/*[local-name()='xf']")
  if ($styleIndex -ge $cellFormats.Count) { throw 'LibreOffice XLSX output contains an invalid A1 style index.' }
  $cellFormat = $cellFormats[$styleIndex]
  $fills = $roundtripStyles.SelectNodes("//*[local-name()='fills']/*[local-name()='fill']")
  $fonts = $roundtripStyles.SelectNodes("//*[local-name()='fonts']/*[local-name()='font']")
  $fillColor = $fills[[int]$cellFormat.fillId].SelectSingleNode(".//*[local-name()='fgColor']").rgb
  $fontColor = $fonts[[int]$cellFormat.fontId].SelectSingleNode(".//*[local-name()='color']").rgb
  if ($fillColor -ne 'FFCCFFCC' -or $fontColor -ne 'FF006600') {
    throw "LibreOffice did not preserve Good style colors on A1: fill=$fillColor font=$fontColor"
  }

  $sourceDigestAfter = Get-Sha256 $fixture
  $audit = [ordered]@{
    schemaVersion = 1
    stage = 'M1C-C-ODS-formula-and-style-feasibility'
    status = 'passed'
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    expected = [ordered]@{
      sourcePrecedent = 'Overview!A2=84.5'
      storedFormula = 'of:=SUM([.A2];8)'
      storedCachedValueBeforeProducerReopen = '50'
      libreOfficeRecalculatedValue = '92.5'
      styleInheritance = 'ceLongEditProbe -> Good -> Status -> Default'
      existingNamedStyleRoundtrip = 'Good'
      sourceUnchanged = $true
    }
    actual = [ordered]@{
      formula = $patchedFormula.Groups[1].Value
      cachedValueAfterLongEditPatch = $patchedFormula.Groups[2].Value
      libreOfficeA2 = $values[0]
      libreOfficeB2 = $values[1]
      tableCellStyleCount = @($styleNames).Count
      styleInheritance = 'ceLongEditProbe -> Good -> Status -> Default'
      roundtripStyleName = 'ceLongEditProbe(Good)'
      roundtripFillColor = $fillColor
      roundtripFontColor = $fontColor
      sourceBeforeSha256 = $sourceDigestBefore
      sourceAfterSha256 = $sourceDigestAfter
      sourceUnchanged = ($sourceDigestBefore -eq $sourceDigestAfter)
    }
    differences = @(
      'LongEdit can safely patch the formula precedent while preserving the formula and its stored cache, but its immediate reread still sees the stale cached value 50.',
      'LibreOffice independently recalculates the same formula to 92.5, proving that formula editing cannot be opened without a calculation engine and cache policy.',
      'A producer-authored Flat ODF probe confirms that a content automatic table-cell style inheriting Good preserves the expected colors; ZIP transaction write-back remains a separate unproven boundary.'
    )
    decision = [ordered]@{
      stageAccepted = $true
      formulaEditingRemainsReadOnly = $true
      existingNamedStyleAssignmentCandidate = $true
      customStyleCreationCandidate = $false
      nextStage = 'M1C-D-ODS-existing-named-style-assignment'
      odpRemainsReadOnly = $true
      releaseCandidate = $false
    }
    privacy = [ordered]@{
      projectAuthoredFixture = $true
      localAbsolutePathsIncluded = $false
      userDocumentBodiesIncluded = $false
      temporaryOfficeOutputsCommitted = $false
    }
  }
  [System.IO.File]::WriteAllText((Join-Path $output 'audit.json'), ($audit | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
} finally {
  Remove-Item Env:LONGEDIT_M1CC_OUTPUT -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "M1C-C real formula and style feasibility audit completed: $output"
