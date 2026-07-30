# R4A Windows Release Readiness Contract Audit - 2026-07-30

## Conclusion

R4A is complete as a release-readiness contract, not as a public release candidate. The project remains `releaseCandidate=false`.

This step adds `shared/windows-release-readiness-policy.json` and the automated guard `scripts/check-r4-windows-release-readiness-contract.mjs`. The contract says the Windows installer line is blocked with status `blocked-pending-signing-and-vm-evidence` until real signing evidence, Windows 10/11 VM evidence, installer hashes, release notes, and rollback planning exist.

## Why this matters to the original goal

The original goal is not just "more file parsers"; it is a professional daily-management and basic-editing system for Markdown, TXT/JSON/dev formats, PDF, diagrams, mind maps, Office/WPS-like formats, and knowledge organization.

R4A supports that goal by making the product lifecycle explicit:

- The app must keep user knowledge libraries outside uninstall deletion.
- App config and cache retention must follow the R2 lifecycle boundary.
- Only Markdown file associations are registered by the app today.
- External-dependency formats such as `doc`, `xls`, `ppt`, `wps`, `et`, and `dps` must not be silently claimed as default Windows handlers.
- Debug or unsigned installers must not be advertised as official releases.

## Current evidence state

- R2 lifecycle baseline exists and stays non-RC.
- R3A/R3B/R3C/R3D data resilience, backup/restore, and privacy diagnostics are implemented.
- R4 signing evidence is missing.
- R4 Windows VM matrix evidence is missing.
- R4 installer hash manifest is missing.
- Therefore the release gate intentionally stays closed.

## R4B next step

R4B should create the concrete release evidence bundle shape:

1. Define installer hash manifest schema.
2. Generate hash manifests for local installer artifacts when they exist.
3. Record unsigned/debug/test-signed/official-signed status separately.
4. Add validation that refuses promotion without matching artifact hashes and signature verification records.
5. Keep `releaseCandidate=false` until VM evidence also exists.

