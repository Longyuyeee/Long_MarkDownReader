import fs from 'node:fs'
import crypto from 'node:crypto'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const failures = []
const fail = message => failures.push(message)
const sha256 = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')

const pkg = json('package.json')
const tauri = json('src-tauri/tauri.conf.json')
const policy = json('shared/v1-community-release-policy.json')
const updater = json('shared/community-updater-policy.json')
const previousLifecycle = json('docs/evidence/ea-5b2-installed-default-app/audit-manifest.json')
const cargo = read('src-tauri/Cargo.toml')
const readme = read('README.md')
const backendUpdater = read('src-tauri/src/commands/updater.rs')
const tag = `v${pkg.version}`
const releaseUrl = `https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/${tag}`
const auditPath = `docs/V${pkg.version.replaceAll('.', '_')}_Unsigned_Community_Release_Audit_${policy.generatedAt}.md`
const notesPath = `docs/RELEASE_NOTES_v${pkg.version}.md`
const [major, minor, patch] = pkg.version.split('.').map(Number)
const previousPublicVersion = `${major}.${minor}.${patch - 1}`
const managedUpdaterUpgradePrefix = `${previousPublicVersion}-to-${pkg.version}`
const managedUpdaterPolicyToken = previousPublicVersion.replace(/^1\.0\./, '1')
const managedUpdaterLifecyclePath = `shared/v${managedUpdaterPolicyToken}-managed-updater-lifecycle-policy.json`
const managedUpdaterLifecycle = fs.existsSync(managedUpdaterLifecyclePath) ? json(managedUpdaterLifecyclePath) : null
const previousReleaseReceiptPath = `docs/evidence/v${previousPublicVersion}-release/release-receipt.json`
const previousReleaseReceipt = fs.existsSync(previousReleaseReceiptPath) ? json(previousReleaseReceiptPath) : null

if (!/^1\.\d+\.\d+$/.test(pkg.version) || tauri.version !== pkg.version || !cargo.includes(`version = "${pkg.version}"`)) fail('V1 version identity drift')
if (tauri.bundle?.createUpdaterArtifacts !== false) fail('unsigned managed-SHA256 release must not require legacy Tauri updater signatures')
if (policy.schemaVersion !== 1 || policy.stage !== 'V1' || policy.appVersion !== pkg.version || policy.channel !== 'community-unsigned') fail('V1 policy identity drift')
if (policy.userDecision?.authenticodeRequired !== false || policy.userDecision?.unsignedCommunityReleaseApproved !== true || policy.userDecision?.unknownPublisherWarningRequired !== true) fail('unsigned community decision drift')
if (policy.targetRelease?.tag !== tag || policy.targetRelease?.url !== releaseUrl || policy.targetRelease?.assetMode !== 'managed-nsis-msi-with-sha256') fail('target release drift')
if (updater.status !== 'active-from-v1.0.5' || updater.migration?.firstManagedUpdaterVersion !== '1.0.5' || policy.updater?.mode !== 'github-release-sha256-managed' || policy.updater?.enabled !== true || policy.updater?.automaticCheckIntervalHours !== 24 || policy.updater?.integrityDigestRequired !== true || policy.updater?.latestManifestAsset !== null) fail('managed updater release boundary drift')
for (const token of ['api.github.com/repos/Longyuyeee/Long_MarkDownReader/releases/latest', 'Sha256::new()', 'hasher.update(&chunk)', 'hasher.finalize()', '.chunk()', 'LongEdit_{expected_version}_x64-setup.exe']) if (!backendUpdater.includes(token)) fail(`managed updater implementation missing: ${token}`)
const previousUpdaterLifecycleAccepted = managedUpdaterLifecycle?.status === 'hosted-managed-update-passed'
  || (pkg.version === '1.0.9'
    && managedUpdaterLifecycle?.status === 'hosted-automatic-relaunch-failed'
    && managedUpdaterLifecycle.githubRun?.id === 31486852139
    && managedUpdaterLifecycle.githubRun?.failedCheck === 'automatic-relaunch-after-managed-update'
    && policy.patchValidation?.scope === 'updater-relaunch-retry-and-stability-recovery')
const previousPublishedReceiptAccepted = previousReleaseReceipt?.status === 'published-and-remote-assets-verified'
  && previousReleaseReceipt.release?.tag === `v${previousPublicVersion}`
  && previousReleaseReceipt.release?.isDraft === false
  && previousReleaseReceipt.release?.isPrerelease === false
  && previousReleaseReceipt.managedUpdaterObservation?.endsWith(`-to-${previousPublicVersion}-pending`)
const previousUpdaterAccepted = previousUpdaterLifecycleAccepted || previousPublishedReceiptAccepted
const previousVersionBaselineAccepted = managedUpdaterLifecycle
  ? managedUpdaterLifecycle.releases?.current?.version === previousPublicVersion
  : previousReleaseReceipt?.release?.tag === `v${previousPublicVersion}`
if (previousLifecycle.stage !== 'EA-5B2B'
  || previousLifecycle.artifacts?.appVersion !== policy.patchValidation?.previousInstalledLifecycleEvidenceVersion
  || previousLifecycle.checks?.lifecycle?.failed !== 0
  || previousLifecycle.checks?.installedArtifactSmoke?.failed !== 0
  || !previousUpdaterAccepted
  || !previousVersionBaselineAccepted
  || policy.patchValidation?.previousPublicVersion !== previousPublicVersion
  || policy.patchValidation?.previousInstalledLifecycleEvidenceVersion !== '1.0.5'
  || policy.patchValidation?.previousEvidenceInheritedAsCurrent !== false
  || ![`${managedUpdaterUpgradePrefix}-pending`, `${managedUpdaterUpgradePrefix}-passed`].includes(policy.patchValidation?.managedUpdaterUpgradePath)) fail('previous release and managed updater baseline drift')
if (!fs.existsSync(auditPath) || !fs.existsSync(notesPath)) fail('current release documents are missing')
for (const token of [tag, '未知发布者', 'SHA-256', '自动更新']) if (!readme.includes(token)) fail(`README release disclosure missing: ${token}`)

const published = policy.gates?.githubReleasePublished === true
const qualityVerified = !published && policy.gates?.qualityGatePassed === true
const ready = qualityVerified
  && policy.gates?.msiBuilt === true
  && policy.gates?.nsisBuilt === true
  && policy.gates?.artifactHashesVerified === true
  && policy.gates?.installedLifecyclePassed === true
const lifecycleVerified = ready
  && policy.releaseCandidate === false
  && policy.currentStatus === `${tag}-community-release-hosted-lifecycle-passed-final-release-audit-pending`
if (published) {
  if (!policy.releaseCandidate || policy.currentStatus !== `${tag}-community-release-published` || policy.release?.tag !== tag || policy.release?.url !== releaseUrl || !/^[0-9a-f]{40}$/.test(policy.release?.taggedCommit ?? '')) fail('published release receipt drift')
} else if (lifecycleVerified) {
  if (policy.gates?.githubReleasePublished !== false
    || policy.patchValidation?.fullInstalledLifecycleRerun !== true
    || policy.patchValidation?.managedUpdaterUpgradePath !== `${managedUpdaterUpgradePrefix}-passed`
    || !Number.isInteger(policy.candidate?.hostedInstalledLifecycleRunId)
    || policy.candidate?.artifacts?.length !== 2
    || policy.candidate.artifacts.some(item => !['msi', 'nsis'].includes(item.target) || item.authenticodeStatus !== 'NotSigned')) fail('hosted-lifecycle-passed intermediate state drift')
} else if (ready) {
  if (!policy.releaseCandidate
    || policy.currentStatus !== `${tag}-community-release-ready-to-publish`
    || policy.gates?.msiBuilt !== true
    || policy.gates?.nsisBuilt !== true
    || policy.gates?.artifactHashesVerified !== true
    || policy.gates?.installedLifecyclePassed !== true
    || policy.patchValidation?.fullInstalledLifecycleRerun !== true
    || !Number.isInteger(policy.candidate?.hostedInstalledLifecycleRunId)) fail('ready-to-publish state drift')
} else if (qualityVerified) {
  if (policy.releaseCandidate !== false
    || policy.currentStatus !== `${tag}-community-release-quality-gate-and-runtime-smoke-passed-installer-pending`
    || policy.gates?.frontendBuildPassed !== true
    || policy.gates?.rustLockedCheckPassed !== true
    || policy.gates?.productionDependencyAuditPassed !== true
    || policy.gates?.localRuntimeSmokePassed !== true
    || policy.gates?.msiBuilt !== false
    || policy.gates?.nsisBuilt !== false
    || policy.gates?.artifactHashesVerified !== false
    || policy.gates?.installedLifecyclePassed !== false
    || !/^[0-9a-f]{40}$/.test(policy.candidate?.artifactSourceCommit ?? '')) fail('quality-verified installer-pending state drift')
} else if (policy.releaseCandidate !== false || policy.currentStatus !== `${tag}-community-release-quality-gate-pending` || policy.gates?.msiBuilt !== false || policy.gates?.nsisBuilt !== false) {
  fail('pre-quality release state drift')
}

if ((ready && !lifecycleVerified) || published) {
  const manifestPath = `docs/evidence/v${pkg.version}-release/artifact-manifest.json`
  if (!fs.existsSync(manifestPath)) fail('current artifact manifest is missing')
  else {
    const manifest = json(manifestPath)
    if (manifest.appVersion !== pkg.version || manifest.sourceVersion !== pkg.version || manifest.sourceCommit !== policy.candidate?.artifactSourceCommit || manifest.artifacts?.length !== 2 || manifest.artifacts.some(item => item.authenticodeStatus !== 'NotSigned')) fail('current artifact manifest drift')
    if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit ?? '')) fail('artifact source commit is invalid')
    if (manifest.qualityGate?.status !== 'passed'
      || manifest.qualityGate?.command !== policy.candidate?.qualityGateCommand
      || manifest.hostedInstalledLifecycle?.status !== 'passed'
      || manifest.hostedInstalledLifecycle?.runId !== policy.candidate?.hostedInstalledLifecycleRunId
      || manifest.hostedInstalledLifecycle?.sourceCommit !== manifest.sourceCommit
      || manifest.hostedInstalledLifecycle?.lifecycleChecksPassed !== 22
      || manifest.hostedInstalledLifecycle?.installedWorkspaceChecksPassed !== 18
      || manifest.hostedInstalledLifecycle?.installedRoutesPassed !== 11
      || manifest.hostedInstalledLifecycle?.managementRollbackChecksPassed !== 7
      || manifest.hostedInstalledLifecycle?.failedChecks !== 0
      || manifest.hostedInstalledLifecycle?.sourceUserContentIncluded !== false
      || manifest.runtimeSmoke?.status !== 'passed-real-tauri-debug-webview2'
      || manifest.runtimeSmoke?.checksPassed !== 6
      || manifest.runtimeSmoke?.routesPassed !== 11
      || manifest.boundaries?.communityUnsigned !== true
      || manifest.boundaries?.enterprisePromotionEligible !== false) fail('current release evidence boundary drift')
    for (const artifact of manifest.artifacts ?? []) {
      const candidate = policy.candidate?.artifacts?.find(item => item.target === artifact.target)
      if (!candidate || candidate.fileName !== artifact.fileName || candidate.sizeBytes !== artifact.sizeBytes || candidate.sha256 !== artifact.sha256 || candidate.authenticodeStatus !== artifact.authenticodeStatus) fail(`candidate artifact drift: ${artifact.target}`)
    }

    const hostedRoot = manifest.hostedInstalledLifecycle?.evidenceRoot
    const hostedManifestPath = manifest.hostedInstalledLifecycle?.evidenceManifest
    if (!fs.existsSync(hostedManifestPath)) fail('hosted lifecycle import manifest is missing')
    else {
      const hosted = json(hostedManifestPath)
      if (hosted.status !== 'hosted-installer-lifecycle-passed'
        || hosted.githubRunId !== policy.candidate?.hostedInstalledLifecycleRunId
        || hosted.productSourceCommit !== manifest.sourceCommit
        || hosted.appVersion !== pkg.version
        || hosted.checks?.lifecyclePassed !== 22
        || hosted.checks?.lifecycleFailed !== 0
        || hosted.checks?.installedArtifactPassed !== 18
        || hosted.checks?.installedArtifactFailed !== 0
        || hosted.checks?.installedRoutesPassed !== 11
        || hosted.checks?.managementRollbackPassed !== 7
        || hosted.enterpriseReleaseCandidate !== false
        || hosted.sourceUserContentIncluded !== false) fail('hosted lifecycle import boundary drift')
    }

    if (published) {
      const receiptPath = `docs/evidence/v${pkg.version}-release/release-receipt.json`
      if (!fs.existsSync(receiptPath)) fail('published release receipt is missing')
      else {
        const receipt = json(receiptPath)
        if (receipt.status !== 'published-and-remote-assets-verified'
          || receipt.release?.tag !== tag
          || receipt.release?.url !== releaseUrl
          || receipt.release?.taggedCommit !== policy.release?.taggedCommit
          || receipt.release?.databaseId !== policy.release?.databaseId
          || receipt.release?.isDraft !== false
          || receipt.release?.isPrerelease !== false
          || receipt.authenticodeStatus !== 'NotSigned'
          || receipt.sourceUserContentIncluded !== false
          || receipt.managedUpdaterObservation !== policy.patchValidation?.managedUpdaterUpgradePath
          || manifest.status !== 'published-remote-assets-verified-hosted-lifecycle-and-runtime-smoke-passed'
          || manifest.releaseReceipt !== 'release-receipt.json'
          || manifest.boundaries?.managedUpdaterReleaseAssetsPresent !== true
          || manifest.boundaries?.legacyTauriUpdaterArtifactsPresent !== false) fail('published remote receipt boundary drift')

        const expectedAssets = new Map([
          ...manifest.artifacts.filter(item => item.target === 'msi' || item.target === 'nsis').map(item => [item.fileName, { sizeBytes: item.sizeBytes, sha256: item.sha256 }]),
          [manifest.checksumFile.fileName, { sizeBytes: manifest.checksumFile.sizeBytes, sha256: manifest.checksumFile.sha256 }],
        ])
        if (receipt.assets?.length !== expectedAssets.size) fail('published remote asset count drift')
        for (const asset of receipt.assets ?? []) {
          const expected = expectedAssets.get(asset.name)
          if (!expected || asset.sizeBytes !== expected.sizeBytes || asset.sha256 !== expected.sha256 || asset.remoteDownloadVerified !== true || !Number.isInteger(asset.assetId)) fail(`published remote asset drift: ${asset.name}`)
        }
      }
    }
  }
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}
console.log(`V1 community release contract passed: ${tag} is ${published ? 'published' : lifecycleVerified ? 'hosted lifecycle verified with final release audit pending' : ready ? 'ready to publish' : qualityVerified ? 'quality verified with installer evidence pending' : 'awaiting quality gate and package evidence'} with managed SHA-256 updates.`)
