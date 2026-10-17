param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1') { throw 'Disposable hosted fixture only' }
$root=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\'
$file=[IO.Path]::GetFullPath($Archive)
if (-not $file.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner'))) { throw 'Archive must belong to the generated fixture' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($file)
try {
  $manifestEntry=$zip.GetEntry('manifest.json')
  if (-not $manifestEntry -or $manifestEntry.Length -gt 4194304) { throw 'Bounded manifest required' }
  $reader=[IO.StreamReader]::new($manifestEntry.Open(),[Text.Encoding]::UTF8)
  try { $manifest=$reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  if ($manifest.kind -ne 'longedit-library-content' -or $manifest.schemaVersion -ne 1 -or $manifest.entries.Count -gt 10000) { throw 'Wrong package kind/schema/count' }
  $entries=@()
  foreach ($item in $manifest.entries) {
    $entry=$zip.GetEntry($item.path)
    if (-not $entry -or $entry.Length -ne $item.bytes -or $entry.Length -gt 134217728) { throw 'Member size mismatch' }
    $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
    try { $digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose();$stream.Dispose() }
    if ($digest -ne $item.sha256) { throw 'Independent ZIP member digest mismatch' }
    $entries+=@{path=$item.path;bytes=$entry.Length;sha256=$digest}
  }
  if ($zip.Entries.Count -ne $entries.Count+1) { throw 'Unexpected ZIP members' }
  [ordered]@{status='passed';reader='dotnet-system-io-compression-independent-no-extraction';archive=$file;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant();manifest=$manifest;entries=$entries;nativeBridgeMocked=$false;sourceUserContentIncluded=$false} | ConvertTo-Json -Depth 24 | Set-Content -LiteralPath $Report -Encoding UTF8
} finally { $zip.Dispose() }
