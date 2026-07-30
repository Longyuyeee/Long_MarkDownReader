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
$sourceCommit = ([string](& git -C $repoRoot rev-parse HEAD)).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch "^[a-fA-F0-9]{40}$") {
    throw "Unable to bind the R5K evidence bundle to the current source commit."
}
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw "Node.js is required to prepare the R5J installed-artifact smoke."
}
$nodeDirectoryItem = Get-Item -LiteralPath (Split-Path -Parent $nodeCommand.Source)
$nodeHostDirectory = if ($nodeDirectoryItem.LinkType -and $nodeDirectoryItem.Target) {
    [string]$nodeDirectoryItem.Target[0]
} else {
    $nodeDirectoryItem.FullName
}
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
$escapedNode = [System.Security.SecurityElement]::Escape($nodeHostDirectory)
$configPath = Join-Path $env:TEMP "longedit-r5i-lifecycle.wsb"
$xml = @"
<Configuration>
  <Networking>Disable</Networking>
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
    <MappedFolder>
      <HostFolder>$escapedNode</HostFolder>
      <SandboxFolder>C:\LongEditR5INode</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell -NoProfile -ExecutionPolicy Bypass -File C:\LongEditR5IRepo\scripts\run-r5i-isolated-install-lifecycle.ps1 -InstallerDirectory C:\LongEditR5IRepo\src-tauri\target\release\bundle\nsis -ExpectedCurrentSha256 $currentSha256 -NodeExecutable C:\LongEditR5INode\node.exe -InstalledSmokeScript C:\LongEditR5IRepo\scripts\capture-r5j-installed-artifact-smoke.mjs -ManagementRollbackSmokeScript C:\LongEditR5IRepo\scripts\capture-r5l-management-rollback-smoke.mjs -EvidenceExporter C:\LongEditR5IRepo\scripts\export-r5k-windows-evidence-bundle.ps1 -ExpectedSourceCommit $sourceCommit -OutputDirectory C:\LongEditR5IOutput -ConfirmDisposableMachine -AllowInstallerMutation</Command>
  </LogonCommand>
</Configuration>
"@
[System.IO.File]::WriteAllText($configPath, $xml, [System.Text.UTF8Encoding]::new($false))
Write-Host "R5I Windows Sandbox configuration created: $configPath"

if ($Launch) {
    Start-Process -FilePath $sandboxExecutable -ArgumentList $configPath
    Write-Host "R5I Windows Sandbox launched. Wait for lifecycle-result.json in $hostOutput."
}
