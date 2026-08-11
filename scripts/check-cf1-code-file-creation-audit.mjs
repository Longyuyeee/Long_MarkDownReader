import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const fail = message => { console.error(`- ${message}`); process.exitCode = 1 }
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const root = 'docs/evidence/cf1-code-file-creation'
const manifest = json(path.join(root, 'manifest.json'))
const evidence = json(path.join(root, manifest.evidenceFile || 'interaction-evidence.json'))
const policy = json('shared/code-file-creation-policy.json')
const runner = fs.readFileSync('scripts/run-cf1-code-file-creation-audit.ps1', 'utf8')
const capture = fs.readFileSync('scripts/capture-cf1-code-file-creation.mjs', 'utf8')

if (manifest.schemaVersion !== 1 || manifest.stage !== 'CF-1' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('CF-1 manifest acceptance drift')
if (!/^[0-9a-f]{40}$/i.test(manifest.sourceCommit) || evidence.sourceCommit !== manifest.sourceCommit) fail('CF-1 source commit drift')
if (manifest.sourceUserContentIncluded !== false || evidence.sourceUserContentIncluded !== false || manifest.releaseCandidate !== false) fail('CF-1 evidence privacy/release boundary drift')
const evidencePath = path.join(root, manifest.evidenceFile)
if (!fs.existsSync(evidencePath) || digest(evidencePath) !== manifest.evidenceSha256) fail('CF-1 interaction evidence digest drift')
if (evidence.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol' || evidence.fixtureLocation !== 'isolated temporary workspace') fail('CF-1 desktop environment drift')
if (evidence.formatFamilies?.length !== 10 || new Set(evidence.formatFamilies).size !== 10 || evidence.createdFiles?.length !== 11) fail('CF-1 desktop creation inventory drift')
if (evidence.firstFilePreservedAfterDuplicateCreate !== true || evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false) fail('CF-1 desktop safety result drift')
if (evidence.checks?.length !== 8 || evidence.checks.some(check => check.status !== 'passed')) fail('CF-1 desktop checks are incomplete')
if (manifest.screenshots?.length !== 5) fail('CF-1 screenshot inventory drift')
for (const screenshot of manifest.screenshots ?? []) {
  const file = path.join(root, screenshot.file)
  if (!fs.existsSync(file) || fs.statSync(file).size !== screenshot.bytes || screenshot.bytes < 30_000 || digest(file) !== screenshot.sha256) fail(`CF-1 screenshot drift: ${screenshot.file}`)
}
if (policy.status !== 'accepted' || policy.gates?.desktopEvidenceAccepted !== true || policy.desktopEvidence?.manifest !== 'docs/evidence/cf1-code-file-creation/manifest.json' || policy.desktopEvidence?.checks !== 8 || policy.desktopEvidence?.screenshots !== 5) fail('CF-1 policy acceptance drift')
for (const token of ['LONGEDIT_E2E_LIBRARY', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', '$cdpPort = 14410', 'longedit-cf1-']) if (!runner.includes(token)) fail(`CF-1 runner token missing: ${token}`)
for (const token of ['Tauri Debug WebView2 via Chrome DevTools Protocol', 'draft-does-not-write-before-save', 'close-and-reopen-restores-saved-content', 'duplicate-create-never-overwrites']) if (!capture.includes(token)) fail(`CF-1 capture token missing: ${token}`)

if (!process.exitCode) console.log('CF-1 desktop creation audit passed: 10 format families, explicit save, close/reopen and no-overwrite evidence are accepted.')
