param(
  [Parameter(Mandatory = $true)]
  [string]$AssetRoot
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $repoRoot 'docs/evidence/v1.0.16-release/artifact-manifest.json') | ConvertFrom-Json
$receipt = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $repoRoot 'docs/evidence/v1.0.16-release/release-receipt.json') | ConvertFrom-Json
$release = gh release view v1.0.16 --repo Longyuyeee/Long_MarkDownReader --json databaseId,tagName,isDraft,isPrerelease,url,publishedAt,assets | ConvertFrom-Json
$latest = gh api repos/Longyuyeee/Long_MarkDownReader/releases/latest | ConvertFrom-Json

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
  }
  finally { $stream.Dispose() }
}

if ($release.databaseId -ne $receipt.release.databaseId -or $release.tagName -ne 'v1.0.16' -or $release.isDraft -or $release.isPrerelease) { throw 'Remote release metadata differs from the receipt.' }
if ($latest.tag_name -ne 'v1.0.16') { throw 'v1.0.16 is not the latest public release.' }
if ($release.assets.Count -ne 3) { throw "Expected 3 release assets, found $($release.assets.Count)." }

$expected = @{}
foreach ($artifact in $manifest.artifacts) { $expected[$artifact.fileName] = $artifact }
$expected[$manifest.checksumFile.fileName] = $manifest.checksumFile
$actual = @()
foreach ($asset in $release.assets) {
  $fact = $expected[$asset.name]
  if ($null -eq $fact) { throw "Unexpected remote asset: $($asset.name)" }
  $path = Join-Path $AssetRoot $asset.name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Downloaded asset is missing: $path" }
  $item = Get-Item -LiteralPath $path
  $hash = Get-Sha256 $path
  $digest = [string]$asset.digest
  if ($item.Length -ne $fact.sizeBytes -or $asset.size -ne $fact.sizeBytes -or $hash -ne $fact.sha256 -or $digest -ne "sha256:$($fact.sha256)") { throw "Remote asset verification failed: $($asset.name)" }
  $signature = if ($asset.name -match '\.(exe|msi)$') { [string](Get-AuthenticodeSignature -LiteralPath $path).Status } else { 'NotApplicable' }
  if ($asset.name -match '\.(exe|msi)$' -and $signature -ne 'NotSigned') { throw "Unexpected signature state: $($asset.name) = $signature" }
  $actual += [ordered]@{ name = $asset.name; assetId = $asset.apiUrl.Split('/')[-1]; sizeBytes = $item.Length; sha256 = $hash; authenticodeStatus = $signature }
}

[ordered]@{
  status = 'passed'
  releaseDatabaseId = $release.databaseId
  releaseUrl = $release.url
  publishedAt = $release.publishedAt
  isLatest = $true
  downloadedAssets = $actual
} | ConvertTo-Json -Depth 6
