// Published installer verification and post-publication in-app update observation
// are separate gates. Never infer the latter from a successful release alone.
export function assertV121DevelopmentBoundary(development, community) {
  if (community.appVersion === '1.1.5'
    && community.patchValidation?.previousPublicVersion === '1.1.4'
    && development.runtimeBaseVersion === '1.1.5'
    && community.targetRelease?.tag === 'v1.1.5'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.5' && development.publicTag === 'v1.1.5'
        && development.developmentTargetVersion === '1.1.6'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.4' && development.publicTag === 'v1.1.4'
        && development.publicTagCommit === '970a9fe18a74b6ad1d78304ae15b18178bf47057'
        && development.developmentTargetVersion === '1.1.5')) return
  if (community.appVersion === '1.1.4'
    && community.patchValidation?.previousPublicVersion === '1.1.3'
    && development.runtimeBaseVersion === '1.1.4'
    && community.targetRelease?.tag === 'v1.1.4'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.4' && development.publicTag === 'v1.1.4'
        && development.developmentTargetVersion === '1.1.5'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.3' && development.publicTag === 'v1.1.3'
        && development.publicTagCommit === '2854d7792caee2027e1138491a4754fa7a4871cc'
        && development.developmentTargetVersion === '1.1.4')) return
  if (community.appVersion === '1.1.3'
    && community.patchValidation?.previousPublicVersion === '1.1.2'
    && development.runtimeBaseVersion === '1.1.3'
    && community.targetRelease?.tag === 'v1.1.3'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.3' && development.publicTag === 'v1.1.3'
        && development.developmentTargetVersion === '1.1.4'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.2' && development.publicTag === 'v1.1.2'
        && development.publicTagCommit === '985ee7ff1a0b0e27627477d80206623f46ea339a'
        && development.developmentTargetVersion === '1.1.3')) return
  if (community.appVersion === '1.1.2'
    && community.patchValidation?.previousPublicVersion === '1.1.1'
    && development.runtimeBaseVersion === '1.1.2'
    && community.targetRelease?.tag === 'v1.1.2'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.2' && development.publicTag === 'v1.1.2'
        && development.developmentTargetVersion === '1.1.3'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.1' && development.publicTag === 'v1.1.1'
        && development.publicTagCommit === '4d3e0550132acb341f1277ec0113e15dfb4b4f32'
        && development.developmentTargetVersion === '1.1.2')) return
  if (community.appVersion === '1.1.1'
    && community.patchValidation?.previousPublicVersion === '1.1.0'
    && development.runtimeBaseVersion === '1.1.1'
    && community.targetRelease?.tag === 'v1.1.1'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.1' && development.publicTag === 'v1.1.1'
        && development.developmentTargetVersion === '1.1.2'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.0' && development.publicTag === 'v1.1.0'
        && development.publicTagCommit === 'a65c534b261e42e22f62061fa5fc086325ffe030'
        && development.developmentTargetVersion === '1.1.1')) return
  if (community.appVersion === '1.1.0'
    && community.patchValidation?.previousPublicVersion === '1.0.26'
    && development.runtimeBaseVersion === '1.1.0'
    && community.targetRelease?.tag === 'v1.1.0'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.0' && development.publicTag === 'v1.1.0'
        && development.developmentTargetVersion === '1.1.1'
        && community.release?.taggedCommit === development.publicTagCommit
      : development.publicVersion === '1.0.26' && development.publicTag === 'v1.0.26'
        && development.publicTagCommit === 'c5c136140ad68fefb81b50898051012cfc865a20'
        && development.developmentTargetVersion === '1.1.0')) return
  if (development.publicVersion === '1.0.26'
    && development.publicTag === 'v1.0.26'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && development.runtimeBaseVersion === '1.0.26'
    && development.developmentTargetVersion === '1.0.27'
    && community.appVersion === '1.0.26'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.26'
    && community.release?.taggedCommit === development.publicTagCommit) return

  if (development.publicVersion === '1.0.25'
    && development.publicTag === 'v1.0.25'
    && development.publicTagCommit === '2f44e143b32b2ac4fb317e24ff6beb9652b95429'
    && development.runtimeBaseVersion === '1.0.26'
    && development.developmentTargetVersion === '1.0.26'
    && community.appVersion === '1.0.26'
    && community.gates?.githubReleasePublished === false
    && community.patchValidation?.previousPublicVersion === '1.0.25'
    && community.targetRelease?.tag === 'v1.0.26') return

  if (development.publicVersion === '1.0.25'
    && development.publicTag === 'v1.0.25'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && development.runtimeBaseVersion === '1.0.25'
    && development.developmentTargetVersion === '1.0.26'
    && community.appVersion === '1.0.25'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.25'
    && community.release?.taggedCommit === development.publicTagCommit) return

  if (development.publicVersion === '1.0.24'
    && development.publicTag === 'v1.0.24'
    && development.publicTagCommit === '9fa7ffa0f778773cfd999169e695e32a705168ae'
    && development.runtimeBaseVersion === '1.0.25'
    && development.developmentTargetVersion === '1.0.25'
    && community.appVersion === '1.0.25'
    && community.gates?.githubReleasePublished === false
    && community.patchValidation?.previousPublicVersion === '1.0.24'
    && community.targetRelease?.tag === 'v1.0.25') return

  if (development.publicVersion === '1.0.24'
    && development.publicTag === 'v1.0.24'
    && development.publicTagCommit === '9fa7ffa0f778773cfd999169e695e32a705168ae'
    && development.runtimeBaseVersion === '1.0.24'
    && development.developmentTargetVersion === '1.0.25'
    && community.appVersion === '1.0.24'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.24'
    && community.release?.taggedCommit === development.publicTagCommit) return
  if (development.publicVersion === '1.0.23'
    && development.publicTag === 'v1.0.23'
    && development.publicTagCommit === '403a5122d169dfb238cd0a424d83e356f644fb08'
    && development.runtimeBaseVersion === '1.0.24'
    && development.developmentTargetVersion === '1.0.24'
    && community.appVersion === '1.0.24'
    && community.gates?.githubReleasePublished === false
    && community.patchValidation?.previousPublicVersion === '1.0.23'
    && community.targetRelease?.tag === 'v1.0.24') return
  if (development.publicVersion === '1.0.23'
    && development.publicTag === 'v1.0.23'
    && development.publicTagCommit === '403a5122d169dfb238cd0a424d83e356f644fb08'
    && development.runtimeBaseVersion === '1.0.23'
    && development.developmentTargetVersion === '1.0.24'
    && community.appVersion === '1.0.23'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.23'
    && community.release?.taggedCommit === development.publicTagCommit) return
  if (development.publicVersion === '1.0.22'
    && development.publicTag === 'v1.0.22'
    && development.publicTagCommit === 'cc58aa68d1974ac2445ed4b884c7677f5a320e93'
    && development.runtimeBaseVersion === '1.0.23'
    && development.developmentTargetVersion === '1.0.23'
    && community.appVersion === '1.0.23'
    && community.gates?.githubReleasePublished === false
    && community.patchValidation?.previousPublicVersion === '1.0.22'
    && community.targetRelease?.tag === 'v1.0.23') return
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
  if (community.appVersion === '1.1.5') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.4'
      || !['1.1.4-to-1.1.5-pending', '1.1.4-to-1.1.5-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.5 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.4') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.3'
      || !['1.1.3-to-1.1.4-pending', '1.1.3-to-1.1.4-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.4 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.3') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.2'
      || !['1.1.2-to-1.1.3-pending', '1.1.2-to-1.1.3-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.3 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.2') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.1'
      || !['1.1.1-to-1.1.2-pending', '1.1.1-to-1.1.2-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.2 must retain its own official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.1') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.0'
      || !['1.1.0-to-1.1.1-pending', '1.1.0-to-1.1.1-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.1 must retain its own official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.0') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.0.26'
      || community.patchValidation?.managedUpdaterUpgradePath !== '1.0.26-to-1.1.0-pending') {
      throw new Error('1.1.0 must retain a separate official update observation and closed historical predecessor')
    }
    return
  }
  if (!['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) {
    throw new Error('Unknown v1.0.21 updater observation status')
  }
  const suffix = policy.status === 'hosted-managed-update-passed' ? 'passed' : 'pending'
  const expected = `1.0.20-to-1.0.21-${suffix}`
  if (receipt.managedUpdaterObservation !== expected) {
    throw new Error(`v1.0.21 updater status conflict: release receipt must be ${expected}`)
  }
  if (community.appVersion === '1.0.26') {
    if (suffix !== 'passed' || !(community.gates?.githubReleasePublished === false && community.release === null
        || community.gates?.githubReleasePublished === true && community.release?.tag === 'v1.0.26' && /^(?!0{40})[0-9a-f]{40}$/.test(community.release?.taggedCommit || '')) || community.patchValidation?.previousPublicVersion !== '1.0.25'
      || community.targetRelease?.tag !== 'v1.0.26'
      || !['1.0.25-to-1.0.26-pending', '1.0.25-to-1.0.26-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('v1.0.26 must retain its own update observation')
    }
    return
  }
  if (community.appVersion === '1.0.25') {
    if (suffix !== 'passed' || !(community.gates?.githubReleasePublished === false && community.release === null
        || community.gates?.githubReleasePublished === true && community.release?.tag === 'v1.0.25' && /^(?!0{40})[0-9a-f]{40}$/.test(community.release?.taggedCommit || '')) || community.patchValidation?.previousPublicVersion !== '1.0.24'
      || community.targetRelease?.tag !== 'v1.0.25'
      || !['1.0.24-to-1.0.25-pending', '1.0.24-to-1.0.25-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('v1.0.25 must retain its own update observation')
    }
    return
  }
  if (community.appVersion === '1.0.24') {
    if (suffix !== 'passed' || community.patchValidation?.previousPublicVersion !== '1.0.23'
      || community.targetRelease?.tag !== 'v1.0.24'
      || !(community.gates?.githubReleasePublished === false && community.release === null
        || community.gates?.githubReleasePublished === true && community.release?.tag === 'v1.0.24'
          && community.release?.taggedCommit === '9fa7ffa0f778773cfd999169e695e32a705168ae')
      || community.patchValidation?.managedUpdaterUpgradePath !== '1.0.23-to-1.0.24-pending') {
      throw new Error('v1.0.24 candidate must retain its own pending official update observation')
    }
    return
  }
  if (community.appVersion === '1.0.23') {
    if (suffix !== 'passed'
      || community.patchValidation?.previousPublicVersion !== '1.0.22'
      || community.targetRelease?.tag !== 'v1.0.23'
      || community.patchValidation?.managedUpdaterUpgradePath !== '1.0.22-to-1.0.23-pending'
      || (community.gates?.githubReleasePublished !== false && !(community.gates?.githubReleasePublished === true && community.release?.tag === 'v1.0.23' && community.release?.taggedCommit === '403a5122d169dfb238cd0a424d83e356f644fb08'))) {
      throw new Error('v1.0.21 updater status conflict: v1.0.23 candidate must retain a separate pending update path')
    }
    return
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
