// Installing a candidate is not observing an update from public Release assets.
// The latter can only be accepted after publication, with a separate run.
export function assertCommunityReleaseObservation(policy, observation) {
  const previous = policy.patchValidation?.previousPublicVersion
  const current = policy.appVersion
  if (!/^1\.\d+\.\d+$/.test(current ?? '') || !/^1\.\d+\.\d+$/.test(previous ?? '')) {
    throw new Error('invalid update observation version identity')
  }
  const prefix = `${previous}-to-${current}`
  const value = policy.patchValidation?.managedUpdaterUpgradePath
  if (![`${prefix}-pending`, `${prefix}-passed`].includes(value)) throw new Error('update observation path drift')
  if (value === `${prefix}-pending`) return
  if (policy.gates?.githubReleasePublished !== true) throw new Error('unpublished candidate cannot pass official update observation')
  if (observation?.status !== 'hosted-managed-update-passed'
    || observation.releases?.previous?.version !== previous
    || observation.releases?.current?.version !== current
    || observation.githubRun?.conclusion !== 'success'
    || !Number.isSafeInteger(observation.githubRun?.id) || observation.githubRun.id <= 0) {
    throw new Error('passed official update observation requires its own successful run')
  }
}
