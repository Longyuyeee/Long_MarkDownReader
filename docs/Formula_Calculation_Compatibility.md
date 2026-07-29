# XLSX Formula Calculation Compatibility

## Current Contract

X3-B1 adds a separate read-only array-formula contract. The workbook surface can identify and locate OOXML formulas explicitly declared with `t="array"`, distinguish deterministic legacy/dynamic cases, report declared and cached coverage, and explain why calculation and writeback are blocked. This does not add any array-return calculation capability to IronCalc.

X3-B2 extends that read-only contract with serialized occupancy, missing-cache, foreign-formula and potential-conflict diagnostics. WPS Spreadsheets 12.0/26895 has passed native save, application exit, independent reopen and LongEdit semantic reread; the producer matrix remains partial at 1/3 because genuine Excel and LibreOffice Calc are unavailable in the current environment.

X3-B3 adds cached-value type distribution, bounded error-cache addresses and concrete foreign-formula conflict addresses. The existing right-side workbook surface can locate the first diagnostic cell, and real Tauri light/dark evidence verifies both legacy and dynamic declarations without changing the source bytes. This remains serialized OOXML diagnosis only: expected spill calculation and array writeback are still blocked.

X3-B4 closes the locator evidence gap with a controlled derivative of the verified WPS fixture: an occupied formula at `D3` and a standard `#DIV/0!` error cache at `D4` are displayed and located independently in the real desktop surface. Diagnostic address lists retain full totals but expose at most 256 addresses with a visible truncation notice. The controlled error cache is deliberately not presented as an Excel `#SPILL!` calculation result.

X3-B5 provides the portable closure path for the two missing producers. A genuine Microsoft Excel or LibreOffice Calc machine can native-save the immutable baseline, terminate the producer, reopen it in a separate process, pass LongEdit's own semantic parser, and export an exact three-member evidence ZIP. Import requires explicit trusted-producer confirmation and rejects baseline drift, extra members, missing lifecycle gates, output digest drift, producer identity spoofing, existing-target overwrite, or LongEdit semantic drift. No external evidence has been imported on the current machine, so the public producer matrix remains partial at 1/3.

X3-B6 makes the final two-producer intake atomic at matrix level. Both bundles must independently pass the X3-B5 gates in a temporary 3/3 candidate before any checked-in fixture, manifest, matrix, or capability contract is promoted. A damaged second bundle leaves the destination at its original 1/3 state. The current environment remains blocked because the Excel COM CLSID resolves to WPS `et.exe` and LibreOffice is absent; therefore X3-B6 adds no synthetic producer claim and does not change calculation or writeback support.

S8-6A through S8-6F establish a project-owned formula calculation baseline on top of IronCalc 0.8.0. Calculation is explicit, in memory, and uses the `en` locale with the `UTC` timezone. It does not write calculated caches back to the XLSX package.

The machine-readable source of truth is `shared/xlsx-formula-capabilities.json`. A function is public only when it appears in a `verified` family and is exercised by the committed `formula-function-matrix.xlsx` fixture through both the calculation module and the Tauri command boundary.

Verified families:

| Family | Functions |
| --- | --- |
| Aggregate | `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` |
| Math | `ABS`, `ROUND` |
| Logical | `IF`, `AND`, `OR`, `NOT`, `IFERROR` |
| Text | `CONCAT`, `LEN`, `TRIM`, `UPPER` |
| Conditional aggregate | `SUMIF`, `COUNTIF`, `AVERAGEIF` |
| Lookup and reference | `VLOOKUP`, `HLOOKUP`, `INDEX`, `MATCH` |
| Multi-criteria aggregate | `SUMIFS`, `COUNTIFS`, `AVERAGEIFS` |
| Date | `DATE`, `YEAR`, `MONTH`, `DAY` |
| Modern lookup | `XLOOKUP`, `XMATCH` |
| Volatile | `OFFSET`, `INDIRECT`, `RAND`, `RANDBETWEEN`, `TODAY`, `NOW` |

Reference regressions cover same-sheet and cross-sheet references, workbook defined names, and dependency updates from unsaved cell edits.

S8-6B adds cross-sheet lookup ranges, exact and ascending approximate matching, a single-character wildcard criterion, numeric comparison criteria, text-result type preservation, `#N/A` for a missing lookup, and recovery through `IFERROR`.

S8-6C adds multiple and cross-column criteria, no-match zero results, the Excel 1900 date serial system, year/month/day extraction, leap-year handling, and invalid date input diagnostics. IronCalc 0.7.1 does not return Excel's `#VALUE!` for mismatched `*IFS` range dimensions, so mismatched range semantics remain explicitly outside the public contract.

S8-6D adds scalar `XLOOKUP` results. The real fixture covers exact and next-smaller matching, cross-sheet column ranges, row vectors, text-result type preservation, a caller-provided not-found fallback, default `#N/A`, `IFERROR` recovery, wildcard matching, reverse search, and recalculation after an unsaved dependency edit.

S8-6E adds a deliberately limited volatile subset. `OFFSET` and `INDIRECT` cover same-sheet, cross-sheet and unsaved dependency scenarios; `RAND` is verified only to return a value in `[0,1)`, `RANDBETWEEN` uses inclusive bounds, and the UTC `TODAY`/`NOW` relationship is verified. These functions run only when the user requests recalculation, their results remain in memory, and the contract does not claim Excel-equivalent automatic recalculation timing.

X3-A / S8-6F upgrades the pinned engine to IronCalc 0.8.0 and adds scalar `XMATCH`. The committed XLSX matrix covers exact lookup, forward wildcard lookup, reverse search, next-smaller and next-larger modes, row vectors, default `#N/A`, `IFERROR` recovery, and recalculation after an unsaved dependency edit. Array constants, regex mode and dynamic-array return semantics are not part of the public contract.

Before IronCalc import, the calculation boundary rejects workbooks containing multi-cell legacy array formulas, known dynamic-array functions, or real external-workbook link parts. Rejection does not modify the source package: the existing formula text and cached result remain available through normal workbook reading.

## Error Semantics

Every requested target that evaluates to an error produces one diagnostic with its original Excel error code and a stable category. S8-6A verifies direct division by zero, propagation of that error into a dependent formula, recovery through `IFERROR`, and `#NAME?` for an unknown function.

The stable categories are `division_by_zero`, `name`, `value`, `reference`, `number`, `not_available`, `circular`, and `other`. Error categories make UI and future telemetry independent from localized display messages.

## Explicit Exclusions

This baseline is not an Excel-complete formula claim. Unverified modern lookup functions, `XMATCH` array constants/regex mode, `XLOOKUP` array-return/spill results, mismatched-range `*IFS` semantics, Excel-equivalent automatic volatile timing, array formulas, dynamic arrays and spill ranges, external workbook calculation, complete range/operator equivalence, every IronCalc function, and calculated-cache persistence remain outside the public contract.

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
