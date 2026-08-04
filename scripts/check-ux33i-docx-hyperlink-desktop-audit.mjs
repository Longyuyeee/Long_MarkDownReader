import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/ux33i-docx-hyperlink-desktop')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8'))
const fail = message => { throw new Error(`UX-33I desktop evidence rejected: ${message}`) }

if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') fail('environment must identify Tauri Debug WebView2')
if (manifest.evidenceBoundary !== 'real desktop WebView; not an installed MSI/NSIS lifecycle claim') fail('desktop/install boundary is missing')
if (!/^[0-9a-f]{40}$/i.test(manifest.sourceCommit || '')) fail('sourceCommit must be a full Git revision')
if (!Array.isArray(manifest.results) || manifest.results.length !== 3) fail('exactly three producer results are required')

const expected = new Map([
  ['microsoft-word', 2],
  ['wps-writer', 0],
  ['libreoffice-writer', 2],
])
for (const result of manifest.results) {
  if (!expected.has(result.producerId)) fail(`unexpected producer ${result.producerId}`)
  if (!result.route?.startsWith('#/library?path=<isolated-library>/') || /[A-Z]:|AppData|Users[\\/]/i.test(result.route)) fail(`${result.producerId} route is not privacy-redacted`)
  const count = expected.get(result.producerId)
  if (result.expectedEditableLinks !== count) fail(`${result.producerId} expected count drifted`)
  if (result.linkTargetLabels?.length !== count || result.editableHyperlinkCount !== count) fail(`${result.producerId} editable link count failed`)
  if (!/^[0-9a-f]{64}$/i.test(result.sourceSha256 || '') || !result.sourceUnchanged) fail(`${result.producerId} source integrity failed`)
  if (!Array.isArray(result.screenshots) || result.screenshots.length !== (count ? 2 : 1)) fail(`${result.producerId} screenshot count failed`)
  if (count && (!result.editorAvailable || !result.linkPromptVerified || !result.draftCreated || !result.undoVerified || !result.redoVerified || !result.isolatedPreviewVerified || !result.saveBoundaryVerified || !result.copySaveReachable)) {
    fail(`${result.producerId} editable desktop workflow is incomplete`)
  }
  if (!count && (result.linkPromptVerified || result.draftCreated || result.isolatedPreviewVerified)) fail(`${result.producerId} WPS field links were exposed for editing`)
  for (const screenshot of result.screenshots) {
    const stat = await fs.stat(path.join(root, screenshot))
    if (stat.size < 15_000) fail(`${screenshot} is unexpectedly small`)
  }
}

if (new Set(manifest.results.map(result => result.producerId)).size !== 3) fail('producer ids must be unique')
console.log('UX-33I DOCX hyperlink desktop evidence passed')
