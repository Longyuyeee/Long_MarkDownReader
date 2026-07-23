# XLSX Formula Calculation Compatibility

## Current Contract

S8-6A establishes a project-owned formula calculation baseline on top of IronCalc 0.7.1. Calculation is explicit, in memory, and uses the `en` locale with the `UTC` timezone. It does not write calculated caches back to the XLSX package.

The machine-readable source of truth is `shared/xlsx-formula-capabilities.json`. A function is public only when it appears in a `verified` family and is exercised by the committed `formula-function-matrix.xlsx` fixture through both the calculation module and the Tauri command boundary.

Verified families:

| Family | Functions |
| --- | --- |
| Aggregate | `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` |
| Math | `ABS`, `ROUND` |
| Logical | `IF`, `AND`, `OR`, `NOT`, `IFERROR` |
| Text | `CONCAT`, `LEN`, `TRIM`, `UPPER` |

Reference regressions cover same-sheet and cross-sheet references, workbook defined names, and dependency updates from unsaved cell edits.

## Error Semantics

Every requested target that evaluates to an error produces one diagnostic with its original Excel error code and a stable category. S8-6A verifies direct division by zero, propagation of that error into a dependent formula, recovery through `IFERROR`, and `#NAME?` for an unknown function.

The stable categories are `division_by_zero`, `name`, `value`, `reference`, `number`, `not_available`, `circular`, and `other`. Error categories make UI and future telemetry independent from localized display messages.

## Explicit Exclusions

This baseline is not an Excel-complete formula claim. Volatile recalculation timing, dynamic arrays and spill ranges, external workbook references, complete range/operator equivalence, every IronCalc function, and calculated-cache persistence remain outside the public contract until each receives its own fixture and regression evidence.

## Reproduction

Regenerate the fixture:

```powershell
cargo run --locked --manifest-path src-tauri/Cargo.toml --example generate_formula_function_fixture
```

Run the focused regressions:

```powershell
cargo test --locked --manifest-path src-tauri/Cargo.toml formats::workbook_calculation::tests::
cargo test --locked --manifest-path src-tauri/Cargo.toml formula_function_matrix_recalculates_through_command_boundary
node scripts/check-workbook-contract.mjs
```
