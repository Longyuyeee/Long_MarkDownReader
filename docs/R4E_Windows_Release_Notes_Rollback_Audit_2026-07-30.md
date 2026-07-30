# R4E Windows Release Notes and Rollback Audit - 2026-07-30

## Conclusion

R4E is complete as a release-notes and rollback-plan evidence contract. The project remains `releaseCandidate=false`.

This step adds `shared/windows-release-notes-rollback-plan.json` and `scripts/check-r4e-windows-release-notes-rollback-plan.mjs`. The evidence defines the release notes, known limitations, install/upgrade warnings, rollback strategy, data-retention notes, and final RC promotion checklist.

Current status is `release-notes-and-rollback-defined-but-evidence-incomplete`.

## Product capability summary

The release notes evidence keeps the original user goal at the center:

- daily management workspace;
- Markdown and text editing;
- TXT/JSON/dev format editing;
- PDF reading, sidecar OCR, annotations, and page operations;
- diagrams, mind maps, canvas, and OPML management;
- XLSX bounded workbook editing;
- DOCX/PPTX limited Office-copy editing;
- WPS and legacy Office guarded external/conversion workflows;
- knowledge graph, index recovery, backup/restore, and privacy diagnostics.

## Known limitations

The evidence intentionally documents limits that must not be hidden:

- PDF body-equivalent editing is not supported;
- WPS native body editing is not supported;
- legacy binary Office editing requires compatible Office conversion;
- historical installers are unsigned and not promotable;
- Windows VM results are missing;
- large frontend chunk warnings remain.

## Rollback plan

The rollback strategy is to preserve user data, uninstall or reinstall a previous known-good build, restore management metadata with path remapping, rebuild the knowledge index when needed, and reopen representative file types.

Before RC, rollback must be validated on:

- Windows 10 x64;
- Windows 11 x64;
- backup/restore after rollback;
- knowledge-index recovery after rollback.

## Release gate impact

R4E does not make the product a release candidate. It defines the final documentation and rollback gates that must be satisfied before any RC switch.

The release remains blocked because signing evidence is currently not signed, VM matrix results are missing, rollback has not been run on real VMs, and release-candidate promotion has not been approved.

## Next stage: R4F

R4F should create the final RC promotion gate: a single machine-checkable checklist that refuses `releaseCandidate=true` until artifact, signing, VM, release notes, rollback, and data-retention evidence all pass.

