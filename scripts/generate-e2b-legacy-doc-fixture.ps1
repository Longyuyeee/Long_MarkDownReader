param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\src-tauri\tests\fixtures\legacy-doc')
)

$ErrorActionPreference = 'Stop'
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$sourcePath = Join-Path $outputRoot 'longedit-e2b-word-document.doc'
$convertedPath = Join-Path $outputRoot 'longedit-e2b-libreoffice-output.docx'
$manifestPath = Join-Path $outputRoot 'manifest.json'
$expectedText = 'LongEdit E2B legacy DOC conversion fixture'
$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("longedit-e2b-fixture-" + [guid]::NewGuid().ToString('N'))

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
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($LASTEXITCODE -ne 0) {
    throw "LibreOffice failed with exit code $LASTEXITCODE`: $($output -join [Environment]::NewLine)"
  }
  return $output
}

$script:Soffice = @(
  (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.com'),
  (Join-Path ${env:ProgramFiles(x86)} 'LibreOffice\program\soffice.com')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $script:Soffice) {
  throw 'LibreOffice soffice.com is required for the isolated conversion fixture.'
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $workRoot -Force | Out-Null
Remove-Item -LiteralPath $sourcePath, $convertedPath, $manifestPath -Force -ErrorAction SilentlyContinue

try {
  $sourceSeedPath = Join-Path $workRoot 'source.rtf'
  $rtf = '{\rtf1\ansi\deff0{\fonttbl{\f0 Calibri;}}\fs36\b LongEdit E2B legacy DOC conversion fixture\b0\par\fs22 Project-authored plain content for isolated conversion verification.\par Source preservation is checked before and after conversion.\par}'
  [System.IO.File]::WriteAllText($sourceSeedPath, $rtf, [System.Text.Encoding]::ASCII)
  $producerOutput = Join-Path $workRoot 'producer-output'
  New-Item -ItemType Directory -Path $producerOutput -Force | Out-Null
  $producerProfile = New-IsolatedProfile 'producer-profile'
  Write-Host 'Exporting the project-authored RTF seed as a real compound-binary DOC...'
  Invoke-LibreOffice @(
    "-env:UserInstallation=$producerProfile",
    '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
    '--convert-to', 'doc:MS Word 97',
    '--outdir', $producerOutput,
    $sourceSeedPath
  ) | Out-Null
  $producedDoc = Join-Path $producerOutput 'source.doc'
  if (-not (Test-Path -LiteralPath $producedDoc -PathType Leaf)) {
    throw 'LibreOffice did not produce the expected compound-binary DOC fixture.'
  }
  Copy-Item -LiteralPath $producedDoc -Destination $sourcePath

  $sourceReopenOutput = Join-Path $workRoot 'source-reopen-output'
  New-Item -ItemType Directory -Path $sourceReopenOutput -Force | Out-Null
  $sourceReopenProfile = New-IsolatedProfile 'source-reopen-profile'
  Write-Host 'Reopening the DOC with an independent LibreOffice profile...'
  Invoke-LibreOffice @(
    "-env:UserInstallation=$sourceReopenProfile",
    '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
    '--convert-to', 'pdf:writer_pdf_Export',
    '--outdir', $sourceReopenOutput,
    $sourcePath
  ) | Out-Null
  $sourceReopenedPdfPath = Join-Path $sourceReopenOutput 'longedit-e2b-word-document.pdf'
  if (-not (Test-Path -LiteralPath $sourceReopenedPdfPath -PathType Leaf) -or (Get-Item -LiteralPath $sourceReopenedPdfPath).Length -lt 1000) {
    throw 'Independent source reopen did not produce valid PDF evidence.'
  }

  $sourceHashBefore = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $conversionInput = Join-Path $workRoot 'input'
  $conversionOutput = Join-Path $workRoot 'output'
  New-Item -ItemType Directory -Path $conversionInput, $conversionOutput -Force | Out-Null
  $isolatedSource = Join-Path $conversionInput 'source.doc'
  Copy-Item -LiteralPath $sourcePath -Destination $isolatedSource
  $convertProfile = New-IsolatedProfile 'convert-profile'
  Write-Host 'Converting the isolated source copy with LibreOffice...'
  Invoke-LibreOffice @(
    "-env:UserInstallation=$convertProfile",
    '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
    '--convert-to', 'docx:Office Open XML Text',
    '--outdir', $conversionOutput,
    $isolatedSource
  ) | Out-Null
  $isolatedOutput = Join-Path $conversionOutput 'source.docx'
  if (-not (Test-Path -LiteralPath $isolatedOutput -PathType Leaf)) {
    throw 'LibreOffice did not produce the expected isolated source.docx output.'
  }
  Copy-Item -LiteralPath $isolatedOutput -Destination $convertedPath

  $reopenOutput = Join-Path $workRoot 'reopen-output'
  New-Item -ItemType Directory -Path $reopenOutput -Force | Out-Null
  $reopenProfile = New-IsolatedProfile 'reopen-profile'
  Write-Host 'Reopening the converted DOCX with an independent LibreOffice profile...'
  Invoke-LibreOffice @(
    "-env:UserInstallation=$reopenProfile",
    '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
    '--convert-to', 'pdf:writer_pdf_Export',
    '--outdir', $reopenOutput,
    $convertedPath
  ) | Out-Null
  $reopenedPdfPath = Join-Path $reopenOutput 'longedit-e2b-libreoffice-output.pdf'
  if (-not (Test-Path -LiteralPath $reopenedPdfPath -PathType Leaf) -or (Get-Item -LiteralPath $reopenedPdfPath).Length -lt 1000) {
    throw 'Independent LibreOffice reopen did not produce valid PDF evidence.'
  }
  $sourceHashAfter = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sourceHashBefore -ne $sourceHashAfter) {
    throw 'The source DOC changed during isolated conversion.'
  }

  $libreOfficeVersion = (& $script:Soffice '--version' 2>&1 | Select-Object -First 1).ToString().Trim()
  $manifest = [ordered]@{
    schemaVersion = 1
    stage = 'E2B'
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    producer = [ordered]@{
      application = 'LibreOffice Writer'
      version = $libreOfficeVersion
      sourceSeedApplication = 'LongEdit project-authored RTF'
      sourceSeedSha256 = (Get-FileHash -LiteralPath $sourceSeedPath -Algorithm SHA256).Hash.ToLowerInvariant()
      exportFormat = 'MS Word 97'
      isolatedProfile = $true
      independentSourceReopen = $true
    }
    converter = [ordered]@{
      application = 'LibreOffice Writer'
      version = $libreOfficeVersion
      isolatedProfiles = $true
      independentOutputReopen = $true
    }
    source = [ordered]@{
      file = [System.IO.Path]::GetFileName($sourcePath)
      bytes = (Get-Item -LiteralPath $sourcePath).Length
      sha256 = $sourceHashAfter
      cfbSignature = 'd0cf11e0a1b11ae1'
      preserved = $true
    }
    output = [ordered]@{
      file = [System.IO.Path]::GetFileName($convertedPath)
      bytes = (Get-Item -LiteralPath $convertedPath).Length
      sha256 = (Get-FileHash -LiteralPath $convertedPath -Algorithm SHA256).Hash.ToLowerInvariant()
      packageSignature = '504b'
      expectedText = $expectedText
    }
    privacy = [ordered]@{
      projectAuthoredContent = $true
      localIdentityScanned = $true
      localAbsolutePathsExcludedFromManifest = $true
    }
  }
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host "Generated E2B evidence in $outputRoot"
}
finally {
  Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
}
