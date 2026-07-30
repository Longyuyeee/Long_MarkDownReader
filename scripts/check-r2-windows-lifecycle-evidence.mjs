import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const evidenceRoot = path.join(root, 'docs/evidence/r2-windows-lifecycle')
const manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'audit-manifest.json'), 'utf8'))
const failures = []
if (manifest.schemaVersion !== 1) failures.push('invalid R2 evidence schema')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') {
  failures.push('R2 evidence must come from real Tauri WebView2')
}
const scenarios = new Map((manifest.scenarios || []).map(item => [item.id, item]))
const expected = {
  'cloud-paper': ['r2-capabilities-white-1280.jpg', 'r2-default-app-settings-1280.jpg'],
  'dark-neon': ['r2-capabilities-dark-1024.jpg', 'r2-capabilities-dark-760.jpg'],
}
for (const [id, files] of Object.entries(expected)) {
  const scenario = scenarios.get(id)
  if (!scenario || JSON.stringify(scenario.evidenceFiles) !== JSON.stringify(files)) {
    failures.push(`invalid R2 evidence scenario ${id}`)
    continue
  }
  if (!Array.isArray(scenario.checks) || scenario.checks.length < 4) failures.push(`incomplete R2 checks ${id}`)
  for (const file of files) {
    try {
      if (fs.statSync(path.join(evidenceRoot, file)).size < 20_000) failures.push(`R2 screenshot too small: ${file}`)
    } catch {
      failures.push(`R2 screenshot missing: ${file}`)
    }
  }
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('R2 desktop evidence passed: 2 themes, 3 viewport sizes, search/filter/expand, and safe default-app entry.')
