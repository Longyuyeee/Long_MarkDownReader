# R5I Isolated Windows Install Lifecycle Audit - 2026-07-31

## Conclusion

R5I has completed the safe environment preflight and disposable-machine lifecycle runner. Real installer execution is truthfully blocked on this host, and the project remains `releaseCandidate=false`.

Current status: `isolated-lifecycle-runner-ready-host-execution-blocked`.

## Host audit result

- The current `0.7.0` NSIS installer and controlled previous `0.6.2` NSIS installer are both available.
- The host already has one LongEdit product registration at version `0.6.9`.
- A LongEdit application process was active during the audit.
- A hypervisor is present, but Windows Sandbox, VMware, VirtualBox, and QEMU execution commands are unavailable.
- Docker is installed in a Linux context and is not a valid Windows desktop/WebView2 isolation boundary.
- No installer, uninstaller, registry mutation, application replacement, or user-document access occurred.

The committed environment evidence is `docs/evidence/r5i-isolated-install-lifecycle/environment-audit.json`.

## Implemented lifecycle runner

The disposable Windows runner now defines and verifies:

1. clean installation of controlled previous version `0.6.2`;
2. upgrade to current version `0.7.0`;
3. first launch of the installed current application;
4. silent uninstall;
5. retention of an external knowledge-library marker and application configuration marker.

The runner refuses to execute unless both explicit mutation switches are supplied, the machine identifies as Windows Sandbox or an explicitly provisioned disposable VM, no LongEdit installation is already registered, and the current NSIS SHA-256 matches the approved R5H manifest.

The Windows Sandbox generator maps the repository read-only and maps only the evidence output folder as writable. It does not launch unless `-Launch` is explicitly supplied.

## Requirement alignment

The original goal remains one professional daily-management and basic-editing system covering Markdown, TXT/JSON/developer formats, PDF, workbook, diagrams, mind maps, knowledge graph, canvas, and Office/WPS-like workflows inside the shared right-side workspace.

R5I protects that goal at the delivery layer: upgrades and uninstalls must not damage the user's existing application, management configuration, or external knowledge libraries. This stage adds the safe lifecycle test path without making unsupported format or release claims.

## Honest evidence boundary

The lifecycle runner has not executed because this host has an existing installation and no disposable Windows runner. There is no `lifecycle-result.json`, installed-artifact route smoke, Windows 10/11 matrix result, signature proof, or RC promotion claim.

## Next stage: R5J

Run the R5I bundle in Windows Sandbox or a disposable Windows 11 VM, import the generated lifecycle result, then extend the installed artifact smoke to representative right-side routes and TXT/JSON save/reopen. Repeat the finalized lifecycle and rollback matrix on Windows 10 before considering signing and RC closure.
