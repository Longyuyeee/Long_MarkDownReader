import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v116-m5-8-v1017-published-release-policy.json')
const predecessor = json('shared/post-v116-m5-7-v1017-final-artifact-manifest-release-readiness-policy.json')
const manifest = json('docs/evidence/v1.0.17-release/artifact-manifest.json')
const receipt = json('docs/evidence/v1.0.17-release/release-receipt.json')
const community = json('shared/v1-community-release-policy.json')
const development = json('shared/development-version-policy.json')
const updater = json('shared/v117-managed-updater-lifecycle-policy.json')
const failures = []
const fail = message => failures.push(message)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

if (policy.stage !== 'M5-8' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M5-8 predecessor chain drifted')
if (!policy.releasePublished || !policy.remoteAssetsVerified || policy.enterpriseReleaseCandidate || policy.sourceUserContentIncluded) fail('publication/privacy boundary drifted')
if (git('rev-list', '-n', '1', policy.tag) !== policy.candidateSourceCommit || git('rev-parse', `${policy.tag}^{tag}`) !== policy.tagObject) fail('release tag identity drifted')
if (receipt.status !== 'published-and-remote-assets-verified' || receipt.release?.databaseId !== policy.releaseDatabaseId || receipt.release?.taggedCommit !== policy.candidateSourceCommit || receipt.release?.tagObject !== policy.tagObject || receipt.release?.isDraft || receipt.release?.isPrerelease || !receipt.release?.isLatest) fail('release receipt drifted')
if (receipt.assets?.length !== 3 || receipt.assets.some(asset => !asset.remoteDownloadVerified)) fail('remote asset receipt drifted')
for (const expected of [...predecessor.artifacts, predecessor.checksumFile]) {
  const expectedName = expected.fileName
  const actual = receipt.assets.find(asset => asset.name === expectedName)
  if (!actual || actual.sizeBytes !== expected.sizeBytes || actual.sha256 !== expected.sha256) fail(`remote asset mismatch: ${expectedName}`)
}
if (manifest.status !== 'published-remote-assets-verified-hosted-lifecycle-and-runtime-smoke-passed' || !manifest.boundaries?.releaseAssetsPublished || !manifest.boundaries?.managedUpdaterReleaseAssetsPresent) fail('published artifact manifest drifted')
const updaterComplete = updater.status === 'hosted-managed-update-passed'
if (community.currentStatus !== 'v1.0.17-community-release-published' || !community.releaseCandidate || !community.gates?.githubReleasePublished || community.release?.databaseId !== policy.releaseDatabaseId || community.release?.taggedCommit !== policy.candidateSourceCommit || community.nextAction !== (updaterComplete ? 'v1.0.17-release-and-managed-updater-closure-complete' : 'execute-m5-9-v1.0.16-to-v1.0.17-managed-updater-observation')) fail('community published state drifted')
if (development.publicVersion !== '1.0.17' || development.publicTag !== policy.tag || development.publicTagCommit !== policy.candidateSourceCommit || development.runtimeBaseVersion !== '1.0.17' || development.developmentTargetVersion !== '1.0.18' || !(updaterComplete ? ['M6-0-v1.0.18-scope-selection-audit', 'M6-1-knowledge-graph-bounded-fullscreen-lifecycle-and-real-desktop-audit', 'M6-2-v1.0.18-next-slice-selection-audit'].includes(development.currentStage) : development.currentStage === 'M5-9-v1.0.16-to-v1.0.17-managed-updater-observation') || development.binaryVersionTransition !== (updaterComplete ? 'v1.0.17-release-and-managed-updater-closed' : 'v1.0.17-public-release-published')) fail('development/public handoff drifted')
if (failures.length) { console.error(`M5-8 published release check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M5-8 accepted: v1.0.17 tag, latest GitHub Release and three remotely downloaded assets match the frozen candidate.')
