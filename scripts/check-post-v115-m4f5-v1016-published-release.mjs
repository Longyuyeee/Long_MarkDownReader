import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v115-m4f5-v1016-published-release-policy.json')
const predecessor = json('shared/post-v115-m4f4-v1016-final-artifact-manifest-release-readiness-policy.json')
const manifest = json('docs/evidence/v1.0.16-release/artifact-manifest.json')
const receipt = json('docs/evidence/v1.0.16-release/release-receipt.json')
const community = json('shared/v1-community-release-policy.json')
const development = json('shared/development-version-policy.json')
const m4f6 = json('shared/v116-managed-updater-lifecycle-policy.json')
const m5 = json('shared/post-v116-m5-0-v1017-scope-selection-policy.json')
const m5Producer = json('shared/post-v116-m5-1-odp-producer-selection-policy.json')
const m5Copy = json('shared/post-v116-m5-2-odp-simple-slide-copy-policy.json')
const m5Workspace = json('shared/post-v116-m5-3-odp-workspace-policy.json')
const m5ReleaseReadiness = json('shared/post-v116-m5-4-v1017-release-readiness-policy.json')
const m5CandidatePackaging = json('shared/post-v116-m5-5-v1017-candidate-packaging-policy.json')
const m5HostedLifecycle = json('shared/post-v116-m5-6-v1017-hosted-installer-lifecycle-policy.json')
const audit = fs.readFileSync('docs/Post_v1.0.15_M4F5_v1.0.16_Published_Release_and_Remote_Asset_Verification_Audit_2026-08-31.md', 'utf8')
const laterCandidateActive = community.appVersion !== '1.0.16'
const failures = []
const fail = message => failures.push(message)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

if (policy.stage !== 'M4F-5' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M4F-5 predecessor chain drifted')
if (!policy.releasePublished || !policy.remoteAssetsVerified || policy.enterpriseReleaseCandidate || policy.sourceUserContentIncluded) fail('M4F-5 release/privacy boundary drifted')
if (policy.candidateSourceCommit !== predecessor.candidateSourceCommit || policy.expected?.taggedCommit !== policy.candidateSourceCommit) fail('candidate source identity drifted')
if (git('rev-list', '-n', '1', policy.tag) !== policy.candidateSourceCommit) fail('release tag does not dereference to the candidate source commit')
if (receipt.status !== 'published-and-remote-assets-verified' || receipt.release?.databaseId !== policy.releaseDatabaseId || receipt.release?.tag !== policy.tag || receipt.release?.taggedCommit !== policy.candidateSourceCommit || receipt.release?.tagObject !== policy.tagObject || receipt.release?.isDraft || receipt.release?.isPrerelease || !receipt.release?.isLatest) fail('release receipt drifted')
if (receipt.assets?.length !== policy.expected.assetCount || receipt.assets.some(asset => !asset.remoteDownloadVerified || !Number.isInteger(asset.assetId))) fail('remote asset receipt is incomplete')
const expectedAssets = new Map([
  ...manifest.artifacts.map(item => [item.fileName, item]),
  [manifest.checksumFile.fileName, manifest.checksumFile],
])
for (const asset of receipt.assets ?? []) {
  const expected = expectedAssets.get(asset.name)
  if (!expected || asset.sizeBytes !== expected.sizeBytes || asset.sha256 !== expected.sha256) fail(`remote asset drifted: ${asset.name}`)
}
if (manifest.status !== 'published-remote-assets-verified-hosted-lifecycle-and-runtime-smoke-passed' || manifest.releaseReceipt !== 'release-receipt.json' || !manifest.boundaries?.releaseAssetsPublished) fail('published artifact manifest drifted')
const updaterComplete = m4f6.status === 'hosted-managed-update-passed' && m4f6.githubRun?.conclusion === 'success'
const expectedNextAction = updaterComplete ? 'v1.0.16-release-and-managed-updater-closure-complete' : 'execute-m4f6-v1.0.15-to-v1.0.16-managed-updater-observation'
const expectedStage = m5HostedLifecycle.status === 'hosted-installer-lifecycle-passed-release-readiness-pending'
  ? 'M5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit'
  : m5CandidatePackaging.status === 'accepted'
  ? `${m5CandidatePackaging.selectedNextStage.id}-${m5CandidatePackaging.selectedNextStage.name}`
  : m5ReleaseReadiness.status === 'accepted'
  ? `${m5ReleaseReadiness.selectedNextStage.id}-${m5ReleaseReadiness.selectedNextStage.name}`
  : m5Workspace.status === 'accepted'
  ? `${m5Workspace.selectedNextStage.id}-${m5Workspace.selectedNextStage.name}`
  : m5Copy.status === 'accepted'
  ? `${m5Copy.selectedNextStage.id}-${m5Copy.selectedNextStage.name}`
  : m5Producer.status === 'accepted'
  ? `${m5Producer.selectedNextStage.id}-${m5Producer.selectedNextStage.name}`
  : m5.status === 'scope-selected'
  ? `${m5.selectedNextStage.id}-${m5.selectedNextStage.name}`
  : updaterComplete ? 'M5-0-v1.0.17-scope-selection-audit' : 'M4F-6-v1.0.15-to-v1.0.16-managed-updater-observation'
if (!laterCandidateActive && (community.currentStatus !== 'v1.0.16-community-release-published' || !community.releaseCandidate || !community.gates?.githubReleasePublished || community.release?.databaseId !== policy.releaseDatabaseId || community.release?.taggedCommit !== policy.candidateSourceCommit || community.nextAction !== expectedNextAction)) fail('community published state drifted')
if (development.publicVersion !== '1.0.16' || development.publicTag !== policy.tag || development.publicTagCommit !== policy.candidateSourceCommit || development.developmentTargetVersion !== '1.0.17' || development.currentStage !== expectedStage || !['v1.0.16-public-release-published', 'v1.0.17-quality-gate-pending', 'v1.0.17-candidate-packaged', 'v1.0.17-hosted-lifecycle-passed'].includes(development.binaryVersionTransition)) fail('development/public handoff drifted')
if (updaterComplete && receipt.postReleaseManagedUpdaterObservation !== '1.0.15-to-1.0.16-passed') fail('post-release managed updater receipt drifted')
for (const token of ['预期与实际差异', '379466292', 'M4F-6', 'v1.0.15 → v1.0.16']) if (!audit.includes(token)) fail(`M4F-5 audit token missing: ${token}`)

if (failures.length) {
  console.error(`M4F-5 published release check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4F-5 accepted: v1.0.16 is published, the tag binds the real candidate, and all three remotely downloaded assets match the frozen manifest.')
