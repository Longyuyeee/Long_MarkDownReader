import fs from 'node:fs'
import path from 'node:path'
import {
  UI4_CORE_SCENARIOS,
  UI4_DISPLAY_SCALES,
  UI4_PHYSICAL_VIEWPORT,
  UI4_SHELL_SURFACES,
  ui4LogicalViewport,
} from './ui4-visual-matrix.mjs'

const root = path.resolve('docs/evidence/ui4a-shell')
const manifestPath = path.join(root, 'audit-manifest.json')
const failures = []
if (!fs.existsSync(manifestPath)) {
  console.error('- UI-4A visual manifest is missing; run npm run audit:ui4a-shell-visual')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('evidence must come from Tauri Debug WebView2')
if (!/^[0-9a-f]{40}$/i.test(manifest.sourceCommit || '')) failures.push('sourceCommit must be a full Git revision')
if (manifest.physicalViewport?.width !== UI4_PHYSICAL_VIEWPORT.width || manifest.physicalViewport?.height !== UI4_PHYSICAL_VIEWPORT.height) {
  failures.push('physical viewport must remain 1280x820')
}

const expectedKeys = new Set()
for (const scenario of UI4_CORE_SCENARIOS) {
  const recorded = manifest.scenarios?.find(item => item.id === scenario.id)
  if (!recorded || recorded.theme !== scenario.theme || recorded.style !== scenario.style || recorded.motion !== scenario.motion) {
    failures.push(`core scenario semantic drift: ${scenario.id}`)
  }
  for (const scale of UI4_DISPLAY_SCALES) {
    for (const surface of UI4_SHELL_SURFACES) expectedKeys.add(`${scenario.id}:${scale.percent}:${surface.id}`)
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
  if (!logical || entry.logicalViewport?.width !== logical.width || entry.logicalViewport?.height !== logical.height) {
    failures.push(`logical viewport drift: ${key}`)
  }
  if (!entry.geometry?.rootVisible || entry.geometry?.pageOverflowX || entry.geometry?.headerContentOverlap
    || entry.geometry?.statusClipped || entry.geometry?.graphControlsOverflow) {
    failures.push(`geometry gate failed: ${key}`)
  }
  const filePath = path.join(root, entry.file || '')
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 15_000) failures.push(`missing or undersized screenshot: ${entry.file}`)
}

if (expectedKeys.size) failures.push(`missing matrix entries: ${[...expectedKeys].join(', ')}`)
if ((manifest.entries || []).length !== 45) failures.push('UI-4A must contain exactly 45 shell screenshots')

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('UI-4A shell visual evidence passed: 5 surfaces, 3 core themes, 3 Windows-equivalent scales, 45 Tauri screenshots.')
