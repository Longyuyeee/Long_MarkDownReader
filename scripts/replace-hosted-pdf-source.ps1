param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1') { throw 'Only a disposable hosted fixture may be replaced' }
$owned=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\'
$resolved=[IO.Path]::GetFullPath($Path)
if (-not $resolved.StartsWith($owned,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner'))) { throw 'Source replacement must stay in the owned generated fixture' }
$before=Get-Item -LiteralPath $resolved
$time=$before.LastWriteTimeUtc
$size=$before.Length
$bytes=[IO.File]::ReadAllBytes($resolved)
$bytes[$bytes.Length-2]=$bytes[$bytes.Length-2] -bxor 1
[IO.File]::WriteAllBytes($resolved,$bytes)
[IO.File]::SetLastWriteTimeUtc($resolved,$time)
$after=Get-Item -LiteralPath $resolved
if ($after.Length -ne $size -or $after.LastWriteTimeUtc.Ticks -ne $time.Ticks) { throw 'Exact size and native timestamp were not preserved' }
@{status='same-size-same-native-timestamp';beforeTicks=$time.Ticks.ToString();afterTicks=$after.LastWriteTimeUtc.Ticks.ToString();beforeBytes=$size;afterBytes=$after.Length} | ConvertTo-Json | Set-Content -LiteralPath $Report -Encoding utf8
