import fs from 'node:fs/promises'
import path from 'node:path'

const root = new URL('../', import.meta.url)
const evidenceRoot = new URL('../docs/evidence/a5-stage-a/', import.meta.url)
const manifest = JSON.parse(await fs.readFile(new URL('audit-manifest.json', evidenceRoot), 'utf8'))
const failures = []
const requiredChecks = new Set([
  'text-save-reopen',
  'library-shell-embedded-formats',
  'external-conflict-reload',
  'env-mask-reveal-remask',
  'json-invalid-save-protected',
  'json-repair-save',
  'embedded-tab-switch-preserves-shell',
  'properties-save-reopen',
  'source-code-save-reopen',
  'yaml-save-reopen',
  'xml-save-reopen',
  'toml-save-reopen',
  'env-search-exclusion',
  'saved-search-collection',
  'large-text-bounded-readonly',
  'log-append-refresh',
  'log-rotation-reload',
  'restart-recent-file-reopen',
  'g8-current-file-relation-summary',
  'g8-centered-graph-navigation',
  'g8-workspace-relation-summary',
  'g8-search-relation-summary',
  'g8-file-relation-context',
  'g8-opml-planning-context',
  'g8-tag-and-collection-context',
  'g8-pdf-object-context',
  'b0-pdf-page-plan-preview',
  'g8-table-object-context',
  'g8-canvas-object-context',
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
if (!manifest.restartVerifiedAt) failures.push('A5 evidence must record process restart verification time')
if (evidenceFiles.length !== 21 || new Set(evidenceFiles).size !== evidenceFiles.length) {
  failures.push('A5/G8/B0 evidence manifest must list twenty-one unique screenshots')
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
const restart = await fs.readFile(new URL('scripts/verify-a5-desktop-restart.mjs', root), 'utf8')
if (!runner.includes('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS')) {
  failures.push('A5 runner must launch the real WebView2 debug endpoint')
}
if (!runner.includes('LONGEDIT_E2E_LIBRARY')) {
  failures.push('A5 runner must isolate the desktop workspace')
}
if (!runner.includes('$restartedApp') || !restart.includes('restart-recent-file-reopen')) {
  failures.push('A5 runner must verify a recent file through a real process restart')
}
if (!capture.includes('A5_PRIVATE_ENV_MARKER')
  || !capture.includes('external-conflict-reload')
  || !capture.includes('json-invalid-save-protected')
  || !capture.includes('library-shell-embedded-formats')
  || !capture.includes('g8-centered-graph-navigation')
  || !capture.includes('g8-file-relation-context')
  || !capture.includes('g8-opml-planning-context')
  || !capture.includes('g8-tag-and-collection-context')
  || !capture.includes('g8-pdf-object-context')
  || !capture.includes('b0-pdf-page-plan-preview')
  || !capture.includes('g8-table-object-context')
  || !capture.includes('g8-canvas-object-context')) {
  failures.push('A5/G8/B0 capture must exercise the library shell, relation summaries, cross-format context, PDF page planning, saved collections, planning hierarchy, sensitive search exclusion, conflict reload, and invalid JSON protection')
}

if (failures.length) {
  console.error(`A5 desktop evidence check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`A5 desktop evidence OK: ${requiredChecks.size} checks, ${evidenceFiles.length} real Tauri screenshots.`)
}
