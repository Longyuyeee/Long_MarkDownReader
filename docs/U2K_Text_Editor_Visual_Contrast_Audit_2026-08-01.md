# U2K Text Editor Visual Contrast Audit

Date: 2026-08-01

Stage: U2K / installed TXT visual correctness

## Outcome

The corrected hosted lifecycle removed the global error page, but manual review of run `30661451952` found that the TXT editor's saved content was not visible against the white editor background. Disk content, DOM text, line count, and byte count were correct, so non-visual assertions alone could not detect the defect.

The text workspace now applies `var(--theme-text)` directly to CodeMirror content and line nodes instead of relying only on editor-root inheritance. The installed-artifact smoke also verifies that the marker line exists, has nonzero opacity, has a nontransparent foreground, and does not resolve to the same foreground and background color before accepting either TXT or JSON screenshots.

## Acceptance boundary

A replacement current NSIS artifact must be built from this change. U2 remains pending until the full disposable lifecycle succeeds with the new artifact and both screenshots visibly show their saved content in the embedded right-side editors.
