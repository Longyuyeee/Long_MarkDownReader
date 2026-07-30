# R5J Installed Artifact Workspace Smoke Audit - 2026-07-31

## Conclusion

R5J has completed the installed-artifact workspace smoke implementation and disposable lifecycle integration. Execution remains pending because the current host has no disposable Windows runner. The project remains `releaseCandidate=false`.

Current status: `installed-smoke-runner-ready-disposable-execution-pending`.

## Implemented coverage

After the controlled `0.6.2 → 0.7.0` upgrade, the disposable runner can now:

- launch the actually installed `tauri-app.exe`;
- connect to its real Tauri WebView2 through an isolated debugging port;
- open TXT inside the shared right-side Library workspace, edit, save, navigate away, and reopen;
- repeat the same disk-backed flow for JSON;
- mount workspace, library, TXT, JSON, PDF, workbook, diagram, mind map, knowledge graph, canvas, and release-capability routes;
- reject any global crash fallback;
- export the installed desktop route-performance buffer;
- capture TXT and JSON save/reopen screenshots;
- hash the installed executable and link the smoke result to the approved R5H installer hash;
- stop the audited process before uninstall and continue the R5I retention checks.

## Sandbox transport

The configuration generator now maps a known Node.js runtime read-only into Windows Sandbox. The smoke client uses only Node built-ins, so the disposable guest does not need package installation or network dependency downloads.

The repository and Node runtime are read-only mappings, Sandbox networking is disabled, and only the dedicated evidence directory is writable. All TXT/JSON documents are fixed synthetic fixtures created inside the disposable guest.

## Requirement alignment

This directly validates the original product shape rather than only installer registration: daily management and basic editing remain in one right-side workspace while Markdown, TXT/JSON/developer formats, PDF, workbook, diagrams, mind maps, knowledge graph, canvas, and Office/WPS-like capability routes coexist.

TXT and JSON receive real edit/save/reopen logic in the installed-artifact smoke. The other representative surfaces receive integrated route-mount and crash-boundary checks; their deeper format behavior remains covered by the existing format-specific audits.

## Honest evidence boundary

The current host still has an existing LongEdit installation and no Windows Sandbox/VM command. The new guest runner has therefore not executed. No installed-artifact screenshot, route result, lifecycle result, Windows 10/11 matrix, signing proof, or RC promotion claim is made.

## Next stage: R5K

Execute the integrated R5I/R5J bundle on a disposable Windows 11 system and import the evidence. Then repeat the finalized install, upgrade, route, I/O, uninstall, retention, downgrade-rejection, file-association, and rollback matrix on Windows 10. Resolve any guest-only defects before signing or RC consideration.
