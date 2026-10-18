param([Parameter(Mandatory=$true)][string]$OwnerRoot,[Parameter(Mandatory=$true)][string]$TextFile)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:LONGEDIT_R5I_DISPOSABLE -ne '1'){throw 'Clipboard changes are allowed only in the disposable hosted Windows test'}
$root=[IO.Path]::GetFullPath($OwnerRoot).TrimEnd('\')+'\';$file=[IO.Path]::GetFullPath($TextFile)
if(-not $file.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath (Join-Path $OwnerRoot '.v119-installed-owner')) -or (Get-Item -LiteralPath $file).Length -gt 1MB){throw 'Only the small owned synthetic writing fixture may enter the isolated clipboard'}
if([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA'){throw 'An STA test process is required'}
Add-Type -AssemblyName PresentationCore
[Windows.Clipboard]::SetText([IO.File]::ReadAllText($file),[Windows.TextDataFormat]::UnicodeText)
Write-Output 'Owned synthetic Unicode clipboard is ready; the test must use a real paste key next.'
