param([string]$OutputDirectory = "docs\evidence\post-v115-m1a4b1-xlsx-object-transaction")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v115-m1a4b1-xlsx-object-transaction"))
if ($output -ne $expectedOutput) { throw "M1A4B1 output must remain inside $expectedOutput" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }

& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") writes_cell_conditional_format_and_table_drafts_in_one_transaction -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "M1A4B1 transactional XLSX test failed" }
& node (Join-Path $workspace "scripts\check-post-v115-m1a4b1-xlsx-object-transaction.mjs")
if ($LASTEXITCODE -ne 0) { throw "M1A4B1 contract check failed" }

Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null
$evidence = [ordered]@{
  schemaVersion = 1
  stage = "M1A4B1"
  sourceCommit = $sourceCommit
  expected = [ordered]@{
    cellValue = "88"
    conditionalFormula = "80"
    tableName = "ProgressTable"
    combinedAtomicWrite = $true
    staleSignatureRejected = $true
    staleAttemptLeavesBytesUnchanged = $true
  }
  beforeActual = [ordered]@{
    separateImmediateCommands = 3
    combinedAtomicWrite = $false
    frontendObjectDrafts = $false
  }
  afterActual = [ordered]@{
    testPassed = $true
    cellValueReopened = "88"
    conditionalFormulaReopened = "80"
    tableReopened = "ProgressTable"
    staleSignatureRejected = $true
    staleAttemptLeavesBytesUnchanged = $true
    singleReliableWriteImplementation = $true
    frontendObjectDrafts = $false
  }
  differenceResolved = $true
  deferred = [ordered]@{ frontendObjectDraftsUndoExplicitSave = "M1A4B2" }
  sourceUserContentIncluded = $false
  releaseCandidate = $false
}
$utf8 = [Text.UTF8Encoding]::new($false)
$evidencePath = Join-Path $output "transaction-evidence.json"
[IO.File]::WriteAllText($evidencePath, (($evidence | ConvertTo-Json -Depth 10) + "`n"), $utf8)
$sha = [Security.Cryptography.SHA256]::Create()
try { $evidenceHash = ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($evidencePath)))).Replace("-", "").ToLowerInvariant() }
finally { $sha.Dispose() }
$manifest = [ordered]@{ schemaVersion = 1; stage = "M1A4B1"; status = "accepted"; sourceCommit = $sourceCommit; evidenceFile = "transaction-evidence.json"; evidenceSha256 = $evidenceHash; sourceUserContentIncluded = $false; releaseCandidate = $false }
[IO.File]::WriteAllText((Join-Path $output "manifest.json"), (($manifest | ConvertTo-Json -Depth 10) + "`n"), $utf8)
Write-Output "M1A4B1 XLSX object transaction audit completed: $output"
