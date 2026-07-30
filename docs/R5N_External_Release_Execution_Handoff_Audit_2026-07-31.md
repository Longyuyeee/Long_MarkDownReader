# R5N External Release Execution Handoff Audit — 2026-07-31

## Outcome

R5N completes the repository-side release execution workflow. It separates unsigned engineering evidence from signed release evidence, allows every guest run to bind an explicit artifact manifest, verifies signed installers and certificate fingerprints, imports signed Windows 10 and Windows 11 results into separate lanes, and prevents manual approval before all automated gates pass.

The current environment cannot execute the external portion. Windows Sandbox and Hyper-V provisioning commands are unavailable, Windows SDK `signtool.exe` is unavailable, no eligible current-user code-signing certificate with a private key exists, and no disposable Windows 10/11 runners were provided. The project therefore remains `releaseCandidate=false`.

## Requirement alignment

The original daily-management and basic-editing requirement remains unchanged: supported documents, PDF, workbooks, diagrams, mind maps, knowledge graph, TXT/JSON and Office/WPS compatibility stay managed in the common right-side workspace. R5N does not add another editor surface or change those product capabilities. It only prevents an unverified installer from being presented as a finished professional release.

## Corrections made

### Separate signed lanes

Unsigned engineering results remain in the R5M Windows lanes. Signed release results use:

- `signed-windows-10-x64`;
- `signed-windows-11-x64`.

The signed importer requires `signedArtifactRuntimeProven=true`, the correct Windows product/build class, the approved signed artifact manifest, the exact NSIS hash, and the source commit used by the installed build.

### Explicit artifact-manifest binding

The Sandbox/VM configuration generator and evidence importer now accept an explicit manifest under `docs/evidence`. An unsigned R5H manifest cannot enter `-RequireSignedArtifact` mode, and a signed result cannot be validated against an old unsigned hash.

### Signed manifest capture

`capture-r5n-signed-installer-manifest.ps1` reads signed copies from a dedicated directory under the release bundle root. It refuses to run without explicit confirmation and rejects any MSI or NSIS that lacks valid Authenticode, a signer certificate, or a timestamp certificate. It records artifact SHA-256 plus signer/timestamp certificate SHA-256 fingerprints without exporting certificate subjects or credentials. Keeping signed copies separate preserves the R5H unsigned baseline and its reproducible hashes.

### Approval after automation

`new-r5n-manual-release-approval.ps1` cannot create approval until the signed manifest and both signed Windows lanes pass. Approval cannot overwrite an existing decision and is bound to:

- the signed product-source commit;
- every approved artifact hash;
- both Windows lane source commits;
- application version, approval time, and organizational approver role.

Even valid approval only produces `promotionEligible=true`; `releaseCandidate` remains false until a separate explicit promotion change is reviewed.

## Current audit

- Windows Sandbox command: unavailable.
- Hyper-V provisioning cmdlet: unavailable.
- `vmcompute` service: present and running, but not a usable Windows VM runner by itself.
- Windows SDK signing tool: unavailable.
- eligible code-signing certificates: zero.
- signed installer manifest: missing.
- signed Windows 10 lane: missing.
- signed Windows 11 lane: missing.
- manual approval: missing.

Three unsafe transitions are tested and rejected: unsigned manifest capture, unsigned-manifest signed-runner entry, and approval before automated gates.

## External execution order

1. Provision disposable Windows 10 x64 and Windows 11 x64 runners.
2. Install Windows SDK signing tools and obtain approved code-signing material.
3. Build the baseline, copy MSI/NSIS into `src-tauri/target/release/bundle/r5n-signed`, then sign and timestamp only those copies.
4. Capture the R5N signed installer manifest.
5. Generate each guest execution with the signed manifest and `-RequireSignedArtifact`.
6. Import results into both signed Windows lanes.
7. Run `audit:r5n-release-promotion-readiness`.
8. Record approval only after `automatedGatesPassed=true`.
9. Review a separate explicit release-candidate promotion change.

Current status: `external-release-handoff-ready-environment-and-evidence-blocked`.

Next action: `external-release-execution`. No further repository-only stage can truthfully replace the missing signing material and disposable Windows results.
