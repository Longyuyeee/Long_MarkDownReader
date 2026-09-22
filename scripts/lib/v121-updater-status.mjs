// Published installer verification and post-publication in-app update observation
// are separate gates. Never infer the latter from a successful release alone.
export function assertV121DevelopmentBoundary(development, community) {
  if (development.publicVersion === '1.0.22'
    && development.publicTag === 'v1.0.22'
    && development.runtimeBaseVersion === '1.0.22'
    && development.developmentTargetVersion === '1.0.23'
    && community.appVersion === '1.0.22'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.22'
    && /^[0-9a-f]{40}$/.test(community.release?.taggedCommit ?? '')
    && development.publicTagCommit === community.release.taggedCommit) return
  // Only the explicitly planned successor is accepted. Historical installer and
  // screenshot hashes remain checked by check-v121-managed-updater-lifecycle.
  if (development.publicVersion !== '1.0.21'
    || development.developmentTargetVersion !== '1.0.22'
    || !['1.0.21', '1.0.22'].includes(development.runtimeBaseVersion)
    || community.appVersion !== development.runtimeBaseVersion) {
    throw new Error('v1.0.21 development version boundary drift')
  }
}

export function assertV121UpdaterStatus(policy, community, receipt) {
  if (!['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) {
    throw new Error('Unknown v1.0.21 updater observation status')
  }
  const suffix = policy.status === 'hosted-managed-update-passed' ? 'passed' : 'pending'
  const expected = `1.0.20-to-1.0.21-${suffix}`
  if (receipt.managedUpdaterObservation !== expected) {
    throw new Error(`v1.0.21 updater status conflict: release receipt must be ${expected}`)
  }
  if (community.appVersion === '1.0.22') {
    if (suffix !== 'passed'
      || community.patchValidation?.previousPublicVersion !== '1.0.21'
      || community.targetRelease?.tag !== 'v1.0.22'
      || !['1.0.21-to-1.0.22-pending', '1.0.21-to-1.0.22-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('v1.0.21 updater status conflict: successor must retain its own update path and a closed predecessor')
    }
    return
  }
  if (community.appVersion !== '1.0.21' || community.patchValidation?.managedUpdaterUpgradePath !== expected) {
    throw new Error(`v1.0.21 updater status conflict: community policy and release receipt must both be ${expected}`)
  }
}
