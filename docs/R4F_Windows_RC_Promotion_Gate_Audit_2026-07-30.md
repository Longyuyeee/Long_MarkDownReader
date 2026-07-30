# R4F Windows RC Promotion Gate Audit - 2026-07-30

## Conclusion

R4F is complete as the final release-candidate promotion gate. The project remains `releaseCandidate=false`.

This step adds `shared/windows-release-rc-promotion-gate.json` and `scripts/check-r4f-windows-release-rc-promotion-gate.mjs`. The gate connects the R4B artifact manifest, R4C signing evidence, R4D VM matrix, R4E release notes/rollback plan, R2 data-retention lifecycle, and public capability matrix into one machine-checkable release gate.

Current status is `blocked-pending-real-release-evidence`.

## Gate coverage

The RC gate requires these evidence areas before any release-candidate switch:

- artifact hash manifest;
- valid Authenticode signing;
- Windows 10/11 VM matrix;
- release notes;
- rollback plan;
- data-retention policy review;
- public capability matrix update only after evidence.

Every required evidence row currently has `passed=false` and `releaseBlocking=true`.

## Why the release remains blocked

The release remains blocked because:

- current installer artifacts are historical/local and not promotable;
- signing evidence records the artifacts as not signed;
- Windows VM matrix rows are still missing;
- rollback plan is defined but not VM validated;
- public capability matrix remains non-RC;
- manual approval is required before any RC switch.

## Alignment to the original product goal

The original goal is a professional daily-management and basic-editing system covering Markdown/TXT/JSON/dev formats, PDF workflows, diagrams/mind maps, XLSX, DOCX/PPTX, WPS/legacy workflows, and knowledge-graph management.

R4F supports that goal by preventing premature release claims. A professional management system must be trustworthy not only inside the editor but also through installation, upgrade, rollback, data retention, and capability communication.

## Next stage: R5

R5 should move from release contracts into evidence execution and product hardening:

1. run the Windows 10/11 VM matrix with real installer artifacts;
2. decide whether to produce a signed installer or keep local-only distribution;
3. validate rollback on real Windows VMs;
4. review frontend chunk splitting if release size/performance matters;
5. only after real evidence passes, consider a controlled RC switch.

