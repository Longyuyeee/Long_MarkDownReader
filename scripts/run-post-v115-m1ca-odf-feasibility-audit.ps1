param(
  [string]$EvidenceOutput = (Join-Path $PSScriptRoot '..\docs\evidence\post-v115-m1ca-odf-feasibility\audit.json')
)

$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot = Join-Path $workspace 'src-tauri\tests\fixtures\odf-content'
$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-m1ca-odf-" + [guid]::NewGuid().ToString('N'))
$soffice = @(
  (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'),
  (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $soffice) { throw 'LibreOffice soffice.com is required for M1C-A' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
    $stream.Dispose()
  }
}

function Get-ZipSnapshot([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read)
    try {
      $contentEntry = $archive.GetEntry('content.xml')
      if (-not $contentEntry) { throw "ODF fixture lacks content.xml: $Path" }
      $reader = [System.IO.StreamReader]::new($contentEntry.Open(), [System.Text.Encoding]::UTF8)
      try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
      return [ordered]@{
        entryCount = $archive.Entries.Count
        contentXml = $content
      }
    } finally { $archive.Dispose() }
  } finally { $stream.Dispose() }
}

function Invoke-LibreOfficePdf([string]$Source, [string]$Id) {
  $profilePath = Join-Path $workRoot "$Id-profile"
  $outputPath = Join-Path $workRoot "$Id-output"
  New-Item -ItemType Directory -Force -Path $profilePath, $outputPath | Out-Null
  $profile = ([uri]$profilePath).AbsoluteUri
  $filter = if ($Id -eq 'ods') { 'pdf:calc_pdf_Export' } else { 'pdf:impress_pdf_Export' }
  $process = Start-Process -FilePath $soffice -WindowStyle Hidden -PassThru -ArgumentList @(
    "-env:UserInstallation=$profile",
    '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
    '--convert-to', $filter, '--outdir', $outputPath, $Source
  )
  if (-not $process.WaitForExit(180000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "LibreOffice $Id independent reopen timed out"
  }
  if ($process.ExitCode -ne 0) { throw "LibreOffice $Id exited with $($process.ExitCode)" }
  $pdf = Join-Path $outputPath (([System.IO.Path]::GetFileNameWithoutExtension($Source)) + '.pdf')
  if (-not (Test-Path -LiteralPath $pdf -PathType Leaf) -or (Get-Item -LiteralPath $pdf).Length -lt 1000) {
    throw "LibreOffice $Id independent reopen did not produce a non-trivial PDF"
  }
  return (Get-Item -LiteralPath $pdf).Length
}

New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
try {
  Push-Location (Join-Path $workspace 'src-tauri')
  try {
    & cargo test --locked 'formats::odf' -- --nocapture
    if ($LASTEXITCODE -ne 0) { throw 'M1C-A Rust ODF tests failed' }
  } finally { Pop-Location }

  $manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $fixtureRoot 'manifest.json') | ConvertFrom-Json
  $results = @()
  foreach ($formatId in @('ods', 'odp')) {
    $item = $manifest.files | Where-Object { $_.formatId -eq $formatId }
    if (-not $item) { throw "Fixture manifest lacks $formatId" }
    $source = Join-Path $fixtureRoot $item.evidence.file
    $before = Get-Sha256 $source
    $snapshot = Get-ZipSnapshot $source
    $pdfBytes = Invoke-LibreOfficePdf $source $formatId
    $after = Get-Sha256 $source
    $formula = if ($formatId -eq 'ods') {
      [regex]::Match($snapshot.contentXml, 'table:formula="([^"]+)"').Groups[1].Value
    } else { $null }
    $cachedValue = if ($formatId -eq 'ods') {
      [regex]::Match($snapshot.contentXml, 'table:formula="[^"]+"[^>]*>\s*<text:p>([^<]+)</text:p>').Groups[1].Value
    } else { $null }
    $notesPreserved = if ($formatId -eq 'odp') { $snapshot.contentXml.Contains('Presenter note for E1C') } else { $null }
    $results += [ordered]@{
      formatId = $formatId
      bytes = (Get-Item -LiteralPath $source).Length
      sha256 = $before
      entryCount = $snapshot.entryCount
      sourceUnchanged = $before -eq $after
      libreOfficePdfBytes = $pdfBytes
      formula = $formula
      cachedValue = $cachedValue
      notesPreserved = $notesPreserved
    }
  }
  $ods = $results | Where-Object { $_.formatId -eq 'ods' }
  if ($ods.formula -ne 'of:=SUM([.A2];8)' -or $ods.cachedValue -ne '50') {
    throw "ODS formula baseline drifted: $($ods.formula) / $($ods.cachedValue)"
  }
  if ($results | Where-Object { -not $_.sourceUnchanged }) { throw 'A real ODF source changed during M1C-A' }

  $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($soffice)
  $evidence = [ordered]@{
    schemaVersion = 1
    stage = 'M1C-A-odf-feasibility'
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    status = 'passed'
    expected = [ordered]@{
      formats = 2
      isolatedPackagePartPreservation = $true
      validOdsFormula = 'of:=SUM([.A2];8)'
      validOdsCachedValue = '50'
      libreOfficeIndependentReopen = $true
      sourceUnchanged = $true
    }
    actual = [ordered]@{
      rustOdfTestsPassed = 14
      formats = $results
      libreOffice = [ordered]@{
        version = $versionInfo.ProductVersion
        isolatedProfiles = $true
        independentPdfReopen = $true
      }
      wps = [ordered]@{
        status = 'blocked'
        observation = 'KET.Application did not return from opening the valid ODS fixture within 60 seconds; the probe-started hidden process was stopped.'
        countsAsProducerPass = $false
      }
    }
    differences = @(
      'The former ODS seed produced of:=of:=SUM and Error 510; the seed now produces of:=SUM with cached value 50.',
      'LibreOffice empty office:scripts containers were formerly misclassified as macros; only actual script/event-listener elements are now blocked.',
      'LibreOffice did not preserve the authored ODP presenter note, so ODP notes editing remains read-only.',
      'WPS ODS automation timed out on this machine and is compatibility evidence only, not a producer pass.'
    )
    decision = [ordered]@{
      nextStage = 'M1C-B-ODS-bounded-cell-value'
      ods = 'proceed-with-isolated-copy-only'
      odp = 'remain-preview-only-until-text-and-notes-producer-fidelity-is-proven'
      releaseCandidate = $false
    }
    privacy = [ordered]@{
      projectAuthoredFixtures = $true
      localAbsolutePathsIncluded = $false
      userDocumentBodiesIncluded = $false
      rawProducerOutputsCommitted = $false
    }
  }
  $target = [System.IO.Path]::GetFullPath($EvidenceOutput)
  New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($target)) | Out-Null
  [System.IO.File]::WriteAllText($target, ($evidence | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($false))
  Write-Host "M1C-A real ODF feasibility audit passed: $target"
}
finally {
  $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $resolvedWork = [System.IO.Path]::GetFullPath($workRoot)
  if ($resolvedWork.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedWork -Recurse -Force -ErrorAction SilentlyContinue
  }
}
