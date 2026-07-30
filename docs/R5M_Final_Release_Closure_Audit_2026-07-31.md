# R5M Final Release Closure Audit — 2026-07-31

## Outcome

R5M turns the previous single imported-evidence directory into two explicit release lanes: `windows-10-x64` and `windows-11-x64`. It also connects Authenticode and timestamp verification to the installed-artifact lifecycle, and adds a final fail-closed readiness audit.

The implementation is complete, but external release evidence is not. The current MSI and NSIS artifacts are still `NotSigned`, both Windows lanes are missing, signed-artifact runtime evidence is missing, and manual release approval has not been recorded. Therefore `releaseCandidate=false`.

## Corrected release gaps

### Single evidence destination

The R5K importer previously promoted every accepted bundle into `docs/evidence/r5k-windows-matrix/imported`. A second operating-system result could not coexist with the first. The importer now accepts only three fixed target names: the historical `imported` target or the two R5M OS lanes.

The manifest's non-identifying Windows product name, build number, and 64-bit architecture are classified together before promotion. Windows 11 requires build `22000` or newer; Windows 10 requires a lower build. Product/build inconsistencies and wrong-lane imports are rejected before any evidence directory is created.

### Signed runtime was impossible to prove

The installed lifecycle previously hard-coded `signedArtifactRuntimeProven=false`. R5M adds `-RequireSignedArtifact`. In this mode the disposable runner refuses to continue unless the NSIS installer has:

- a valid Authenticode signature;
- a signer certificate;
- a timestamp certificate.

Only SHA-256 certificate fingerprints and signature state enter evidence. The signer and timestamp certificate fingerprints propagate through lifecycle, installed smoke, bundle export, and import validation.

### Final gate was disconnected from current evidence

`scripts/audit-r5m-final-release-readiness.ps1` now evaluates the current installer hashes and signatures, both imported OS lanes, signed-runtime status in both lanes, and manual approval. Missing or partial evidence always produces `promotionEligible=false`.

Manual approval is never inferred. An optional `docs/evidence/r5m-final-release/manual-approval.json` must satisfy `shared/r5m-manual-release-approval-contract.json` and bind the current source commit, every current artifact hash, both imported lane source commits, the application version, approval time, and an organizational approver role. A missing, malformed, or stale decision remains blocking.

## Current audited state

- Current MSI/NSIS hashes still match the R5H artifact manifest.
- MSI and NSIS are both `NotSigned`.
- Windows 10 evidence lane: missing.
- Windows 11 evidence lane: missing.
- Signed runtime matrix: incomplete.
- Manual release approval: not recorded.

No current host installer mutation was performed.

## Execution guide

Import an accepted lane with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/import-r5m-windows-matrix-evidence.ps1 `
  -WindowsVersion windows-11-x64 `
  -BundlePath C:\Evidence\r5k-windows-evidence.zip
```

Repeat with `windows-10-x64`. After signing and timestamping, refresh the approved installer digest and create the Sandbox/VM execution with `-RequireSignedArtifact`. Both signed lanes must be rerun because signing changes the installer hash.

Re-evaluate the final gate with:

```powershell
npm run audit:r5m-final-release-readiness
npm run check:r5m-final-release-closure
```

## Next stage: R5N

Provide a disposable Windows 11 runner and a Windows 10 runner, execute and import both unsigned engineering lanes, obtain approved code-signing material, rebuild/sign/timestamp, refresh artifact hashes, rerun both signed lanes, and record explicit manual release approval. R5N is external-evidence execution and final promotion; it should not add product features unless a real guest run exposes a defect.
