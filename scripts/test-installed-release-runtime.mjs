import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'
const fixture = () => JSON.parse(fs.readFileSync('docs/evidence/v1.0.22-release/artifact-manifest.json'))
test('release uses real immutable installed reports, not invented debug counts', () => {
  assert.doesNotThrow(() => assertInstalledReleaseRuntime(fixture()))
})
for (const kind of ['bytes', 'version', 'installer', 'source', 'failed-check', 'missing-save', 'crashed-route']) {
  test(`installed release rejects ${kind}`, () => {
    const m = fixture()
    if (kind === 'version') m.appVersion = '1.0.21'
    if (kind === 'installer') m.artifacts.find(a => a.target === 'nsis').sha256 = '0'.repeat(64)
    if (kind === 'source') m.sourceCommit = '0'.repeat(40)
    const read = file => {
      const original = fs.readFileSync(file)
      if (kind === 'bytes') return Buffer.concat([original, Buffer.from(' ')])
      const report = JSON.parse(original)
      if (kind === 'failed-check' && report.checks) report.checks[0].status = 'failed'
      if (kind === 'missing-save' && report.checks) report.checks = report.checks.filter(c => c.id !== 'installed-txt-read-edit-save-reopen')
      if (kind === 'crashed-route' && report.routes) report.routes[0].crashFallbackVisible = true
      const bytes = Buffer.from(JSON.stringify(report))
      Object.values(m.runtimeSmoke.reports).find(item => item.path === file).sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      return bytes
    }
    assert.throws(() => assertInstalledReleaseRuntime(m, read))
  })
}
