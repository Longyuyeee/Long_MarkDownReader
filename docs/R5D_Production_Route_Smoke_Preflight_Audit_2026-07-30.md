# R5D Production Route Smoke Preflight Audit - 2026-07-30

## Conclusion

R5D is complete as a production build route-smoke preflight. The project remains `releaseCandidate=false`.

This step adds `shared/r5d-production-route-smoke-preflight-policy.json`, `scripts/audit-r5d-production-route-smoke-preflight.mjs`, `scripts/check-r5d-production-route-smoke-preflight.mjs`, and a generated evidence bundle under `docs/evidence/r5d-production-route-smoke-preflight/`.

## What this proves

The preflight scans the current production `dist/` output and verifies:

- the route performance export token is present in the production bundle;
- representative right-side workspace route assets exist for workspace, library, TXT, JSON, PDF, workbook, diagram, mind map, graph, canvas, and release capability views;
- generated evidence does not include user document content;
- the result is marked as `production-dist-preflight`, not as final runtime desktop smoke proof.

## Alignment with the original product goal

The original goal is broad daily management and basic editing across common formats. R5D checks that the production build still contains the core surface area needed for that goal: document management, developer text formats, PDF, workbook, diagrams, mind maps, knowledge graph, and release capability visibility.

This helps prevent an apparently successful build from silently losing one of the major right-side workspace capabilities.

## Current limits

- This is a build-shape preflight, not a human-perceived runtime performance result.
- Real route timings still require a built desktop app or webview session using `window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__()`.
- RC promotion remains blocked until signing, Windows VM, rollback, and real smoke evidence are complete.

## Next stage: R5E

R5E should run the real desktop smoke capture on a built artifact and compare the route timing evidence against the R5D preflight asset list.
