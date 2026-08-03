# UI-2A Color Semantics Audit

Audit date: 2026-08-03

Baseline: `main@cecf4fb`

## Conclusion

UI-2A is complete. Workspace chrome in Workbook, PDF, WorkspaceHome, and DiagramStudio now uses theme-aware surface, border, shadow, foreground, and status tokens instead of fixed black/white alpha colors.

Document colors, spreadsheet conditional-format colors, chart palettes, PDF annotation colors, and source-editor syntax colors remain content data and were intentionally preserved.

## Delivered

- Added workspace surface, border, control, shadow, and on-accent tokens.
- Added success, warning, danger, and info tokens with background and border variants.
- Added dark and high-contrast semantic overrides.
- Migrated high-risk workspace chrome and feedback colors to the new contract.
- Added `check:ui-color-semantics` to `ci:patch-release`.

## Verification

- `npm run check:ui-color-semantics`: passed.
- `npm run check:ui-typography`: passed, 55 style sources and 0 unregistered micro-fonts.
- `npm run check:ui-shared-components`: passed.
- `npm run build`: passed.

## Next Step

Proceed to UI-2B. Introduce one shared state notice contract and migrate representative loading, empty, error, read-only, limited-editing, external-dependency, and saved feedback in the four high-risk workspaces. Do not alter file-format capability or save policy.
