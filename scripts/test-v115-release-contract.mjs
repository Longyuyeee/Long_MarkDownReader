import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'

const workflow = fs.readFileSync('scripts/lib/installed-v1-1-5-workflow.mjs', 'utf8')
const ids = [...workflow.matchAll(/check\('([^']+)'/g)].map(match => match[1])
const fixture = () => {
  const manifest = JSON.parse(fs.readFileSync('docs/evidence/v1.1.4-release/artifact-manifest.json', 'utf8'))
  const bytes = new Map()
  manifest.appVersion = manifest.sourceVersion = '1.1.5'
  for (const item of Object.values(manifest.runtimeSmoke.reports)) {
    const data = JSON.parse(fs.readFileSync(item.path, 'utf8'))
    if (data.appVersion) data.appVersion = '1.1.5'
    if (data.observations) {
      // The version report is checked independently below using its existing schema.
      for (const key of Object.keys(data.observations)) if (typeof data.observations[key] === 'string') data.observations[key] = data.observations[key].replaceAll('1.1.4', '1.1.5')
    }
    item.path = item.path.replace('v1-1-4-candidate-lifecycle', 'v1-1-5-candidate-lifecycle')
    const encoded = Buffer.from(JSON.stringify(data)); item.sha256 = crypto.createHash('sha256').update(encoded).digest('hex'); bytes.set(item.path, encoded)
  }
  const report = { appVersion: '1.1.5', sourceCommit: manifest.sourceCommit, installerSha256: manifest.artifacts.find(a => a.target === 'nsis').sha256, status: 'passed', evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, checks: ids.map(id => ({ id, status: 'passed' })) }
  const set = () => { const data = Buffer.from(JSON.stringify(report)), file = 'docs/evidence/v1-1-5-candidate-lifecycle/installed-v115-workflow.json'; bytes.set(file, data); manifest.runtimeSmoke.reports.foundationHardening = { path: file, sha256: crypto.createHash('sha256').update(data).digest('hex') } }
  set(); return { manifest, report, set, read: file => bytes.get(file) }
}

test('current v115 metadata keeps new and unresolved predecessor update observations explicit', () => {
  const policy = JSON.parse(fs.readFileSync('shared/v1-community-release-policy.json', 'utf8'))
  if (policy.appVersion !== '1.1.5' || policy.patchValidation.managedUpdaterUpgradePath !== '1.1.4-to-1.1.5-pending') return
  assert.ok(policy.releaseWarnings.includes('v1.1.4-to-v1.1.5-managed-update-observation-pending'))
  const previous = JSON.parse(fs.readFileSync('docs/evidence/v1.1.4-release/release-receipt.json', 'utf8'))
  if (previous.managedUpdaterObservation === '1.1.3-to-1.1.4-pending') assert.ok(policy.releaseWarnings.includes('v1.1.3-to-v1.1.4-managed-update-observation-pending'))
})

test('v115 installer workflow retains ten explicit user-task checks and production authorization', () => {
  assert.equal(ids.length, 10); assert.equal(new Set(ids).size, 10)
  assert.match(workflow, /open_external_file_window/); assert.match(workflow, /Input\.insertText/)
  assert.doesNotMatch(workflow, /authorize_import|\.isDirty\s*=|prefers-reduced-motion/)
})
test('v115 rejects missing or altered new installed evidence', () => {
  const f = fixture()
  delete f.manifest.runtimeSmoke.reports.foundationHardening
  assert.throws(() => assertInstalledReleaseRuntime(f.manifest, f.read))
  f.set(); f.report.checks[0].id = 'fake-success'; f.set()
  assert.throws(() => assertInstalledReleaseRuntime(f.manifest, f.read))
  f.report.checks = ids.map(id => ({ id, status: 'passed' })); f.report.installerSha256 = '0'.repeat(64); f.set()
  assert.throws(() => assertInstalledReleaseRuntime(f.manifest, f.read))
})
test('v115 accepts complete correctly bound evidence without inheriting predecessor version', () => {
  const f = fixture(); assert.doesNotThrow(() => assertInstalledReleaseRuntime(f.manifest, f.read))
})
test('v115 retains predecessor workflow evidence requirements', () => {
  const f = fixture(); delete f.manifest.runtimeSmoke.reports.foundationExtended
  assert.throws(() => assertInstalledReleaseRuntime(f.manifest, f.read))
})
