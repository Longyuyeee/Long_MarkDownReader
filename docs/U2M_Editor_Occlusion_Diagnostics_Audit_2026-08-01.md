# U2M Editor Occlusion Diagnostics Audit

Date: 2026-08-01

Stage: U2M / installed TXT occlusion diagnosis

## Outcome

Run `30663991516` confirmed that the embedded TXT marker has strong computed contrast (`16.41:1`), full opacity, a valid 96 x 17 pixel range, and lies inside its CodeMirror rectangle, yet its center is not the top hit-tested element. The screenshot remains blank at that location.

This rules out the original color-inheritance hypothesis and proves an occlusion or duplicate-surface condition. The next diagnostic records the full element stack at the marker center and every CodeMirror instance inside the right-side embedded workspace, including text preview, geometry, display, visibility, and opacity.

No evidence is promoted until the covering element is identified and the visible screenshot agrees with the structured editor state.
