param(
    [string]$OutputDirectory = "docs\evidence\r5i-isolated-install-lifecycle\sandbox-output",
    [switch]$Launch
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$r5hManifest = Get-Content -LiteralPath (Join-Path $repoRoot "docs/evidence/r5h-current-installers/installer-artifact-manifest.json") -Raw | ConvertFrom-Json
$currentArtifact = @($r5hManifest.artifacts | Where-Object { $_.target -eq "nsis" })
if ($currentArtifact.Count -ne 1 -or [string]$currentArtifact[0].sha256 -notmatch "^[a-f0-9]{64}$") {
    throw "R5H current NSIS hash evidence is missing or invalid."
}
$currentSha256 = [string]$currentArtifact[0].sha256
$sandboxExecutable = Join-Path $env:WINDIR "System32\WindowsSandbox.exe"
if (-not (Test-Path -LiteralPath $sandboxExecutable -PathType Leaf)) {
    throw "Windows Sandbox is unavailable. Enable Containers-DisposableClientVM or use a disposable Windows VM."
}

$hostOutput = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "docs/evidence/r5i-isolated-install-lifecycle"))
if (-not $hostOutput.StartsWith($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "R5I Sandbox output must remain under docs/evidence/r5i-isolated-install-lifecycle."
}
New-Item -ItemType Directory -Path $hostOutput -Force | Out-Null

$escapedRepo = [System.Security.SecurityElement]::Escape($repoRoot)
$escapedOutput = [System.Security.SecurityElement]::Escape($hostOutput)
$configPath = Join-Path $env:TEMP "longedit-r5i-lifecycle.wsb"
$xml = @"
<Configuration>
  <Networking>Enable</Networking>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <PrinterRedirection>Disable</PrinterRedirection>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$escapedRepo</HostFolder>
      <SandboxFolder>C:\LongEditR5IRepo</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedOutput</HostFolder>
      <SandboxFolder>C:\LongEditR5IOutput</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell -NoProfile -ExecutionPolicy Bypass -File C:\LongEditR5IRepo\scripts\run-r5i-isolated-install-lifecycle.ps1 -InstallerDirectory C:\LongEditR5IRepo\src-tauri\target\release\bundle\nsis -ExpectedCurrentSha256 $currentSha256 -OutputDirectory C:\LongEditR5IOutput -ConfirmDisposableMachine -AllowInstallerMutation</Command>
  </LogonCommand>
</Configuration>
"@
[System.IO.File]::WriteAllText($configPath, $xml, [System.Text.UTF8Encoding]::new($false))
Write-Host "R5I Windows Sandbox configuration created: $configPath"

if ($Launch) {
    Start-Process -FilePath $sandboxExecutable -ArgumentList $configPath
    Write-Host "R5I Windows Sandbox launched. Wait for lifecycle-result.json in $hostOutput."
}
