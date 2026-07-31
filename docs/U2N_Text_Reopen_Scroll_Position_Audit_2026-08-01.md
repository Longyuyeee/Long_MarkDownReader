# U2N Text Reopen Scroll Position Audit

Date: 2026-08-01

Stage: U2N / installed TXT reopen viewport

## Outcome

Run `30664154694` identified the element covering the saved TXT marker: the footer status bar belonging to the same embedded text workspace. The document DOM, marker geometry, contrast, opacity, and editor containment were valid, but the replacement CodeMirror state retained an invalid viewport position that placed the first saved line under the footer.

`replaceDocument` now dispatches an explicit `EditorView.scrollIntoView(0)` effect with top alignment after installing the new editor state. Opening or reopening a text file therefore establishes a deterministic top-of-document viewport rather than inheriting stale scroll placement from the prior tab/editor lifecycle.

## Acceptance boundary

A newly built NSIS artifact must pass the scoped right-side editor input, disk-save, reopen, contrast, geometry, hit-test, screenshot, downgrade recovery, uninstall, rollback, and management recovery sequence. The prior green receipts remain rejected because their TXT screenshots were visually blank.
