import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { assertCommunityReleaseObservation } from './lib/community-release-observation.mjs'

const candidate = () => ({
  appVersion: '1.0.22', gates: { githubReleasePublished: false, installedLifecyclePassed: true },
  patchValidation: { previousPublicVersion: '1.0.21', managedUpdaterUpgradePath: '1.0.21-to-1.0.22-pending' },
})
const observation = () => ({
  status: 'hosted-managed-update-passed',
  releases: { previous: { version: '1.0.21' }, current: { version: '1.0.22' } },
  githubRun: { id: 123, conclusion: 'success' },
})
test('installed candidate remains pending without an official observation', () => {
  assert.doesNotThrow(() => assertCommunityReleaseObservation(candidate(), null))
})
test('publication alone can remain pending', () => {
  const policy = candidate()
  policy.gates.githubReleasePublished = true
  assert.doesNotThrow(() => assertCommunityReleaseObservation(policy, null))
})
test('only a separately successful published update can pass', () => {
  const policy = candidate()
  policy.gates.githubReleasePublished = true
  policy.patchValidation.managedUpdaterUpgradePath = '1.0.21-to-1.0.22-passed'
  assert.doesNotThrow(() => assertCommunityReleaseObservation(policy, observation()))
})
for (const scenario of ['unpublished', 'missing-evidence', 'wrong-version', 'wrong-previous', 'failed-run', 'missing-run', 'pending-evidence', 'stale-path']) {
  test(`reject false update success: ${scenario}`, () => {
    const policy = candidate()
    policy.gates.githubReleasePublished = true
    policy.patchValidation.managedUpdaterUpgradePath = '1.0.21-to-1.0.22-passed'
    let evidence = observation()
    if (scenario === 'unpublished') policy.gates.githubReleasePublished = false
    if (scenario === 'missing-evidence') evidence = null
    if (scenario === 'wrong-version') evidence.releases.current.version = '1.0.21'
    if (scenario === 'wrong-previous') evidence.releases.previous.version = '1.0.20'
    if (scenario === 'failed-run') evidence.githubRun.conclusion = 'failure'
    if (scenario === 'missing-run') evidence.githubRun.id = 0
    if (scenario === 'pending-evidence') evidence.status = 'hosted-execution-pending'
    if (scenario === 'stale-path') policy.patchValidation.managedUpdaterUpgradePath = '1.0.20-to-1.0.21-passed'
    assert.throws(() => assertCommunityReleaseObservation(policy, evidence))
  })
}
test('production checker uses independent observation and pending candidate state', () => {
  const source = fs.readFileSync('scripts/check-v1-community-release.mjs', 'utf8')
  assert.match(source, /assertCommunityReleaseObservation\(policy,/)
  const lifecycleBranch = source.slice(source.indexOf('} else if (lifecycleVerified) {'), source.indexOf('} else if (ready) {'))
  assert.ok(lifecycleBranch.includes('`${managedUpdaterUpgradePrefix}-pending`'))
  assert.ok(!lifecycleBranch.includes('`${managedUpdaterUpgradePrefix}-passed`'))
})
