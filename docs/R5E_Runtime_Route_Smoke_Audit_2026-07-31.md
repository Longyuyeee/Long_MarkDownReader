# R5E Runtime Route Smoke Audit - 2026-07-31

## Conclusion

R5E is complete as a browser-preview runtime route smoke blocker audit. The project remains `releaseCandidate=false`.

This step adds `shared/r5e-runtime-route-smoke-policy.json`, `scripts/check-r5e-runtime-route-smoke.mjs`, and runtime evidence under `docs/evidence/r5e-runtime-route-smoke/`.

## What changed

- The app now guards desktop-only Tauri startup integration behind `isTauriRuntime()`.
- Browser preview no longer requires Tauri internals to mount the app.
- Tauri desktop still keeps open-file event handling and launch-argument routing in the real desktop runtime.
- Runtime smoke evidence confirms the current preview run is still blocked by Tauri API coupling in store/page-level code.

## Evidence level

The evidence level is `browser-preview-runtime-smoke`.

This does not yet prove the production web bundle can route cleanly in a browser preview environment. Instead, it proves a real blocker: several runtime paths still call Tauri internals directly when the app is opened outside the desktop shell.

The blocker is useful because it prevents us from mistaking the R5D build-shape preflight for actual runtime health.

## Alignment with the original product goal

The original goal is a professional daily-management and basic-editing system across Markdown, TXT/JSON/dev formats, PDF, workbook, diagrams, mind maps, knowledge graph, and Office/WPS-like workflows.

R5E protects that goal by verifying that the major right-side workspace routes can load at runtime and expose route-performance evidence, instead of only proving that assets exist on disk.

## Current limits

- Browser-preview route smoke is blocked by Tauri API coupling outside the desktop shell.
- Signed desktop artifact smoke remains pending.
- Windows 10/11 VM evidence remains pending.
- RC promotion remains blocked until signing, VM, rollback, and signed-artifact runtime smoke evidence are complete.

## Next stage: R5F

R5F should add a centralized safe Tauri adapter or preview runtime shim so browser-preview smoke can mount representative routes without directly requiring Tauri internals.
