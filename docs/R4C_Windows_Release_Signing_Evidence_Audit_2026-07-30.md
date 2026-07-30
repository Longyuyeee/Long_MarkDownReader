# R4C Windows Release Signing Evidence Audit - 2026-07-30

## Conclusion

R4C is complete as a signing-evidence contract. The project remains `releaseCandidate=false`.

This step adds `shared/windows-release-signing-evidence.json` and `scripts/check-r4c-windows-release-signing-evidence.mjs`. The evidence records the current `releases/` installer files as `NotSigned` according to PowerShell `Get-AuthenticodeSignature`, links every signing record back to the R4B SHA-256 artifact manifest, and keeps every artifact at `promotionEligible=false`.

## Current signing result

The current historical/local installer artifacts are not digitally signed:

- `releases/MDReader_Setup.exe` - `NotSigned`
- `releases/MistyEdit_Setup.exe` - `NotSigned`
- `releases/MistyEdit_Setup_v0.2.0.exe` - `NotSigned`

No signer subject and no timestamp subject are recorded because none exist for these files.

## Release gate impact

These artifacts must not be promoted to official release because they lack:

- valid Authenticode signature;
- timestamp certificate;
- accepted certificate subject;
- current release-tag build evidence;
- Windows 10/11 VM matrix evidence.

The R4 readiness policy now records signing status as `not-signed-artifacts-recorded`, but the release gate still stays closed.

## Alignment to the original product goal

The product goal remains a professional daily-management and basic-editing system across Markdown, TXT/JSON/dev formats, PDF workflows, diagrams/mind maps, Office/WPS-like files, and knowledge organization.

R4C supports that goal by making distribution trust explicit. A professional management system should not ask users to guess whether an installer is official. If an installer is unsigned, the software now says so in a machine-checkable contract.

## Next stage: R4D

R4D should define the Windows 10/11 VM matrix evidence shape:

1. fresh install;
2. upgrade from previous version;
3. downgrade rejection;
4. uninstall retains user libraries/config boundaries;
5. Markdown file association recovery;
6. first launch after install.

