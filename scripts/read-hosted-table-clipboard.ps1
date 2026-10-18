param([Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1'){throw 'Disposable hosted clipboard observation only'}
$root=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\';$target=[IO.Path]::GetFullPath($Output)
if(-not $target.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner')) -or (Test-Path -LiteralPath $target)){throw 'Only a new owned observation file is allowed'}
Add-Type -AssemblyName PresentationCore
$text=[Windows.Clipboard]::GetText([Windows.TextDataFormat]::UnicodeText)
if($text.Length -gt 1048576){throw 'Unexpected clipboard size'}
[IO.File]::WriteAllText($target,$text,[Text.UTF8Encoding]::new($false))
