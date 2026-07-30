# R4D Windows VM Matrix Evidence Audit - 2026-07-30

## Conclusion

R4D is complete as a Windows VM matrix evidence contract. The project remains `releaseCandidate=false`.

This step adds `shared/windows-release-vm-matrix-evidence.json` and `scripts/check-r4d-windows-release-vm-matrix-evidence.mjs`. The matrix defines the required Windows 10/11 release validation scenarios and intentionally records the current status as `matrix-defined-results-missing` until real VM execution evidence exists.

## Matrix coverage

Required Windows targets:

- `windows-10-x64`
- `windows-11-x64`

Required scenarios on each Windows target:

- fresh install;
- upgrade from previous version;
- downgrade rejection;
- uninstall retains user data;
- file association recovery;
- first launch after install.

That creates 12 required VM evidence rows. Every row is currently `status=missing`, `evidencePath=null`, and `releaseBlocking=true`.

## Release gate impact

R4D does not claim that Windows release validation has been performed. It only defines the evidence shape and blocks promotion until real VM runs are attached.

The release remains blocked because:

- installer artifacts are historical/local and not promotion eligible;
- signing evidence shows `NotSigned`;
- VM matrix results are missing;
- release notes and rollback plan are still missing.

## Alignment to the original product goal

The product goal remains a professional daily-management and basic-editing system across Markdown, TXT/JSON/dev formats, PDF workflows, diagrams/mind maps, Office/WPS-like files, and knowledge organization.

R4D supports that goal by turning installation reliability into a concrete acceptance gate. A professional management system needs predictable install, upgrade, uninstall, file association, and first-launch behavior before users trust it for daily work.

## Next stage: R4E

R4E should define release notes and rollback-plan evidence:

1. current feature/capability summary;
2. known limitations;
3. install and upgrade warnings;
4. rollback procedure;
5. data retention and recovery notes;
6. final RC promotion checklist.
