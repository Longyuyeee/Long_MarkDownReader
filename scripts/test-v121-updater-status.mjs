import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertV121DevelopmentBoundary, assertV121UpdaterStatus } from './lib/v121-updater-status.mjs'

for (const status of ['hosted-execution-pending', 'hosted-managed-update-passed']) {
  for (const communitySuffix of ['pending', 'passed']) {
    for (const receiptSuffix of ['pending', 'passed']) {
      test(`${status}: community=${communitySuffix}, receipt=${receiptSuffix}`, () => {
        const check = () => assertV121UpdaterStatus({ status }, {
          appVersion: '1.0.21',
          patchValidation: { managedUpdaterUpgradePath: `1.0.20-to-1.0.21-${communitySuffix}` },
        }, { managedUpdaterObservation: `1.0.20-to-1.0.21-${receiptSuffix}` })
        const expected = status === 'hosted-execution-pending' ? 'pending' : 'passed'
        if (communitySuffix === expected && receiptSuffix === expected) assert.doesNotThrow(check)
        else assert.throws(check, /status conflict/)
      })
    }
  }
}
test('unknown status fails closed', () => {
  assert.throws(() => assertV121UpdaterStatus({ status: 'unknown' }, {}, {}), /Unknown/)
})

const successor = () => ({ appVersion: '1.0.22', targetRelease: { tag: 'v1.0.22' }, patchValidation: { previousPublicVersion: '1.0.21', managedUpdaterUpgradePath: '1.0.21-to-1.0.22-pending' } })

test('v1.0.23 candidate does not inherit historical updater acceptance', () => {
  const development = { publicVersion: '1.0.22', publicTag: 'v1.0.22', publicTagCommit: 'cc58aa68d1974ac2445ed4b884c7677f5a320e93', runtimeBaseVersion: '1.0.23', developmentTargetVersion: '1.0.23' }
  const community = { appVersion: '1.0.23', targetRelease: { tag: 'v1.0.23' }, gates: { githubReleasePublished: false }, patchValidation: { previousPublicVersion: '1.0.22', managedUpdaterUpgradePath: '1.0.22-to-1.0.23-pending' } }
  assert.doesNotThrow(() => assertV121DevelopmentBoundary(development, community))
  assert.doesNotThrow(() => assertV121UpdaterStatus({ status: 'hosted-managed-update-passed' }, community, { managedUpdaterObservation: '1.0.20-to-1.0.21-passed' }))
  assert.throws(() => assertV121DevelopmentBoundary({ ...development, publicTagCommit: '0'.repeat(40) }, community))
  assert.throws(() => assertV121UpdaterStatus({ status: 'hosted-managed-update-passed' }, { ...community, patchValidation: { ...community.patchValidation, managedUpdaterUpgradePath: '1.0.22-to-1.0.23-passed' } }, { managedUpdaterObservation: '1.0.20-to-1.0.21-passed' }))
})
const closed = { status: 'hosted-managed-update-passed' }
test('published successor boundary requires its own real release identity', () => {
  const development = { publicVersion: '1.0.22', publicTag: 'v1.0.22', publicTagCommit: 'a'.repeat(40), runtimeBaseVersion: '1.0.22', developmentTargetVersion: '1.0.23' }
  const community = { ...successor(), gates: { githubReleasePublished: true }, release: { tag: 'v1.0.22', taggedCommit: 'a'.repeat(40) } }
  assert.doesNotThrow(() => assertV121DevelopmentBoundary(development, community))
  assert.throws(() => assertV121DevelopmentBoundary(development, { ...community, gates: { githubReleasePublished: false } }))
  assert.throws(() => assertV121DevelopmentBoundary({ ...development, publicTagCommit: 'b'.repeat(40) }, community))
})
const receipt = { managedUpdaterObservation: '1.0.20-to-1.0.21-passed' }
test('successor keeps the historical receipt and a separate pending update path', () => {
  const community = successor()
  const before = JSON.stringify([closed, community, receipt])
  assert.doesNotThrow(() => assertV121UpdaterStatus(closed, community, receipt))
  assert.equal(JSON.stringify([closed, community, receipt]), before)
})
for (const scenario of ['pending-predecessor', 'stale-successor-path', 'wrong-previous', 'wrong-tag', 'unknown-version', 'changed-receipt']) {
  test(`successor rejects ${scenario}`, () => {
    const community = successor()
    const policy = { ...closed }
    const historical = { ...receipt }
    if (scenario === 'pending-predecessor') { policy.status = 'hosted-execution-pending'; historical.managedUpdaterObservation = '1.0.20-to-1.0.21-pending' }
    if (scenario === 'stale-successor-path') community.patchValidation.managedUpdaterUpgradePath = receipt.managedUpdaterObservation
    if (scenario === 'wrong-previous') community.patchValidation.previousPublicVersion = '1.0.20'
    if (scenario === 'wrong-tag') community.targetRelease.tag = 'v1.0.21'
    if (scenario === 'unknown-version') community.appVersion = '1.0.23'
    if (scenario === 'changed-receipt') historical.managedUpdaterObservation = '1.0.21-to-1.0.22-passed'
    assert.throws(() => assertV121UpdaterStatus(policy, community, historical), /status conflict/)
  })
}
test('version boundary admits only current and planned successor runtime', () => {
  const development = { publicVersion: '1.0.21', developmentTargetVersion: '1.0.22', runtimeBaseVersion: '1.0.21' }
  assert.doesNotThrow(() => assertV121DevelopmentBoundary(development, { appVersion: '1.0.21' }))
  assert.doesNotThrow(() => assertV121DevelopmentBoundary({ ...development, runtimeBaseVersion: '1.0.22' }, successor()))
  for (const change of [{ publicVersion: '1.0.22' }, { developmentTargetVersion: '1.0.23' }, { runtimeBaseVersion: '1.0.23' }, { runtimeBaseVersion: '1.0.22' }]) {
    assert.throws(() => assertV121DevelopmentBoundary({ ...development, ...change }, { appVersion: '1.0.21' }), /boundary drift/)
  }
})
