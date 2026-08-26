param([string]$OutputDirectory = "docs\evidence\post-v115-m1b0-office-object-baseline")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v115-m1b0-office-object-baseline"))
if ($output -ne $expectedOutput) { throw "M1B0 output must remain inside $expectedOutput" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }

Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null

& node (Join-Path $workspace "scripts\check-docx-producer-matrix.mjs")
if ($LASTEXITCODE -ne 0) { throw "DOCX producer matrix failed" }
& node (Join-Path $workspace "scripts\check-pptx-producer-matrix.mjs")
if ($LASTEXITCODE -ne 0) { throw "PPTX producer matrix failed" }
& node (Join-Path $workspace "scripts\check-post-v115-m1b0-office-object-baseline.mjs")
if ($LASTEXITCODE -ne 0) { throw "M1B0 contract check failed" }

& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") tracks_complete_docx_producer_evidence -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "DOCX real producer parse test failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") parses_all_real_pptx_producer_fixtures -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "PPTX real producer parse test failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") c2e_reliably_saves_and_reopens_all_three_producer_copies -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "DOCX real producer save/reopen test failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") c4d_saves_text_copy_for_all_real_producers_without_overwrite -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "PPTX real producer save/reopen test failed" }

$env:LONGEDIT_M1B0_AUDIT_OUTPUT = $output
$env:LONGEDIT_M1B0_SOURCE_COMMIT = $sourceCommit
& node (Join-Path $workspace "scripts\capture-post-v115-m1b0-office-object-baseline.mjs")
if ($LASTEXITCODE -ne 0) { throw "M1B0 evidence capture failed" }
Write-Output "M1B0 Office object baseline audit completed: $output"
