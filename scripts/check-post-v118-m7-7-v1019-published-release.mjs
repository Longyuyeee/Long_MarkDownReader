import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v118-m7-7-v1019-published-release-policy.json')
const predecessor = json('shared/post-v118-m7-6-v1019-final-artifact-manifest-release-readiness-policy.json')
const receipt = json('docs/evidence/v1.0.19-release/release-receipt.json')
const manifest = json('docs/evidence/v1.0.19-release/artifact-manifest.json')
const community = json('shared/v1-community-release-policy.json')
const development = json('shared/development-version-policy.json')
const checksum = fs.readFileSync('docs/evidence/v1.0.19-release/SHA256SUMS.txt')
const failures = []
const fail = message => failures.push(message)
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

if (policy.stage !== 'M7-7' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M7-7 predecessor chain drift')
if (policy.status !== 'published-and-remote-assets-verified' || !policy.releasePublished || !policy.remoteAssetsVerified || policy.enterpriseReleaseCandidate || policy.sourceUserContentIncluded) fail('M7-7 publication/privacy boundary drift')
if (git('rev-list', '-n', '1', policy.tag) !== policy.candidateSourceCommit || git('rev-parse', `${policy.tag}^{tag}`) !== policy.tagObject) fail('M7-7 annotated tag identity drift')
if (receipt.release?.databaseId !== policy.releaseDatabaseId || receipt.release?.tag !== policy.tag || receipt.release?.taggedCommit !== policy.candidateSourceCommit || receipt.release?.tagObject !== policy.tagObject || receipt.release?.isDraft || receipt.release?.isPrerelease || !receipt.release?.isLatest) fail('M7-7 release receipt drift')
if (receipt.assets?.length !== 3 || receipt.assets.some(asset => !asset.remoteDownloadVerified)) fail('M7-7 remote asset verification drift')

for (const expected of predecessor.artifacts) {
  const asset = receipt.assets.find(item => item.name === expected.fileName)
  if (!asset || asset.sizeBytes !== expected.sizeBytes || asset.sha256 !== expected.sha256 || asset.authenticodeStatus !== 'NotSigned') fail(`${expected.target} published asset drift`)
  if (!checksum.toString('utf8').includes(`${expected.sha256}  ${expected.fileName}`)) fail(`checksum missing ${expected.fileName}`)
}
const checksumAsset = receipt.assets.find(item => item.name === predecessor.checksumFile.fileName)
if (!checksumAsset || checksumAsset.sizeBytes !== predecessor.checksumFile.sizeBytes || checksumAsset.sha256 !== predecessor.checksumFile.sha256 || checksum.length !== predecessor.checksumFile.sizeBytes || sha256(checksum) !== predecessor.checksumFile.sha256) fail('M7-7 checksum asset drift')
if (manifest.status !== 'published-remote-assets-verified-hosted-lifecycle-and-runtime-smoke-passed' || !manifest.releasePublished || !manifest.boundaries?.releaseAssetsPublished || !manifest.boundaries?.managedUpdaterReleaseAssetsPresent) fail('M7-7 published manifest drift')
const updaterClosed = community.nextAction === 'v1.0.19-release-and-managed-updater-closure-complete'
if (community.currentStatus !== 'v1.0.19-community-release-published' || !community.releaseCandidate || !community.gates?.githubReleasePublished || community.release?.databaseId !== policy.releaseDatabaseId || community.nextAction !== (updaterClosed ? 'v1.0.19-release-and-managed-updater-closure-complete' : 'execute-m7-8-v1.0.18-to-v1.0.19-managed-updater-observation')) fail('M7-7 community published state drift')
if (development.publicVersion !== '1.0.19' || development.publicTag !== policy.tag || development.publicTagCommit !== policy.candidateSourceCommit || development.currentStage !== 'M7-8-v1.0.18-to-v1.0.19-managed-updater-observation' || development.binaryVersionTransition !== (updaterClosed ? 'v1.0.19-release-and-managed-updater-closed' : 'v1.0.19-public-release-published')) fail('M7-7 development handoff drift')

if (failures.length) { console.error(`M7-7 published release failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M7-7 accepted: v1.0.19 annotated tag, latest GitHub Release and three remotely downloaded assets are verified.')
