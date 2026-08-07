# UX50O External Mermaid Workspace Audit

Date: 2026-08-07
Stage: EA-4D2 complete

## Delivered

- `.mmd` and `.mermaid` now open directly in the dedicated Mermaid studio after explicit external-file authorization.
- External editing stays in memory until the user clicks Save or presses Ctrl+S. Saving shows an overwrite confirmation and never occurs during preview, export, navigation, or template editing.
- The backend accepts only authorized existing Mermaid files, UTF-8 source within 2 MiB, a matching extension, valid Mermaid syntax, and an unchanged source signature.
- A stale signature returns `external-modified`; the source changed by another program remains byte-for-byte untouched.
- Live preview keeps Mermaid `securityLevel: strict`, disables diagram interaction, and preserves the existing SVG/PNG export path without writing exported data into the source file.
- Windows installer associations remain limited to `.md` and `.markdown`; Mermaid default-app ownership stays user-selectable in Format Capabilities.

## Capability Alignment

- External policies now total 28 `edit`, 8 `preview`, and 7 `import` formats.
- Draw.io and Mermaid use separate format-aware validation and save commands.
- OPML remains `import` until its canvas, XML preservation, drag/history, and explicit-save behavior are audited in EA-4D3.

## Verification

- Mermaid Rust regression: local read/write, workspace escape rejection, external authorization, successful save, and stale-source preservation.
- `npm run build`
- `npm run check:external-mermaid-workspace`
- `npm run check:current-development-audit`
- Final release gate: `npm run ci:patch-release`

## Next

Proceed with EA-4D3 for external OPML editing. Keep legacy Office/WPS formats on explicit import or system-open paths and do not expand installer associations automatically.
