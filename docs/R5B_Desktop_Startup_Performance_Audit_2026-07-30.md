# R5B Desktop Startup Performance Audit - 2026-07-30

## Conclusion

R5B is complete as a desktop startup and route-performance evidence foundation. The project remains `releaseCandidate=false`.

This step adds `shared/desktop-startup-performance-policy.json`, `scripts/check-r5b-desktop-startup-performance.mjs`, and lightweight runtime route performance marks in `src/App.vue`.

## What changed

- Added route transition marks with `performance.mark`.
- Added route transition measures with `performance.measure`.
- Added a bounded in-window smoke evidence buffer at `window.__LONGEDIT_ROUTE_PERFORMANCE__`.
- Kept the route performance history bounded to 20 entries.
- Connected the runtime evidence policy to the R5A frontend chunk budget.
- Added a machine-checkable R5B gate into `npm run check:format-contract`.

## Alignment with the original product goal

The original goal is a professional daily-management and basic-editing workspace, not a single Markdown reader. That means the right-side workspace now needs to carry Markdown, TXT, JSON/dev formats, PDF, workbook, charts, diagrams, mind maps, knowledge graph, and Office/WPS-like workflows without making ordinary navigation feel fragile.

R5B makes that quality requirement visible. The app now records route transition smoke data for major capability areas, so later desktop and VM audits can prove whether the heavier professional-management system still feels responsive.

## Current limits

- Runtime marks are local smoke evidence, not a lab-grade benchmark.
- Real startup time still needs to be measured from a built desktop artifact.
- Windows 10/11 VM performance evidence is still pending.
- The RC gate must stay closed until real signed artifacts and desktop/VM evidence exist.

## Next stage: R5C

R5C should add a repeatable smoke-audit capture path for built desktop artifacts. The preferred next step is a script or documented procedure that opens the production app, navigates representative routes, exports `window.__LONGEDIT_ROUTE_PERFORMANCE__`, and attaches screenshots or JSON evidence to `docs/evidence/`.
