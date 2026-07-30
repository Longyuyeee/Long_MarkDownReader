# R4B Windows Release Artifact Manifest Audit - 2026-07-30

## Conclusion

R4B is complete as an installer artifact evidence skeleton. The project remains `releaseCandidate=false`.

This step adds `shared/windows-release-artifact-manifest.json` and `scripts/check-r4b-windows-release-artifact-manifest.mjs`. The manifest records the current local files under `releases/`, verifies their SHA-256 hashes and sizes, and explicitly keeps every listed installer at `promotionEligible=false`.

## Artifact status

The current `releases/` directory contains historical/local installer artifacts:

- `releases/MDReader_Setup.exe`
- `releases/MistyEdit_Setup.exe`
- `releases/MistyEdit_Setup_v0.2.0.exe`

They are tracked for auditability only. They are not treated as current official installers because:

- they were not built from the current release tag;
- signature status is `not-verified`;
- Windows 10/11 VM evidence is still missing;
- release notes are still missing;
- rollback plan is still missing.

## Alignment to the original product goal

The core product goal remains a professional daily-management and basic-editing system that can manage Markdown, TXT/JSON/dev formats, PDF workflows, diagrams/mind maps, Office/WPS-like files, and knowledge organization as one coherent workspace.

R4B supports that goal by making distribution evidence machine-checkable. A management system is only professional if users can install, upgrade, uninstall, and recover file associations without guessing which installer is safe. This step prevents historical installer files from being confused with a verified release.

## Next stage: R4C

R4C should define signature verification evidence:

1. record unsigned, test-signed, and official-signed states separately;
2. require timestamped SHA-256 signatures before promotion;
3. define accepted certificate subject rules only after real signing material exists;
4. reject any installer artifact whose hash does not match the manifest;
5. keep `releaseCandidate=false` until both signing evidence and VM matrix evidence are complete.

