import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync('src/components/WorkspaceTabs.vue', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-38B workspace tabs rejected: ${message}`) }
const evidenceRoot = 'docs/evidence/ux38b-workspace-tabs'
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

for (const token of [
  'ref="scrollRef"',
  '@wheel="handleWheel"',
  '@scroll="updateScrollState"',
  '向左浏览标签',
  '向右浏览标签',
  'const handleWheel = (event: WheelEvent)',
  'Math.abs(event.deltaX) > Math.abs(event.deltaY)',
  'event.preventDefault()',
  "scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })",
  '@keydown.left.prevent="focusAdjacentTab(tab, -1)"',
  '@keydown.right.prevent="focusAdjacentTab(tab, 1)"',
  'new ResizeObserver(updateScrollState)',
  'resizeObserver?.disconnect()',
  'flex: 0 0 176px',
  'min-width: 156px',
  'scrollbar-width: none',
  '.workspace-tabs-scroll::-webkit-scrollbar',
]) if (!source.includes(token)) fail(`contract token missing: ${token}`)

if (/scrollbar-width:\s*(thin|auto)/.test(source)) fail('native scrollbar styling returned')
if (/min-width:\s*92px/.test(source)) fail('compressed 92px tab width returned')
if (!packageJson.scripts?.['check:ux38b-workspace-tabs']) fail('package checker command missing')
if (!packageJson.scripts?.['audit:ux38b-workspace-tabs']) fail('desktop audit command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38b-workspace-tabs-contract')) fail('checker is outside the development audit chain')

const manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'manifest.json'), 'utf8'))
const evidence = JSON.parse(fs.readFileSync(path.join(evidenceRoot, manifest.evidenceFile), 'utf8'))
if (manifest.stage !== 'UX-38B' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('desktop evidence is not visually accepted')
if (manifest.sourceCommit !== '055935e73d857446d9cdc5211ddc98eaad313553' || evidence.sourceCommit !== manifest.sourceCommit) fail('desktop evidence is not bound to the product commit')
if (sha256(path.join(evidenceRoot, manifest.evidenceFile)) !== manifest.evidenceSha256) fail('interaction evidence hash drift')
if (evidence.tabCount !== 12 || evidence.minTabWidth < 156 || evidence.minTextWidth < 66 || evidence.overflow !== true || evidence.scrollbarWidth !== 'none') fail('readability or overflow evidence regressed')
for (const key of ['wheelScrollChanged', 'shiftWheelScrollChanged', 'arrowScrollChanged', 'activeTabRevealed', 'narrowViewportStable', 'keyboardNavigationChanged', 'sourceFilesUnchanged']) {
  if (evidence[key] !== true) fail(`${key} is not accepted`)
}
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false) fail('runtime evidence regressed')
if (evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('privacy or release boundary drift')
if (/([A-Za-z]:\\Users\\|\\\\\?\\[A-Za-z]:)/.test(JSON.stringify(evidence))) fail('evidence contains an unredacted local path')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('screenshot count drift')
for (const screenshot of manifest.screenshots) {
  const file = path.join(evidenceRoot, screenshot.file)
  if (fs.statSync(file).size !== screenshot.bytes || screenshot.bytes < 60_000 || sha256(file) !== screenshot.sha256) fail(`screenshot integrity drift: ${screenshot.file}`)
}

console.log('UX-38B workspace tabs contract passed: product behavior and accepted Tauri evidence cover readable tabs, hidden native tracks, wheel/touchpad scrolling, edge controls, active reveal, narrow layout, and keyboard navigation.')
