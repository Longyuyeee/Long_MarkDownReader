param(
  [Parameter(Mandatory = $true)][string]$InputDirectory,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [switch]$RequireComplete
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$InputDirectory = [IO.Path]::GetFullPath($InputDirectory)
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
$sourceIds = @("microsoft-word-16", "wps-writer", "libreoffice-writer")
$expectedHeadings = [ordered]@{
  "microsoft-word-16" = "Microsoft Word Producer Fixture"
  "wps-writer" = "WPS Writer Producer Fixture"
  "libreoffice-writer" = "LibreOffice Writer Producer Fixture"
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

function Get-ProducerPids([string[]]$Names) {
  return @((Get-Process -Name $Names -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id }))
}

function Stop-NewProducerProcesses([string[]]$Names, [int[]]$Before) {
  $beforeSet = [Collections.Generic.HashSet[int]]::new()
  foreach ($id in $Before) { [void]$beforeSet.Add($id) }
  foreach ($process in @(Get-Process -Name $Names -ErrorAction SilentlyContinue)) {
    if (-not $beforeSet.Contains([int]$process.Id)) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
}

function ConvertTo-ProcessArgument([string]$Value) {
  if ($null -eq $Value -or $Value.Length -eq 0) { return '""' }
  if ($Value -notmatch '[\s"]') { return $Value }
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

function Invoke-ComWorker([string]$ProducerId, [string]$Mode, [string]$WorkerInputDirectory, [string]$WorkerOutputDirectory, [string]$Result) {
  $names = if ($ProducerId -eq "microsoft-word-16") { @("WINWORD") } else { @("wps", "wpsoffice") }
  $before = Get-ProducerPids $names
  $arguments = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $workspace "scripts\invoke-post-v115-m1b2c-docx-com-producer.ps1"),
    "-ProducerId", $ProducerId, "-Mode", $Mode, "-InputDirectory", $WorkerInputDirectory, "-OutputDirectory", $WorkerOutputDirectory, "-ResultPath", $Result
  )
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = "powershell.exe"
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.Arguments = (@($arguments | ForEach-Object { ConvertTo-ProcessArgument -Value ([string]$_) }) -join ' ')
  $process = [Diagnostics.Process]::Start($startInfo)
  try {
    if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue; throw "$ProducerId $Mode timed out" }
    if ($process.ExitCode -ne 0) {
      $detail = if (Test-Path -LiteralPath $Result) { [IO.File]::ReadAllText($Result, [Text.Encoding]::UTF8) } else { "worker report missing" }
      $stderr = $process.StandardError.ReadToEnd()
      $stdout = $process.StandardOutput.ReadToEnd()
      throw "$ProducerId $Mode failed: $detail stderr=$stderr stdout=$stdout"
    }
  }
  finally {
    Start-Sleep -Seconds 2
    Stop-NewProducerProcesses -Names $names -Before $before
  }
  return [IO.File]::ReadAllText($Result, [Text.Encoding]::UTF8) | ConvertFrom-Json
}

function Invoke-LibreOffice([string]$Executable, [string[]]$Arguments, [int]$TimeoutSeconds = 180) {
  $before = Get-ProducerPids @("soffice", "soffice.bin")
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Executable
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.Arguments = (@($Arguments | ForEach-Object { ConvertTo-ProcessArgument -Value ([string]$_) }) -join ' ')
  $process = [Diagnostics.Process]::Start($startInfo)
  try {
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue; throw "LibreOffice timed out" }
    if ($process.ExitCode -ne 0) { throw "LibreOffice exited with code $($process.ExitCode)" }
  }
  finally { Stop-NewProducerProcesses -Names @("soffice", "soffice.bin") -Before $before }
}

foreach ($sourceId in $sourceIds) {
  $candidate = Join-Path $InputDirectory "$sourceId-longedit.docx"
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Missing LongEdit output: $sourceId-longedit.docx" }
}
New-Item -ItemType Directory -Path $OutputDirectory,([IO.Path]::GetDirectoryName($ReportPath)) -Force | Out-Null
$work = Join-Path ([IO.Path]::GetTempPath()) ("longedit-m1b2c-native-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$producerResults = @()

try {
  foreach ($definition in @(
    @{ id="microsoft-word-16"; name="Microsoft Word" },
    @{ id="wps-writer"; name="WPS Writer" }
  )) {
    $producerOutput = Join-Path $OutputDirectory $definition.id
    New-Item -ItemType Directory -Path $producerOutput -Force | Out-Null
    $saveReport = Join-Path $work "$($definition.id)-save.json"
    $verifyReport = Join-Path $work "$($definition.id)-verify.json"
    $save = Invoke-ComWorker $definition.id "save" $InputDirectory $producerOutput $saveReport
    $verify = Invoke-ComWorker $definition.id "verify" $producerOutput $producerOutput $verifyReport
    $comparisons = @()
    foreach ($sourceId in $sourceIds) {
      $saved = @($save.files | Where-Object sourceId -eq $sourceId)[0]
      $reopened = @($verify.files | Where-Object sourceId -eq $sourceId)[0]
      $stable = $saved.sourceUnchanged -and $reopened.unchangedAfterRead -and
        $saved.outputSha256 -eq $reopened.sha256 -and
        $saved.metrics.firstParagraphText -eq $reopened.metrics.firstParagraphText -and
        $saved.metrics.firstParagraphStyle -eq $reopened.metrics.firstParagraphStyle -and
        $saved.metrics.paragraphCount -eq $reopened.metrics.paragraphCount -and
        $saved.metrics.tableCount -eq $reopened.metrics.tableCount -and
        $saved.metrics.inlineShapeCount -eq $reopened.metrics.inlineShapeCount -and
        $saved.metrics.sectionCount -eq $reopened.metrics.sectionCount
      $comparisons += [ordered]@{
        sourceId = $sourceId
        file = $saved.file
        expectedHeading = $expectedHeadings[$sourceId]
        sourceUnchanged = [bool]$saved.sourceUnchanged
        independentReopen = $true
        sha256 = $saved.outputSha256
        bytes = $saved.outputBytes
        saveMetrics = $saved.metrics
        reopenMetrics = $reopened.metrics
        actualStable = [bool]$stable
      }
    }
    $passed = @($comparisons | Where-Object { -not $_.actualStable }).Count -eq 0
    $producerResults += [ordered]@{
      id = $definition.id
      producer = $definition.name
      version = $save.version
      method = "Hidden automation saved three LongEdit outputs as new DOCX files; the application process exited; a second worker reopened them read-only."
      status = if ($passed) { "verified" } else { "failed" }
      files = $comparisons
    }
  }

  $soffice = @("C:\Program Files\LibreOffice\program\soffice.exe", "C:\Program Files\LibreOffice\program\soffice.com") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $soffice) { throw "LibreOffice Writer is required for M1B2C" }
  $loOutput = Join-Path $OutputDirectory "libreoffice-writer"
  $loVerify = Join-Path $work "libreoffice-verify"
  $loStaging = Join-Path $work "libreoffice-stage"
  $loSaveProfile = Join-Path $work "libreoffice-save-profile"
  $loVerifyProfile = Join-Path $work "libreoffice-verify-profile"
  New-Item -ItemType Directory -Path $loOutput,$loVerify,$loStaging,$loSaveProfile,$loVerifyProfile -Force | Out-Null
  $sourceHashes = @{}
  $stagedFiles = @()
  foreach ($sourceId in $sourceIds) {
    $input = Join-Path $InputDirectory "$sourceId-longedit.docx"
    $sourceHashes[$sourceId] = Get-Sha256 $input
    $staged = Join-Path $loStaging "$sourceId.docx"
    Copy-Item -LiteralPath $input -Destination $staged
    $stagedFiles += $staged
  }
  Invoke-LibreOffice $soffice (@(
    "-env:UserInstallation=$(([Uri]$loSaveProfile).AbsoluteUri)", "--headless", "--nologo", "--nodefault", "--nofirststartwizard", "--norestore",
    "--convert-to", "docx", "--outdir", $loOutput
  ) + $stagedFiles) 240
  $loTargets = @()
  foreach ($sourceId in $sourceIds) {
    $generated = Join-Path $loOutput "$sourceId.docx"
    $target = Join-Path $loOutput "libreoffice-writer-from-$sourceId.docx"
    Move-Item -LiteralPath $generated -Destination $target -Force
    $loTargets += $target
  }
  Invoke-LibreOffice $soffice (@(
    "-env:UserInstallation=$(([Uri]$loVerifyProfile).AbsoluteUri)", "--headless", "--nologo", "--nodefault", "--nofirststartwizard", "--norestore",
    "--convert-to", "pdf", "--outdir", $loVerify
  ) + $loTargets) 240
  $loFiles = @()
  foreach ($sourceId in $sourceIds) {
    $input = Join-Path $InputDirectory "$sourceId-longedit.docx"
    $target = Join-Path $loOutput "libreoffice-writer-from-$sourceId.docx"
    $pdf = Join-Path $loVerify "libreoffice-writer-from-$sourceId.pdf"
    $sourceUnchanged = (Get-Sha256 $input) -eq $sourceHashes[$sourceId]
    $reopenHash = Get-Sha256 $target
    $loFiles += [ordered]@{
      sourceId = $sourceId
      file = "libreoffice-writer-from-$sourceId.docx"
      expectedHeading = $expectedHeadings[$sourceId]
      sourceUnchanged = $sourceUnchanged
      independentReopen = $true
      sha256 = $reopenHash
      bytes = (Get-Item -LiteralPath $target).Length
      renderedPdfBytes = (Get-Item -LiteralPath $pdf).Length
      actualStable = $sourceUnchanged -and (Get-Item -LiteralPath $pdf).Length -gt 1000
    }
  }
  $loPassed = @($loFiles | Where-Object { -not $_.actualStable }).Count -eq 0
  $producerResults += [ordered]@{
    id = "libreoffice-writer"
    producer = "LibreOffice Writer"
    version = [string](Get-Item -LiteralPath $soffice).VersionInfo.ProductVersion
    method = "An isolated headless profile saved each LongEdit output as DOCX; a fresh profile reopened each result and rendered a non-empty PDF."
    status = if ($loPassed) { "verified" } else { "failed" }
    files = $loFiles
  }
}
finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }

$verifiedCount = @($producerResults | Where-Object status -eq "verified").Count
$allFiles = @($producerResults | ForEach-Object { $_.files })
$report = [ordered]@{
  schemaVersion = 1
  stage = "M1B2C-native-roundtrip"
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  expected = [ordered]@{ producers = 3; producerSourcePairs = 9; sourceUnchanged = $true; independentReopen = $true }
  actual = [ordered]@{ verifiedProducers = $verifiedCount; producerSourcePairs = $allFiles.Count; stablePairs = @($allFiles | Where-Object actualStable).Count }
  status = if ($verifiedCount -eq 3 -and $allFiles.Count -eq 9) { "passed" } else { "failed" }
  producers = $producerResults
  sourceUserContentIncluded = $false
  rawOfficeOutputsCommitted = $false
}
[IO.File]::WriteAllText($ReportPath, ($report | ConvertTo-Json -Depth 12) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
if ($RequireComplete -and $report.status -ne "passed") { throw "M1B2C native matrix did not reach 3 producers / 9 pairs" }
Write-Output "M1B2C native DOCX matrix: $verifiedCount/3 producers, $($allFiles.Count)/9 pairs -> $ReportPath"
