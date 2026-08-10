# UX50P External OPML Workspace Audit

Date: 2026-08-10
Stage: EA-4D3 complete

## Delivered

- `.opml` now opens directly in the dedicated mind-map and outline workspace after explicit external-file authorization.
- External edits remain in memory until Save or Ctrl+S. Saving shows an overwrite confirmation and explains that XML formatting is normalized to OPML 2.0.
- The specialized backend accepts only authorized existing `.opml` files, enforces the 8 MiB, 10,000-node and 64-level budgets, rejects DTD declarations, validates the document, and checks the source signature immediately before writing.
- Supported head metadata, outline attributes, stable IDs, notes, collapse state and LongEdit layout coordinates survive parse, edit, serialization and re-read.
- A stale signature returns `external-modified`; the source changed by another program remains untouched.
- The external workspace keeps map/outline switching, four layouts, three themes, pan/zoom, box and multi-selection, node dragging, context menus, keyboard movement, direct rename, undo and redo.
- Canvas projection remains library-only and is hidden for external OPML because it creates a managed sibling file.
- Windows installer associations remain limited to `.md` and `.markdown`.

## Capability Alignment

- External policies now total 29 `edit`, 8 `preview`, and 6 `import` formats.
- Draw.io, Mermaid and OPML each use a format-aware external reader/writer and do not depend on the generic text save path.
- The remaining six import-only formats are legacy Office/WPS conversion or system-open workflows.

## Verification

- OPML Rust regressions: semantic round-trip, DTD rejection, local conflict protection, external authorization, metadata preservation and stale-source preservation.
- `npm run build`
- `npm run check:external-opml-workspace`
- `npm run check:current-development-audit`
- Final release gate: `npm run ci:patch-release`

## Next

EA-4D is complete. Continue with an external-association and installed-launch closure audit across all 29 editable and 8 preview profiles before considering the next patch release.
