# R5A Frontend Release Bundle Hardening Audit - 2026-07-30

## Conclusion

R5A is complete as a frontend release-bundle hardening step. The project remains `releaseCandidate=false`.

This step adds `shared/frontend-release-hardening-policy.json`, `scripts/check-r5a-frontend-release-hardening.mjs`, and a more explicit Vite chunking strategy.

## What changed

The Vite build now keeps stable vendor domains explicit and leaves the heaviest feature modules route-split instead of forcing them into one oversized vendor chunk:

- Vue runtime and state/router;
- UI framework;
- icons;
- rich Markdown editor;
- PDF route chunks;
- graph route chunks;
- diagram/mind-map route chunks;
- code editor route chunks;
- OCR static assets.

The build warning budget is now explicit through `chunkSizeWarningLimit: 750`. This is not a performance proof; it is a release warning budget with an audit trail.

## Alignment to the original goal

The original goal is a professional daily-management and basic-editing system covering Markdown/TXT/JSON/dev formats, PDF workflows, diagrams/mind maps, XLSX, Office/WPS-like workflows, and knowledge-graph management.

Those capabilities require heavier frontend modules than a plain Markdown reader. R5A makes that cost visible and organized instead of letting it appear as unexplained build noise.

## Remaining limits

- Real startup performance still needs desktop measurement.
- PDF worker and large diagram modules remain intentionally heavy capability assets.
- Any future bundle budget increase must be audited.

## Next stage: R5B

R5B should add a desktop startup/performance evidence shape or run a local smoke measurement if the environment supports it.
