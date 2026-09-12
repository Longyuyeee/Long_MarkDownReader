// Published installer verification and post-publication in-app update observation
// are separate gates. Never infer the latter from a successful release alone.
export function assertV121UpdaterStatus(policy, community, receipt) {
  if (!['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) {
    throw new Error('Unknown v1.0.21 updater observation status')
  }
  const suffix = policy.status === 'hosted-managed-update-passed' ? 'passed' : 'pending'
  const expected = `1.0.20-to-1.0.21-${suffix}`
  if (community.patchValidation?.managedUpdaterUpgradePath !== expected
    || receipt.managedUpdaterObservation !== expected) {
    throw new Error(`v1.0.21 updater status conflict: community policy and release receipt must both be ${expected}`)
  }
}
