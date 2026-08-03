import fs from 'node:fs'
import {
  UI4B_EDITOR_SURFACES,
  UI4_CORE_SCENARIOS,
  UI4_DISPLAY_SCALES,
  UI4_PHYSICAL_VIEWPORT,
  ui4bManagedFileHash,
  ui4LogicalViewport,
} from './ui4b-editor-visual-matrix.mjs'

const failures = []
const capture = fs.readFileSync('scripts/capture-ui4b-editor-visual-audit.mjs', 'utf8')
const runner = fs.readFileSync('scripts/run-ui4b-editor-visual-audit.ps1', 'utf8')
const checker = fs.readFileSync('scripts/check-ui4b-editor-visual-audit.mjs', 'utf8')
const packageJson = fs.readFileSync('package.json', 'utf8')

if (UI4_CORE_SCENARIOS.map(item => item.id).join(',') !== 'professional-light,professional-dark,high-contrast') failures.push('UI-4B core theme matrix drifted')
if (UI4_DISPLAY_SCALES.map(item => item.percent).join(',') !== '100,125,150') failures.push('UI-4B scale matrix drifted')
if (UI4B_EDITOR_SURFACES.map(item => item.id).join(',') !== 'markdown,txt,json,pdf,docx,pptx,csv,xlsx,diagram,mindmap,canvas') {
  failures.push('UI-4B editor surface matrix drifted')
}
if (new Set(UI4B_EDITOR_SURFACES.map(item => item.sampleKey)).size !== 11) failures.push('UI-4B samples must map one-to-one to editor surfaces')
if (UI4_PHYSICAL_VIEWPORT.width !== 1280 || UI4_PHYSICAL_VIEWPORT.height !== 820) failures.push('UI-4B physical viewport drifted')

const logicalViewports = UI4_DISPLAY_SCALES.map(ui4LogicalViewport)
if (logicalViewports.map(item => `${item.width}x${item.height}`).join(',') !== '1280x820,1024x656,853x547') failures.push('UI-4B logical viewport conversion drifted')
if (!ui4bManagedFileHash('C:\\Audit\\sample.md').startsWith('#/library?path=')) failures.push('UI-4B must navigate through the managed library route')

for (const token of [
  "item.type === 'page' && item.url.includes('127.0.0.1:9000')",
  'Emulation.setDeviceMetricsOverride',
  'deviceScaleFactor: scale.factor',
  'ui4bManagedFileHash',
  'rootWithinViewport',
  'pageOverflowX',
  'toolbarClipped',
  'toolbarOverflow',
  'statusClipped',
  'Page.captureScreenshot',
]) {
  if (!capture.includes(token)) failures.push(`capture contract is missing: ${token}`)
}
for (const token of [
  'docs\\evidence\\ui4b-editors',
  'LONGEDIT_E2E_LIBRARY',
  'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
  'LONGEDIT_UI4B_SOURCE_COMMIT',
  'TWO_PAGE_PDF',
  'microsoft-word-16.docx',
  'microsoft-powerpoint-16.pptx',
  's8-7e3g-longedit-multi-axis.xlsx',
]) {
  if (!runner.includes(token)) failures.push(`runner contract is missing: ${token}`)
}
if (!checker.includes("(manifest.entries || []).length !== 99")) failures.push('evidence checker must require exactly 99 screenshots')
if (!packageJson.includes('audit:ui4b-editor-visual') || !packageJson.includes('check:ui4b-editor-visual-evidence')) failures.push('UI-4B package commands are missing')

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('UI-4B editor visual harness passed: 11 managed-file surfaces, 3 core themes, 3 Windows-equivalent scales, and 99 Tauri evidence slots.')
