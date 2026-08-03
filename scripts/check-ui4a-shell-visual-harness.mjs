import fs from 'node:fs'
import {
  UI4_CORE_SCENARIOS,
  UI4_DISPLAY_SCALES,
  UI4_PHYSICAL_VIEWPORT,
  UI4_SHELL_SURFACES,
  ui4LogicalViewport,
} from './ui4-visual-matrix.mjs'

const failures = []
const capture = fs.readFileSync('scripts/capture-ui4a-shell-visual-audit.mjs', 'utf8')
const runner = fs.readFileSync('scripts/run-ui4a-shell-visual-audit.ps1', 'utf8')
const checker = fs.readFileSync('scripts/check-ui4a-shell-visual-audit.mjs', 'utf8')
const packageJson = fs.readFileSync('package.json', 'utf8')

if (UI4_CORE_SCENARIOS.map(item => item.id).join(',') !== 'professional-light,professional-dark,high-contrast') {
  failures.push('UI-4A core theme matrix drifted')
}
if (UI4_DISPLAY_SCALES.map(item => item.percent).join(',') !== '100,125,150') failures.push('UI-4A scale matrix drifted')
if (UI4_SHELL_SURFACES.map(item => item.id).join(',') !== 'library,workspace,settings,release-capabilities,graph') {
  failures.push('UI-4A shell surface matrix drifted')
}
if (UI4_PHYSICAL_VIEWPORT.width !== 1280 || UI4_PHYSICAL_VIEWPORT.height !== 820) failures.push('UI-4A physical viewport drifted')

const logicalViewports = UI4_DISPLAY_SCALES.map(ui4LogicalViewport)
if (logicalViewports.map(item => `${item.width}x${item.height}`).join(',') !== '1280x820,1024x656,853x547') {
  failures.push('UI-4A Windows-equivalent logical viewport conversion drifted')
}

for (const token of [
  "item.type === 'page' && item.url.includes('127.0.0.1:9000')",
  'Emulation.setDeviceMetricsOverride',
  'deviceScaleFactor: scale.factor',
  'pageOverflowX',
  'headerContentOverlap',
  'Page.captureScreenshot',
]) {
  if (!capture.includes(token)) failures.push(`capture contract is missing: ${token}`)
}
for (const token of [
  'docs\\evidence\\ui4a-shell',
  'LONGEDIT_E2E_LIBRARY',
  'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
  'LONGEDIT_UI4_SOURCE_COMMIT',
]) {
  if (!runner.includes(token)) failures.push(`runner contract is missing: ${token}`)
}
if (!checker.includes("(manifest.entries || []).length !== 45")) failures.push('evidence checker must require exactly 45 screenshots')
if (!packageJson.includes('audit:ui4a-shell-visual') || !packageJson.includes('check:ui4a-shell-visual-evidence')) {
  failures.push('UI-4A package commands are missing')
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('UI-4A shell visual harness passed: 5 surfaces, 3 core themes, 3 Windows-equivalent scales, and Tauri-only evidence boundaries.')
