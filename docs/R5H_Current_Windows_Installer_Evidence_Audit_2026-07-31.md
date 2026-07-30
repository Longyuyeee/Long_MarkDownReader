# R5H Current Windows Installer Evidence Audit - 2026-07-31

## Conclusion

R5H is complete as the current Windows installer build, hash, and signature-evidence stage. The project remains `releaseCandidate=false`.

Current status: `current-msi-nsis-built-hashed-unsigned-install-smoke-pending`.

## Evidence delivered

- Built the current `0.7.0` MSI and NSIS bundles with `npm run tauri -- build`.
- Recorded exact file names, byte sizes, UTC build times, and SHA-256 hashes.
- Queried Windows Authenticode for both installers.
- Added a repeatable PowerShell evidence capture command and a portable contract checker.
- Kept installer binaries out of Git; the committed manifest is independently checked against local artifacts whenever they are present.
- Opened no user documents and installed, upgraded, uninstalled, or replaced no application.

Evidence lives at `docs/evidence/r5h-current-installers/installer-artifact-manifest.json`.

## Current artifact result

| Target | Artifact | Size | SHA-256 | Authenticode |
| --- | --- | ---: | --- | --- |
| MSI | `Long编辑_0.7.0_x64_zh-CN.msi` | 56,332,288 bytes | `5d96de0d97cdd370554a64b512fd469bf9d197a20f87042546f1907eb5290ef1` | `NotSigned` |
| NSIS | `Long编辑_0.7.0_x64-setup.exe` | 51,989,529 bytes | `f75672d7731c5c924a00a273a3cd3b879f68e4e29d9a8f1f2a0d5d63361f3985` | `NotSigned` |

## Requirement alignment

This stage does not add another editor surface. It hardens delivery of the integrated product already aligned to the original goal: one right-side workspace for daily management and basic editing across Markdown, TXT/JSON/developer formats, PDF, workbook, diagrams, mind maps, knowledge graph, canvas, and Office/WPS-like workflows.

Reliable installers are necessary before that multi-format capability can be treated as a professional management system rather than only a source-tree build.

## Honest release boundary

Both current installers are unsigned. Neither current installer has been installed or runtime-smoked in this stage. Windows 10/11 VM, upgrade, uninstall, rollback, signature, and final approval evidence remain incomplete. These files are local engineering artifacts, not official release candidates.

## Next stage: R5I

Use an isolated Windows environment to exercise fresh install, launch, representative right-side workspace routes, TXT/JSON save and reopen, upgrade over a controlled prior build, uninstall, and rollback/recovery. Capture screenshots and machine-readable evidence without touching the user's active installation. Signing and Windows 10/11 matrix closure remain subsequent release gates.
