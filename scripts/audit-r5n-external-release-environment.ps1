$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $repoRoot "docs/evidence/r5n-external-release"
$outputPath = Join-Path $outputDirectory "environment-audit.json"
$sandbox = Get-Command WindowsSandbox.exe -ErrorAction SilentlyContinue
$signTool = Get-Command signtool.exe -ErrorAction SilentlyContinue
$hyperVCmdlet = Get-Command New-VM -ErrorAction SilentlyContinue
$vmCompute = Get-Service vmcompute -ErrorAction SilentlyContinue
$codeSigningCertificates = @(Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue | Where-Object {
    $_.HasPrivateKey -and $_.NotAfter -gt [DateTime]::UtcNow
})

$blockers = New-Object System.Collections.Generic.List[string]
if ($null -eq $sandbox -and $null -eq $hyperVCmdlet) {
    $blockers.Add("no-windows-sandbox-or-hyper-v-provisioning-command")
}
if ($null -eq $signTool) {
    $blockers.Add("windows-sdk-signtool-unavailable")
}
if ($codeSigningCertificates.Count -eq 0) {
    $blockers.Add("no-current-user-code-signing-certificate-with-private-key")
}
$blockers.Add("windows-10-disposable-runner-not-provided")
$blockers.Add("windows-11-disposable-runner-not-provided")

$result = [ordered]@{
    schemaVersion = 1
    stage = "R5N"
    capturedAt = [DateTime]::UtcNow.ToString("o")
    currentStatus = "external-release-environment-blocked"
    releaseCandidate = $false
    promotionEligible = $false
    hostInstallerMutationAllowed = $false
    environment = [ordered]@{
        windowsSandboxAvailable = $null -ne $sandbox
        hyperVProvisioningCmdletAvailable = $null -ne $hyperVCmdlet
        vmComputeServicePresent = $null -ne $vmCompute
        vmComputeServiceRunning = $null -ne $vmCompute -and $vmCompute.Status -eq "Running"
        signToolAvailable = $null -ne $signTool
        eligibleCurrentUserCodeSigningCertificateCount = $codeSigningCertificates.Count
    }
    evidence = [ordered]@{
        certificateSubjectsIncluded = $false
        certificateThumbprintsIncluded = $false
        machineNameIncluded = $false
        userNameIncluded = $false
        sourceUserContentIncluded = $false
    }
    blockers = $blockers.ToArray()
}
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
[System.IO.File]::WriteAllText(
    $outputPath,
    ($result | ConvertTo-Json -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host "R5N external release environment audit captured: $outputPath"
