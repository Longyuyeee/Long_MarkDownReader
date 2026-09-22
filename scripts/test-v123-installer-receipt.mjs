import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { test } from 'node:test'
import { verifyV123InstallerReceipt } from './lib/v123-installer-receipt.mjs'

function fixture() {
  const bytes = Buffer.from('synthetic installer bytes, never executable')
  const identity = { sizeBytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), authenticodeStatus: 'NotSigned' }
  const policy = { candidateCommit: 'a'.repeat(40), previousTagCommit: 'b'.repeat(40) }
  const previous = { release: { tag: 'v1.0.22', taggedCommit: policy.previousTagCommit }, assets: [{ ...identity, name: 'LongEdit_1.0.22_x64-setup.exe' }] }
  const receipt = { stage: 'M8-19', status: 'hosted-installers-built', candidateSourceCommit: policy.candidateCommit, previousSourceCommit: policy.previousTagCommit, appVersion: '1.0.23', previousVersion: '1.0.22', releaseCandidate: false, sourceUserContentIncluded: false, previousInstallerSource: 'official-github-release', previousInstallerSha256: identity.sha256, artifacts: [{ ...identity, target: 'msi', fileName: 'Long编辑_1.0.23_x64_zh-CN.msi' }, { ...identity, target: 'nsis', fileName: 'Long编辑_1.0.23_x64-setup.exe' }] }
  return { bytes, policy, previous, receipt }
}
test('verified bytes do not promote lifecycle or version identity gates', () => {
  const f = fixture()
  const result = verifyV123InstallerReceipt(f.receipt, f.policy, f.previous, () => f.bytes)
  assert.equal(result.installersVerified, 3)
  assert.equal(result.installedLifecycleAccepted, false)
  assert.equal(result.versionIdentityAccepted, false)
})
for (const scenario of ['wrong-candidate', 'rebuilt-previous', 'wrong-previous-hash', 'duplicate-target', 'path-traversal', 'wrong-version', 'missing-privacy', 'changed-bytes', 'wrong-size']) {
  test(`reject ${scenario}`, () => {
    const f = fixture()
    if (scenario === 'wrong-candidate') f.receipt.candidateSourceCommit = 'c'.repeat(40)
    if (scenario === 'rebuilt-previous') f.receipt.previousInstallerSource = 'rebuilt'
    if (scenario === 'wrong-previous-hash') f.receipt.previousInstallerSha256 = '0'.repeat(64)
    if (scenario === 'duplicate-target') f.receipt.artifacts[1] = { ...f.receipt.artifacts[0] }
    if (scenario === 'path-traversal') f.receipt.artifacts[0].fileName = '../Long编辑_1.0.23_x64_zh-CN.msi'
    if (scenario === 'wrong-version') f.receipt.appVersion = '1.0.22'
    if (scenario === 'missing-privacy') delete f.receipt.sourceUserContentIncluded
    if (scenario === 'changed-bytes') f.bytes = Buffer.from('changed')
    if (scenario === 'wrong-size') f.receipt.artifacts[0].sizeBytes++
    assert.throws(() => verifyV123InstallerReceipt(f.receipt, f.policy, f.previous, () => f.bytes))
  })
}
