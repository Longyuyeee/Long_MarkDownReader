param(
    [Parameter(Mandatory=$true)][ValidateSet('Setup','Restore')][string]$Mode,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
if ($env:LONGEDIT_R5I_DISPOSABLE -ne '1' -or $env:GITHUB_ACTIONS -ne 'true') {
    throw 'Media opener fixture is restricted to the disposable hosted runner.'
}
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$workspaceRoot = [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE).TrimEnd('\') + '\'
if (-not $outputRoot.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Opener fixture output must stay in the hosted workspace.'
}
$extensionKey = 'HKCU:\Software\Classes\.ogv'
$programKey = 'HKCU:\Software\Classes\LongEdit.DisposableOpenerProbe'
$stateFile = Join-Path $outputRoot 'opener-association-state.json'
if ($Mode -eq 'Setup') {
    if (Test-Path -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.ogv\UserChoice') {
        throw 'Refusing to override a Windows UserChoice for the test extension.'
    }
    if (Test-Path -LiteralPath $programKey) { throw 'Disposable opener registration already exists.' }
    $existing = if (Test-Path -LiteralPath $extensionKey) { (Get-Item -LiteralPath $extensionKey).GetValue('') } else { $null }
    @{ previousDefault = $existing } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
    $receipt = (Join-Path $outputRoot 'opener-received-path.txt').Replace("'", "''")
    $handler = Join-Path $outputRoot 'receive-media-path.ps1'
    $handlerSource = 'param([string]$Target)' + "`r`n" + '[IO.File]::WriteAllText(''' + $receipt + ''', $Target)'
    [IO.File]::WriteAllText($handler, $handlerSource)
    New-Item -Path "$programKey\shell\open\command" -Force | Out-Null
    $program = Join-Path $PSHOME 'powershell.exe'
    $command = '"{0}" -NoProfile -WindowStyle Hidden -File "{1}" "%1"' -f $program, $handler
    Set-Item -LiteralPath "$programKey\shell\open\command" -Value $command
    New-Item -Path $extensionKey -Force | Out-Null
    Set-Item -LiteralPath $extensionKey -Value 'LongEdit.DisposableOpenerProbe'
} else {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ((Get-Item -LiteralPath $extensionKey).GetValue('') -ne 'LongEdit.DisposableOpenerProbe') {
        throw 'Refusing to restore an association changed by another process.'
    }
    if ($null -eq $state.previousDefault) {
        $writableKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Classes\.ogv', $true)
        try { $writableKey.DeleteValue('', $false) } finally { $writableKey.Dispose() }
    }
    else { Set-Item -LiteralPath $extensionKey -Value $state.previousDefault }
    # Exact disposable registry key; never remove the shared extension key.
    Remove-Item -LiteralPath $programKey -Recurse -Force
}
