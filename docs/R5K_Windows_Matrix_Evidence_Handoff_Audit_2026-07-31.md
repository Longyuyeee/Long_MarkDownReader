# R5K Windows Matrix Evidence Handoff Audit - 2026-07-31

## Conclusion

R5K has completed the disposable Windows lifecycle-matrix implementation and portable evidence handoff. Real VM results remain pending, and the project remains `releaseCandidate=false`.

Current status: `matrix-runner-and-evidence-handoff-ready-disposable-results-pending`.

## Lifecycle matrix added

The integrated disposable runner now covers:

- clean previous-version installation;
- controlled upgrade to current `0.7.0`;
- Markdown OpenWith registration for `.md` and `.markdown`;
- installed current-artifact right-side workspace and TXT/JSON smoke;
- downgrade attempt with registry and installed-binary digest preservation;
- current-version uninstall;
- removal of the current Markdown OpenWith registration;
- external knowledge-library and configuration retention;
- reinstall of the controlled previous version as a bounded rollback;
- first launch after rollback;
- rollback cleanup with retained user data.

The rollback check is deliberately described as installer, launch, and retention evidence. It does not yet prove management-backup restore, path remapping, or knowledge-index recovery.

## Portable evidence bundle

The disposable guest can export exactly seven archive members: one manifest plus lifecycle, installed-artifact, route, performance, and two screenshot files.

The bundle binds:

- the exact Git source commit;
- the approved R5H current NSIS SHA-256;
- every member size and SHA-256;
- application version;
- non-identifying Windows build and architecture;
- a machine-class fingerprint without machine name or user name;
- `releaseCandidate=false`, unsigned-artifact, and no-user-content boundaries.

The importer rejects unsafe paths, duplicate or extra members, source-commit drift, installer drift, digest drift, incomplete lifecycle checks, missing routes, invalid screenshots, privacy drift, and any attempt to overwrite accepted evidence.

## Rejection audit

Four synthetic invalid bundles were executed against the real importer:

1. path traversal;
2. extra archive member;
3. source commit drift;
4. member digest drift.

All four were rejected, and no imported evidence directory was created.

## Requirement alignment

The original goal remains a professional daily-management and basic-editing system covering Markdown, TXT/JSON/developer formats, PDF, workbook, diagrams, mind maps, knowledge graph, canvas, and Office/WPS-like workflows in the shared right-side workspace.

R5K ensures that the delivered application can be upgraded, tested, removed, and rolled back without losing the management system's external library or configuration boundary. It also prevents evidence from another source build or installer from being mistaken for this product version.

## Honest evidence boundary

The current host still has no disposable Windows runner. No real R5K bundle has been generated or imported. Windows 10, Windows 11, full backup/restore rollback, signing, and RC promotion remain incomplete.

## Next stage: R5L

Execute the integrated bundle on disposable Windows 11 and import the accepted evidence. Resolve any installer, association, route, or rollback defects. Then execute the corresponding Windows 10 matrix and extend rollback proof through management-backup restore and knowledge-index recovery before signing or RC consideration.
