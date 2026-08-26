param([string]$OutputDirectory = "docs\evidence\post-v115-m1b1a-pptx-source-save")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v115-m1b1a-pptx-source-save"))
if ($output -ne $expectedOutput) { throw "M1B1A output must remain inside $expectedOutput" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }

Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null

& node (Join-Path $workspace "scripts\check-pptx-producer-matrix.mjs")
if ($LASTEXITCODE -ne 0) { throw "PPTX producer matrix failed" }
& node (Join-Path $workspace "scripts\check-post-v115-m1b1a-pptx-source-save.mjs")
if ($LASTEXITCODE -ne 0) { throw "M1B1A contract check failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") m1b1a_reliably_overwrites_and_reopens_all_three_producer_sources -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "PPTX real producer source-save test failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") c4d_saves_text_copy_for_all_real_producers_without_overwrite -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "PPTX reliable-copy regression failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") recovers_backup_left_by_interrupted_process -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "Reliable-write interrupted recovery test failed" }

$env:LONGEDIT_M1B1A_AUDIT_OUTPUT = $output
$env:LONGEDIT_M1B1A_SOURCE_COMMIT = $sourceCommit
& node (Join-Path $workspace "scripts\capture-post-v115-m1b1a-pptx-source-save.mjs")
if ($LASTEXITCODE -ne 0) { throw "M1B1A evidence capture failed" }
Write-Output "M1B1A PPTX source-save audit completed: $output"
