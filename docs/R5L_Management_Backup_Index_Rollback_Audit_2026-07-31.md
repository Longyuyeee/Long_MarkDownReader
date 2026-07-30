# R5L Management Backup, Index, and Rollback Audit — 2026-07-31

## Outcome

R5L closes the implementation gap between installer rollback testing and the product's real management-system boundary. The disposable Windows chain can now export a redacted management backup, rebuild the knowledge index, roll back to the previous application, reinstall the current application, restore management configuration with explicit library remapping, rebuild the index again, and reopen representative TXT and JSON files in the original right-side workspace.

The runner and evidence contract are complete. This host has no disposable Windows 10/11 runner, so execution evidence is still pending and `releaseCandidate=false`.

## Defect corrected

R5J configured the test library through `LONGEDIT_E2E_LIBRARY`. That override is compiled only for debug builds, so the installed Release artifact could fall back to an empty library list. R5L writes a complete isolated `config.json` under the disposable guest's application config directory before launch. The installed app must prove that it loaded this formal configuration before any backup or route result is accepted.

## Implemented lifecycle

1. Create a fixed synthetic library and a formal configuration with one saved-search marker.
2. Install `0.6.2`, upgrade to the current `0.7.0` NSIS artifact, and launch the installed executable.
3. Complete the existing TXT/JSON edit-save-reopen smoke.
4. Export a management backup and verify its redaction, fixed entry set, and required library mapping.
5. Build the knowledge index, delete its cache, rebuild it, and require a ready index containing the synthetic sources.
6. Complete downgrade rejection, uninstall retention, previous-version rollback launch, and rollback cleanup.
7. Replace the live configuration with an intentionally empty configuration, reinstall the current artifact, and restore from the backup using the preflight fingerprint and the fixed guest library path.
8. Rebuild the knowledge index, reopen the saved TXT and JSON files in the embedded right-side workspace, uninstall again, and verify restored management data remains.

## Evidence and privacy

The portable evidence bundle now contains eight fixed members. It adds `management-backup-index-evidence.json`, which contains only backup size/digest, redaction receipt, counts, check results, and index statistics.

The actual management backup ZIP stays inside the disposable guest and is not exported. User documents, credentials, machine/user names, and absolute real-user paths remain outside the evidence boundary. Import validates every required R5L check and rejects incomplete privacy or restore evidence.

## Validation boundary

Static contract validation can prove that all commands, lifecycle transitions, exact evidence member rules, and privacy assertions are connected. It cannot prove WebView2 runtime behavior or installer behavior without a disposable Windows guest. No installer was launched and no real user knowledge library was read or changed on this host.

## Next stage: R5M

Run the integrated bundle on disposable Windows 11 and import it. Fix any guest-only issues, repeat on Windows 10, then complete signing/runtime trust and final release-candidate promotion gates. R5M should not add new document features unless runtime evidence exposes a defect; it is a release closure stage.
