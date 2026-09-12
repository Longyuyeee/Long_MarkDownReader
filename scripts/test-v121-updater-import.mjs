import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const importer = path.resolve('scripts/import-v121-managed-updater-evidence.mjs')
const fixture = path.resolve('docs/evidence/v1.0.19-managed-updater')
const policyBytes = fs.readFileSync('shared/v121-managed-updater-lifecycle-policy.json')
const policy = JSON.parse(policyBytes)
for (const scenario of ['accepted', 'missing-review', 'wrong-hash', 'failed-lifecycle', 'wrong-version', 'missing-privacy', 'malformed-json', 'unexpected-file', 'invalid-run']) {
  test(`import: ${scenario}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'longedit-v121-import-test-'))
    try {
      const source = path.join(root, 'artifact')
      const destination = path.join(root, 'docs/evidence/v1.0.21-managed-updater')
      fs.mkdirSync(source)
      fs.mkdirSync(path.join(root, 'docs/evidence'), { recursive: true })
      fs.mkdirSync(path.join(root, 'shared'))
      fs.writeFileSync(path.join(root, 'shared/v121-managed-updater-lifecycle-policy.json'), policyBytes)
      for (const name of fs.readdirSync(fixture).filter(name => name !== 'import-manifest.json')) {
        fs.copyFileSync(path.join(fixture, name), path.join(source, name))
      }
      const lifecyclePath = path.join(source, 'managed-updater-lifecycle-result.json')
      const lifecycle = JSON.parse(fs.readFileSync(lifecyclePath, 'utf8'))
      Object.assign(lifecycle, { previousVersion: '1.0.20', currentVersion: '1.0.21',
        currentInstallerSha256: policy.releases.current.installer.sha256,
        installedExecutableSha256: policy.releases.current.installedPackageExecutable.sha256 })
      if (scenario === 'failed-lifecycle') lifecycle.status = 'failed'
      if (scenario === 'wrong-version') lifecycle.currentVersion = '1.0.19'
      if (scenario === 'missing-privacy') delete lifecycle.sourceUserContentIncluded
      fs.writeFileSync(lifecyclePath, JSON.stringify(lifecycle))
      const discoveryPath = path.join(source, 'managed-updater-discovery-evidence.json')
      const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'))
      discovery.release.releaseNotes = 'v1.0.21 是知识图谱交互精修补丁；普通图谱根据节点密度设置可读缩放下限'
      fs.writeFileSync(discoveryPath, JSON.stringify(discovery))
      const review = { reviewer: 'synthetic-test-only', reviewedAt: '2026-09-12T00:00:00Z', screenshots:
        fs.readdirSync(source).filter(name => name.endsWith('.jpg')).map(name => ({ path: name, accepted: true,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(source, name))).digest('hex') })) }
      if (scenario === 'wrong-hash') review.screenshots[0].sha256 = '0'.repeat(64)
      const reviewPath = path.join(root, 'review.json')
      fs.writeFileSync(reviewPath, JSON.stringify(review))
      if (scenario === 'malformed-json') fs.writeFileSync(discoveryPath, '{')
      if (scenario === 'unexpected-file') fs.writeFileSync(path.join(source, 'unexpected.txt'), 'test')
      const args = [importer, source, scenario === 'invalid-run' ? '-1' : '123', '456', `sha256:${'a'.repeat(64)}`, 'b'.repeat(40), '2026-09-12T01:00:00Z']
      if (scenario !== 'missing-review') args.push(reviewPath)
      const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
      if (scenario === 'accepted') {
        assert.equal(result.status, 0, result.stderr)
        const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'import-manifest.json')))
        assert.deepEqual(manifest.visualReview, review)
        assert.equal(manifest.files.length, 9)
        const retry = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
        assert.notEqual(retry.status, 0)
        assert.match(retry.stderr, /Refusing to overwrite/)
      } else {
        assert.notEqual(result.status, 0, scenario)
        assert.equal(fs.existsSync(destination), false, 'Rejected inputs must not create evidence')
      }
    } finally {
      // Only the unique test-owned directory returned by mkdtemp is removed.
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
}
