/** Plain text is displayed as text, never interpreted as Markdown or HTML. */
export function plainTextReaderStyle(dark:boolean){return `
:root{color-scheme:${dark?'dark':'light'};--canvas:${dark?'#111c28':'#fafbf8'};--ink:${dark?'#eef5f5':'#172a24'}}
*{box-sizing:border-box}html{overflow-wrap:anywhere;scroll-behavior:auto}body{margin:0;padding:0 24px;background:var(--canvas);color:var(--ink);font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;font-size:1.0625rem;line-height:1.75}article{max-width:700px;margin:auto;min-width:0}pre{margin:0;padding:32px 0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;tab-size:4}mark{background:#f4df91;color:#25372a;border-radius:2px}mark.current-hit{background:#e7ad45;outline:2px solid #a06e22}@media(max-width:340px){body{padding-left:20px;padding-right:20px}}
`}
