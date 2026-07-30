# R5C Route Performance Smoke Capture Audit - 2026-07-30

## Conclusion

R5C is complete as a repeatable route-performance smoke capture path. The project remains `releaseCandidate=false`.

This step adds `shared/r5c-route-performance-smoke-policy.json`, `scripts/capture-r5c-route-performance-evidence.mjs`, `scripts/check-r5c-route-performance-smoke.mjs`, and a runtime export function at `window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__`.

## What changed

- The app can now export route performance evidence from the running desktop/webview session.
- The capture script validates the exported JSON and writes:
  - `docs/evidence/r5c-route-performance-smoke/route-performance-evidence.json`
  - `docs/evidence/r5c-route-performance-smoke/manifest.json`
- The capture script accepts UTF-8 JSON with or without a BOM, which keeps the workflow compatible with common Windows/PowerShell exports.
- The output contract explicitly forbids capturing user document content.
- The R5C gate is wired into `npm run check:format-contract`.

## How to capture real smoke evidence

1. Open a production or desktop build.
2. Navigate representative routes: workspace, library, text, JSON, PDF, workbook, diagram, mind map, graph, canvas, and release capability matrix.
3. In the app webview console, run `window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__()` and save the result as JSON.
4. Run `npm run audit:r5c-route-performance-smoke -- path/to/exported-route-performance.json`.
5. Commit the resulting `docs/evidence/r5c-route-performance-smoke/` files only after confirming the run came from the intended artifact.

## Alignment with the original product goal

The product goal is broad-format daily management with basic editing. Route performance now matters because the app needs to make PDF, workbook, diagram, mind map, knowledge graph, TXT/JSON/dev editing, and Office/WPS-like flows feel like one coherent manager instead of a pile of heavy tools.

R5C turns that expectation into a repeatable evidence flow.

## Current limits

- R5C defines and validates the capture path; it does not claim that real desktop smoke evidence has been captured yet.
- A production artifact still needs to be built and opened manually or through a later automation.
- RC promotion remains blocked until signing evidence, Windows VM evidence, and real desktop smoke evidence are complete.

## Next stage: R5D

R5D should add the actual real-run evidence bundle after a built app is opened and representative route evidence is exported.
