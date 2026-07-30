# R5F Safe Tauri Runtime Audit - 2026-07-31

## Conclusion

R5F is complete. The eleven representative right-side workspace routes now mount successfully in the production browser preview without showing the global crash fallback. The project remains `releaseCandidate=false`.

Current status: `browser-preview-route-mount-smoke-passed-desktop-io-pending`.

## What changed

- Added `src/services/tauriRuntime.ts` as the centralized runtime boundary.
- Desktop `invoke` calls retain their original Tauri behavior.
- Browser-preview `invoke` attempts fail with the typed `TauriRuntimeUnavailableError` instead of reading missing internals.
- Browser-preview event registration returns a safe no-op unlisten function.
- Configuration loading restores local tab state in preview and does not call desktop configuration or autostart APIs.
- Library window-focus and drag/drop listeners are registered only in the real Tauri runtime.
- JSON, YAML, XML, TOML, temporary editing, and library command listeners now use the shared safe listener.

## Runtime evidence

Evidence is stored under `docs/evidence/r5f-safe-tauri-runtime/`.

The isolated production-preview run covered:

- daily management: `/workspace`, `/library`
- developer formats: `/text`, `/json`
- professional document surfaces: `/pdf`, `/workbook`
- visual thinking: `/diagram`, `/mindmap`, `/canvas`
- knowledge management: `/graph`
- capability governance: `/release-capabilities`

All eleven routes had an app root, a route wrapper, visible content, and no `.crash-fallback`.

## Product alignment

This stage protects the original requirement that Markdown, TXT/JSON/dev formats, PDF, workbook, diagrams, mind maps, knowledge graph, and Office/WPS-like flows behave as one coherent right-side workspace. It removes a cross-format mounting failure rather than adding another disconnected surface.

## Honest boundary

Browser preview proves route mounting and UI integration only. It does not prove native file dialogs, filesystem reads/writes, external application launch, window events, signed desktop packaging, or Windows VM compatibility. Those operations remain intentionally desktop-only.

## Next stage: R5G

Capture a real built Tauri desktop artifact smoke bundle, including representative file open/save operations and route-performance export. Keep RC promotion blocked until signed artifact, Windows 10/11 VM, rollback, and approval evidence are complete.
