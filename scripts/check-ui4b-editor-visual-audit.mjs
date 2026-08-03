import fs from 'node:fs'
import path from 'node:path'
import {
  UI4B_EDITOR_SURFACES,
  UI4_CORE_SCENARIOS,
  UI4_DISPLAY_SCALES,
  UI4_PHYSICAL_VIEWPORT,
  ui4LogicalViewport,
} from './ui4b-editor-visual-matrix.mjs'

const root = path.resolve('docs/evidence/ui4b-editors')
const manifestPath = path.join(root, 'audit-manifest.json')
const failures = []
if (!fs.existsSync(manifestPath)) {
  console.error('- UI-4B visual manifest is missing; run npm run audit:ui4b-editor-visual')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('evidence must come from Tauri Debug WebView2')
if (manifest.navigation !== 'managed-file-route') failures.push('evidence must enter editors through managed file routing')
if (!/^[0-9a-f]{40}$/i.test(manifest.sourceCommit || '')) failures.push('sourceCommit must be a full Git revision')
if (manifest.physicalViewport?.width !== UI4_PHYSICAL_VIEWPORT.width || manifest.physicalViewport?.height !== UI4_PHYSICAL_VIEWPORT.height) failures.push('physical viewport must remain 1280x820')

const expectedKeys = new Set()
for (const scenario of UI4_CORE_SCENARIOS) {
  const recorded = manifest.scenarios?.find(item => item.id === scenario.id)
  if (!recorded || recorded.theme !== scenario.theme || recorded.style !== scenario.style || recorded.motion !== scenario.motion) failures.push(`core scenario semantic drift: ${scenario.id}`)
  for (const scale of UI4_DISPLAY_SCALES) {
    for (const surface of UI4B_EDITOR_SURFACES) expectedKeys.add(`${scenario.id}:${scale.percent}:${surface.id}`)
  }
}

for (const entry of manifest.entries || []) {
  const key = `${entry.scenarioId}:${entry.scalePercent}:${entry.surfaceId}`
  if (!expectedKeys.delete(key)) {
    failures.push(`unexpected or duplicate matrix entry: ${key}`)
    continue
  }
  const scale = UI4_DISPLAY_SCALES.find(item => item.percent === entry.scalePercent)
  const logical = scale && ui4LogicalViewport(scale)
  if (!logical || entry.logicalViewport?.width !== logical.width || entry.logicalViewport?.height !== logical.height) failures.push(`logical viewport drift: ${key}`)
  if (!entry.sampleFile || !entry.requestedRoute?.startsWith('#/library?path=')) failures.push(`managed sample entry route is missing: ${key}`)
  if (entry.geometry?.route !== entry.requestedRoute && entry.geometry?.route !== '#/library') failures.push(`managed canonical route drift: ${key}`)
  if (!entry.geometry?.rootVisible || !entry.geometry?.toolbarVisible || !entry.geometry?.rootWithinViewport || !entry.geometry?.sampleIdentityVisible || entry.geometry?.pageOverflowX
    || entry.geometry?.toolbarClipped || entry.geometry?.toolbarOverflow || entry.geometry?.statusClipped || entry.geometry?.contextTriggerOverlap || entry.geometry?.contextTriggerContentOverlap) failures.push(`geometry gate failed: ${key}`)
  const filePath = path.join(root, entry.file || '')
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 15_000) failures.push(`missing or undersized screenshot: ${entry.file}`)
}

if (expectedKeys.size) failures.push(`missing matrix entries: ${[...expectedKeys].join(', ')}`)
if ((manifest.entries || []).length !== 99) failures.push('UI-4B must contain exactly 99 editor screenshots')

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('UI-4B editor visual evidence passed: 11 managed-file surfaces, 3 core themes, 3 Windows-equivalent scales, 99 Tauri screenshots.')
