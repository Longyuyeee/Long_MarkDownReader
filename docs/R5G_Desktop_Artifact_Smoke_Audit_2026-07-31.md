# R5G Desktop Artifact Smoke Audit - 2026-07-31

## Conclusion

R5G is complete as a current-build desktop I/O and route smoke stage. The project remains `releaseCandidate=false`.

Current status: `current-release-built-debug-desktop-io-smoke-passed-signed-artifact-pending`.

## Evidence delivered

- Built the current `0.7.0` optimized Tauri executable with `tauri build --no-bundle`.
- Rebuilt the current Debug executable from the same source and ran it in a real Tauri WebView2 process.
- Used an isolated temporary library; no user document content was opened or copied.
- Completed TXT read, edit, save, route-away, and reopen verification.
- Completed JSON read, structured analysis, edit, save, route-away, and reopen verification.
- Mounted eleven representative right-side workspace routes without the global crash fallback.
- Exported the real desktop `window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__()` buffer.
- Captured visual evidence for the TXT and JSON save/reopen states.

Evidence lives under `docs/evidence/r5g-desktop-artifact-smoke/`.

## Product alignment

This stage moves the original daily-management and basic-editing goal from browser-preview mounting to real desktop filesystem behavior. TXT and JSON now have current-build evidence that they remain inside the shared library shell and survive save/reopen. PDF, workbook, diagrams, mind maps, graph, and canvas are covered for integrated desktop route mounting in this stage; their deeper format-specific evidence remains governed by the existing format audits.

## Performance interpretation

The recorded route values are around the intentional 420 ms minimum transition envelope implemented by the page loader. They prove that desktop route marks and exports work across the capability surfaces. They are not yet a cold-start or heavy-document performance benchmark.

## Honest artifact boundary

The current optimized Release executable was built and SHA-256 hashed, but its runtime smoke was not executed in this stage. A user-installed Long编辑 process was already active, and the production single-instance plugin correctly redirected additional launches. The audit did not terminate that user process because it could contain unsaved work.

Runtime I/O evidence therefore comes from the current Debug executable built from the same source, using the repository's isolated E2E boundary. No signed MSI/NSIS installer, installed Release runtime, Windows 10/11 VM, or rollback claim is made.

## Next stage: R5H

Build current `0.7.0` MSI and NSIS installers, refresh artifact hashes and Authenticode status, then execute installed-artifact smoke in an isolated Windows environment. Keep RC promotion blocked until signing, Windows 10/11 VM, rollback, and approval evidence pass.
