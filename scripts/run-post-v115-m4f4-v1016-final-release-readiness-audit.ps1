param([string]$ArtifactRoot)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$downloadedHere = $false
if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) {
  $tempBase = [IO.Path]::GetFullPath($env:TEMP)
  $ArtifactRoot = [IO.Path]::GetFullPath((Join-Path $tempBase ("longedit-m4f4-real-artifact-33322246630-{0}" -f $PID)))
  if (-not $ArtifactRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Resolved audit temp escaped TEMP' }
  New-Item -ItemType Directory -Path $ArtifactRoot -Force | Out-Null
  & gh run download 33322246630 --repo Longyuyeee/Long_MarkDownReader --name v116-candidate-lifecycle-33322246630 --dir $ArtifactRoot
  if ($LASTEXITCODE -ne 0) { throw 'Failed to download immutable M4F-4 artifact' }
  $downloadedHere = $true
} else {
  $ArtifactRoot = (Resolve-Path -LiteralPath $ArtifactRoot).Path
}

$policyPath = Join-Path $workspace 'shared\post-v115-m4f4-v1016-final-artifact-manifest-release-readiness-policy.json'
$policy = [IO.File]::ReadAllText($policyPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
$expected = @($policy.artifacts | ForEach-Object { [ordered]@{ Name = $_.sourceFileName; Size = [long]$_.sizeBytes; Sha256 = [string]$_.sha256 } })
foreach ($item in $expected) {
  $matches = @(Get-ChildItem -LiteralPath $ArtifactRoot -Recurse -File | Where-Object Name -EQ $item.Name)
  if ($matches.Count -ne 1) { throw "Expected exactly one real $($item.Name), found $($matches.Count)" }
  $file = $matches[0]
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $signature = (Get-AuthenticodeSignature -LiteralPath $file.FullName).Status.ToString()
  if ($file.Length -ne $item.Size -or $hash -ne $item.Sha256 -or $signature -ne 'NotSigned') { throw "Real artifact verification failed: $($item.Name)" }
  Write-Output "Verified $($item.Name): $($file.Length) bytes, $hash, $signature"
}

$env:LONGEDIT_M4F4_ARTIFACT_ROOT = $ArtifactRoot
& node (Join-Path $workspace 'scripts\verify-post-v115-m4f4-v1016-real-release-assets.mjs')
if ($LASTEXITCODE -ne 0) { throw 'M4F-4 real asset verification failed' }
& node (Join-Path $workspace 'scripts\check-post-v115-m4f4-v1016-final-release-readiness.mjs')
if ($LASTEXITCODE -ne 0) { throw 'M4F-4 release readiness contract failed' }

$tag = [string]::Join('', @(& git -C $workspace tag --list v1.0.16))
$tag = $tag.Trim()
if ($tag) { throw 'v1.0.16 tag exists before M4F-5' }
$savedErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$releaseOutput = & gh release view v1.0.16 --repo Longyuyeee/Long_MarkDownReader --json tagName 2>&1
$releaseExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorAction
if ($releaseExitCode -eq 0) { throw 'v1.0.16 GitHub Release exists before M4F-5' }
if (($releaseOutput | Out-String) -notmatch 'release not found') { throw "Unexpected GitHub release lookup result: $releaseOutput" }
Write-Output 'M4F-4 real audit passed: two downloaded installers, canonical evidence, checksum, tag absence and GitHub Release absence verified.'

if ($downloadedHere) {
  $resolved = [IO.Path]::GetFullPath($ArtifactRoot)
  $tempBase = [IO.Path]::GetFullPath($env:TEMP)
  if (-not $resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to clean artifact outside TEMP' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
