# U2L Embedded Editor Targeting Audit

Date: 2026-08-01

Stage: U2L / installed right-side editor identity

## Outcome

Run `30663797070` correctly rejected the TXT evidence and returned geometry diagnostics. The selected marker had a valid 96 x 17 pixel text range inside a CodeMirror editor, but its center failed visible hit testing. This proved that the smoke was reading and editing a retained non-visible editor instance while the screenshot captured the active right-side editor.

The installed workspace may retain more than one CodeMirror instance for tab continuity. The smoke no longer uses global `.cm-content` or `.cm-line` selectors. Initial content, focus, text replacement, saved-content reopen, geometry, contrast, and hit testing are now all scoped to `.library-embedded-editor`.

Effective background discovery also continues through editor ancestors so transparent CodeMirror roots resolve against the actual themed workspace surface.

## Acceptance boundary

The exact `5978149` NSIS artifact remains digest-verified and does not require rebuilding because this correction changes only the evidence orchestration. A fast artifact-reuse run must pass the scoped assertions and produce screenshots with visible saved TXT and JSON content before U2 evidence can be imported.
