param([string]$OutputDirectory = "docs\evidence\post-v115-m1b2a-docx-object-selection")

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expectedOutput = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v115-m1b2a-docx-object-selection"))
if ($output -ne $expectedOutput) { throw "M1B2A output must remain inside $expectedOutput" }
$sourceCommit = (& git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw "Unable to resolve source commit" }

Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null
$env:LONGEDIT_M1B2A_AUDIT_OUTPUT = $output
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") m1b2a_audits_real_producer_object_inventory_and_selects_paragraph_styles -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "M1B2A real producer object inventory failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") ux33f_audits_all_producers_and_round_trips_only_safe_style_targets -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "M1B2A character style boundary regression failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") ux33h_round_trips_native_word_and_libreoffice_labels_and_keeps_wps_fields_read_only -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "M1B2A hyperlink producer boundary regression failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") c2e_reliably_saves_and_reopens_all_three_producer_copies -- --nocapture
if ($LASTEXITCODE -ne 0) { throw "M1B2A three-producer reliable save regression failed" }

$env:LONGEDIT_M1B2A_SOURCE_COMMIT = $sourceCommit
& node (Join-Path $workspace "scripts\capture-post-v115-m1b2a-docx-object-selection.mjs")
if ($LASTEXITCODE -ne 0) { throw "M1B2A evidence capture failed" }
& node (Join-Path $workspace "scripts\check-post-v115-m1b2a-docx-object-selection.mjs")
if ($LASTEXITCODE -ne 0) { throw "M1B2A evidence validation failed" }
Write-Output "M1B2A DOCX object selection audit completed: $output"
