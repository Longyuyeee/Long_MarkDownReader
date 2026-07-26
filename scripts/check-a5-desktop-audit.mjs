import fs from 'node:fs/promises'
import path from 'node:path'

const root = new URL('../', import.meta.url)
const evidenceRoot = new URL('../docs/evidence/a5-stage-a/', import.meta.url)
const manifest = JSON.parse(await fs.readFile(new URL('audit-manifest.json', evidenceRoot), 'utf8'))
const failures = []
const requiredChecks = new Set([
  'text-save-reopen',
  'external-conflict-reload',
  'env-mask-reveal-remask',
  'env-search-exclusion',
  'saved-search-collection',
  'large-text-bounded-readonly',
  'log-append-refresh',
  'log-rotation-reload',
])

if (manifest.schemaVersion !== 1) failures.push('A5 evidence manifest must use schema version 1')
if (!String(manifest.environment).includes('Tauri Debug WebView2')) {
  failures.push('A5 evidence must identify a real Tauri Debug WebView2 environment')
}
if (manifest.fixtureLocation !== 'isolated temporary workspace') {
  failures.push('A5 evidence must use an isolated temporary workspace')
}

const checks = new Map((manifest.checks || []).map(check => [check.id, check]))
for (const id of requiredChecks) {
  if (checks.get(id)?.status !== 'passed') failures.push(`A5 desktop check missing or failed: ${id}`)
}
const largeCheck = checks.get('large-text-bounded-readonly')
if (!largeCheck?.displayState?.includes('512.0 KiB') || !largeCheck?.displayState?.includes('24.0 MiB')) {
  failures.push('A5 large-text evidence must prove a bounded 512 KiB window over a 24 MiB fixture')
}

const evidenceFiles = manifest.evidenceFiles || []
if (evidenceFiles.length !== 6 || new Set(evidenceFiles).size !== evidenceFiles.length) {
  failures.push('A5 evidence manifest must list six unique screenshots')
}
for (const file of evidenceFiles) {
  const resolved = path.resolve(new URL(file, evidenceRoot).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  const expectedRoot = path.resolve(new URL('.', evidenceRoot).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  if (!resolved.startsWith(expectedRoot + path.sep)) {
    failures.push(`A5 evidence path escapes its directory: ${file}`)
    continue
  }
  try {
    const stat = await fs.stat(new URL(file, evidenceRoot))
    if (!stat.isFile() || stat.size < 15_000) failures.push(`A5 screenshot is missing or too small: ${file}`)
  } catch {
    failures.push(`A5 screenshot is missing: ${file}`)
  }
}

const runner = await fs.readFile(new URL('scripts/run-a5-desktop-audit.ps1', root), 'utf8')
const capture = await fs.readFile(new URL('scripts/capture-a5-desktop-audit.mjs', root), 'utf8')
if (!runner.includes('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS')) {
  failures.push('A5 runner must launch the real WebView2 debug endpoint')
}
if (!runner.includes('LONGEDIT_E2E_LIBRARY')) {
  failures.push('A5 runner must isolate the desktop workspace')
}
if (!capture.includes('A5_PRIVATE_ENV_MARKER') || !capture.includes('external-conflict-reload')) {
  failures.push('A5 capture must exercise sensitive search exclusion and conflict reload')
}

if (failures.length) {
  console.error(`A5 desktop evidence check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`A5 desktop evidence OK: ${requiredChecks.size} checks, ${evidenceFiles.length} real Tauri screenshots.`)
}
