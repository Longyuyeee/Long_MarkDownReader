# U2J Hosted Visual Evidence Rejection Audit

Date: 2026-08-01

Stage: U2J / installed-artifact visual gate

## Outcome

GitHub Actions run `30660582582` returned success and generated a lifecycle receipt with 18 passed checks. Manual visual review rejected that evidence before repository promotion: both TXT and JSON screenshots displayed the global application fallback with `未知文件格式: txt`.

The product registry correctly uses stable format IDs (`plain-text` and `json`). The disposable lifecycle fixture incorrectly persisted `txt` as a saved-search object type. That invalid formal configuration surfaced asynchronously after the editor content and disk assertions had already passed.

## Remediation

- write `plain-text` rather than the `.txt` extension into the formal saved-search configuration;
- add a stable no-global-fallback assertion immediately before every installed editor screenshot;
- treat a green workflow as insufficient when captured UI evidence visibly contradicts the structured receipt;
- rerun the corrected orchestration against the same digest-verified frozen product artifact.

## Evidence disposition

The downloaded bundle was removed from the repository import target and remains recoverable from GitHub run `30660582582`. It must not update R5K/U2 completion flags. The unsigned lifecycle remains pending until a rerun produces both passing structured checks and visually valid editor screenshots.
