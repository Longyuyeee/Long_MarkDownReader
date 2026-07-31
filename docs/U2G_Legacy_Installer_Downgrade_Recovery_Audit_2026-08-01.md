# U2G Legacy Installer Downgrade Recovery Audit

Date: 2026-08-01

Stage: U2G / unsigned disposable Windows lifecycle

Release candidate: no

## Outcome

The hosted Windows 11 lifecycle reached and passed the installed-product workspace smoke before exposing an invalid test assumption: the historical `0.6.2` NSIS binary was expected to enforce the downgrade policy added in `0.7.0`. An already-built historical installer cannot inherit later Tauri configuration or NSIS hooks.

The lifecycle contract now records `controlled-downgrade-safety` through one of two truthful paths:

1. a policy-aware installer rejects the downgrade and the verified current binary remains installed; or
2. the historical installer is detected after replacing the current version, after which the runner immediately reinstalls the approved `0.7.0` artifact and verifies its exact SHA-256 digest, registration state, and retained library/configuration markers.

The second path additionally records `legacy-downgrade-detected`; it does not mislabel recovery as rejection.

## Release boundary

This compatibility path is limited to testing the frozen `v0.6.2` rollback baseline. The Windows 10/11 signed release gate in `shared/windows-release-vm-matrix-evidence.json` continues to require strict `downgrade-rejection` between installer generations created after the policy was adopted. U2 remains an unsigned internal candidate and is not promotable.

## Evidence already established

Hosted run `30660012729` passed the installed `0.7.0` TXT/JSON edit-save-reopen smoke, all 11 representative right-side routes, route performance export, management backup, and knowledge-index preparation before reaching this contract defect.

## Next action

Run the U2 hosted lifecycle again with the previously verified installer artifact. Continue through uninstall, Markdown association recovery, user-data retention, explicit rollback launch/cleanup, and management restore before importing or promoting any release evidence.
