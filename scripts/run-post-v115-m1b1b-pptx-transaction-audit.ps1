param([string]$OutputDirectory = "docs\evidence\post-v115-m1b1b-pptx-transaction")
$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$expected = [IO.Path]::GetFullPath((Join-Path $workspace "docs\evidence\post-v115-m1b1b-pptx-transaction"))
if ($output -ne $expected) { throw "M1B1B output must remain inside $expected" }
$commit = (& git -C $workspace rev-parse HEAD).Trim()
Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $output -Force | Out-Null
& node (Join-Path $workspace "scripts\check-pptx-producer-matrix.mjs"); if ($LASTEXITCODE -ne 0) { throw "Producer matrix failed" }
& node (Join-Path $workspace "scripts\check-post-v115-m1b1b-pptx-transaction.mjs"); if ($LASTEXITCODE -ne 0) { throw "M1B1B contract failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") m1b1b_saves_deterministic_text_and_slide_transactions_for_real_producers -- --nocapture; if ($LASTEXITCODE -ne 0) { throw "Real transaction test failed" }
& cargo test --locked --manifest-path (Join-Path $workspace "src-tauri\Cargo.toml") m1b1a_reliably_overwrites_and_reopens_all_three_producer_sources -- --nocapture; if ($LASTEXITCODE -ne 0) { throw "Single-operation regression failed" }
$env:LONGEDIT_M1B1B_AUDIT_OUTPUT=$output; $env:LONGEDIT_M1B1B_SOURCE_COMMIT=$commit
& node (Join-Path $workspace "scripts\capture-post-v115-m1b1b-pptx-transaction.mjs"); if ($LASTEXITCODE -ne 0) { throw "Evidence capture failed" }
Write-Output "M1B1B PPTX transaction audit completed: $output"
