param(
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath,
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-fA-F0-9]{40}$")]
    [string]$SourceCommit,
    [string]$OutputPath = "docs/evidence/u1-unsigned-internal-candidate/portable-runtime-smoke.json",
    [int]$RemoteDebugPort = 9451
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath).Path
if (-not (Test-Path -LiteralPath $resolvedExecutable -PathType Leaf)) {
    throw "U1 release executable is missing."
}
$absoluteOutput = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "docs/evidence/u1-unsigned-internal-candidate"))
if (-not $absoluteOutput.StartsWith($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "U1 smoke evidence must remain under docs/evidence/u1-unsigned-internal-candidate."
}
New-Item -ItemType Directory -Path (Split-Path -Parent $absoluteOutput) -Force | Out-Null

$existingProductProcesses = @(Get-Process -Name "tauri-app" -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -ne $resolvedExecutable } catch { $true }
})
if ($existingProductProcesses.Count -gt 0) {
    $blockedManifest = [ordered]@{
        schemaVersion = 1
        stage = "U1"
        capturedAt = (Get-Date).ToUniversalTime().ToString("o")
        sourceCommit = $SourceCommit.ToLowerInvariant()
        status = "blocked-existing-single-instance"
        existingProductProcessCount = $existingProductProcesses.Count
        executableStarted = $false
        mainWindowDetected = $false
        isolatedAppData = $true
        installerExecuted = $false
        registryMutated = $false
        sourceUserContentIncluded = $false
        releaseCandidate = $false
    }
    [System.IO.File]::WriteAllText(
        $absoluteOutput,
        ($blockedManifest | ConvertTo-Json -Depth 5),
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Output "U1 portable runtime smoke blocked by an existing LongEdit single instance: $absoluteOutput"
    return
}

$smokeRoot = Join-Path $env:TEMP ("longedit-u1-smoke-{0}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$library = Join-Path $smokeRoot "library"
$webview = Join-Path $smokeRoot "webview"
$appData = Join-Path $smokeRoot "appdata"
$localAppData = Join-Path $smokeRoot "localappdata"
New-Item -ItemType Directory -Path $library, $webview, $appData, $localAppData | Out-Null
[System.IO.File]::WriteAllText(
    (Join-Path $library "u1-smoke.txt"),
    "U1_PORTABLE_SMOKE",
    [System.Text.UTF8Encoding]::new($false)
)

$environmentNames = @(
    "APPDATA",
    "LOCALAPPDATA",
    "LONGEDIT_E2E_LIBRARY",
    "LONGEDIT_E2E_THEME",
    "LONGEDIT_E2E_STYLE",
    "LONGEDIT_E2E_CODE_THEME",
    "LONGEDIT_E2E_MOTION",
    "WEBVIEW2_USER_DATA_FOLDER",
    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"
)
$originalEnvironment = @{}
foreach ($name in $environmentNames) {
    $originalEnvironment[$name] = [System.Environment]::GetEnvironmentVariable($name, "Process")
}

$application = $null
try {
    $env:APPDATA = $appData
    $env:LOCALAPPDATA = $localAppData
    $env:LONGEDIT_E2E_LIBRARY = $library
    $env:LONGEDIT_E2E_THEME = "white"
    $env:LONGEDIT_E2E_STYLE = "minimal"
    $env:LONGEDIT_E2E_CODE_THEME = "github"
    $env:LONGEDIT_E2E_MOTION = "reduced"
    $env:WEBVIEW2_USER_DATA_FOLDER = $webview
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort --remote-allow-origins=*"

    $application = Start-Process -FilePath $resolvedExecutable -WindowStyle Hidden -PassThru
    $mainWindowDetected = $false
    for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
        $application.Refresh()
        if ($application.HasExited) {
            throw "U1 release runtime exited before creating its main window."
        }
        if ($application.MainWindowHandle -ne 0) {
            $mainWindowDetected = $true
            break
        }
        Start-Sleep -Milliseconds 100
    }
    if (-not $mainWindowDetected) {
        throw "U1 release runtime did not create its main window."
    }

    $manifest = [ordered]@{
        schemaVersion = 1
        stage = "U1"
        capturedAt = (Get-Date).ToUniversalTime().ToString("o")
        sourceCommit = $SourceCommit.ToLowerInvariant()
        status = "passed"
        executableStarted = (-not $application.HasExited)
        mainWindowDetected = $true
        debugEndpointRequired = $false
        isolatedAppData = $true
        installerExecuted = $false
        registryMutated = $false
        sourceUserContentIncluded = $false
        releaseCandidate = $false
    }

    [System.IO.File]::WriteAllText(
        $absoluteOutput,
        ($manifest | ConvertTo-Json -Depth 5),
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Output "U1 portable runtime smoke passed: $absoluteOutput"
}
finally {
    if ($application -and -not $application.HasExited) {
        Stop-Process -Id $application.Id -Force
    }
    foreach ($name in $environmentNames) {
        [System.Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], "Process")
    }
}
