$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Run this native regression on a disposable GitHub Windows runner.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$lock = Get-Content -LiteralPath (Join-Path $repoRoot 'src-tauri/Cargo.lock') -Raw
$versionMatch = [regex]::Match($lock, '(?m)^name = "tao"\r?\nversion = "([^"]+)"')
if (-not $versionMatch.Success) { throw 'Resolved Tao version is missing' }
$fixedVersion = $versionMatch.Groups[1].Value
if ([version]$fixedVersion -lt [version]'0.37.0') { throw 'Resolved Tao still uses the old keyboard handler' }
$fixtureSource = Join-Path $PSScriptRoot 'fixtures/windows-keyboard-reentrancy.rs'
$work = Join-Path $env:RUNNER_TEMP 'longedit-keyboard-regression'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$results = @()
$resultPath = Join-Path $repoRoot 'keyboard-reentrancy-results.json'

foreach ($version in @('0.34.5', $fixedVersion)) {
    $project = Join-Path $work $version
    New-Item -ItemType Directory -Path (Join-Path $project 'src') -Force | Out-Null
    $manifest = @"
[package]
name = "longedit-keyboard-reentrancy"
version = "0.0.0"
edition = "2021"
[dependencies]
tao = "=$version"
windows-sys = { version = "0.59", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging"] }
"@
    [IO.File]::WriteAllText((Join-Path $project 'Cargo.toml'), $manifest, [Text.UTF8Encoding]::new($false))
    Copy-Item -LiteralPath $fixtureSource -Destination (Join-Path $project 'src/main.rs')
    cargo build --manifest-path (Join-Path $project 'Cargo.toml') --target-dir (Join-Path $work 'target')
    if ($LASTEXITCODE -ne 0) { throw "Failed to build Tao $version fixture" }
    $log = Join-Path $work "tao-$version.log"
    $errors = Join-Path $work "tao-$version-errors.log"
    $program = Join-Path $work 'target/debug/longedit-keyboard-reentrancy.exe'
    $process = Start-Process -FilePath $program -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errors
    if (-not $process.WaitForExit(45000)) {
        Stop-Process -Id $process.Id
        throw "Tao $version watchdog did not complete"
    }
    $process.Refresh()
    $text = (Get-Content -LiteralPath $log -Raw) + (Get-Content -LiteralPath $errors -Raw)
    $expected = if ($version -eq '0.34.5') { 42 } else { 0 }
    if ($process.ExitCode -ne $expected) { throw "Unexpected Tao $version result $($process.ExitCode). $text" }
    $results += @{ version = $version; exitCode = $process.ExitCode; output = $text.Trim() }
    @{ status = 'running'; sourceCommit = $env:GITHUB_SHA; fixedTao = $fixedVersion; results = $results } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding utf8
}

@{ status = 'passed'; sourceCommit = $env:GITHUB_SHA; fixedTao = $fixedVersion; results = $results } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding utf8
Write-Output 'Original Tao deadlock reproduced; current resolved Tao stayed responsive under concurrent key and focus messages.'
