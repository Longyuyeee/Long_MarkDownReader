import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json')
const predecessor = json('shared/post-v117-m6-5-v1018-hosted-installer-lifecycle-policy.json')
const imported = json('docs/evidence/post-v117-m6-5-v1018-hosted-installer-lifecycle/import-manifest.json')
const manifest = json('docs/evidence/v1.0.18-release/artifact-manifest.json')
const community = json('shared/v1-community-release-policy.json')
const development = json('shared/development-version-policy.json')
const published = fs.existsSync('shared/post-v117-m6-7-v1018-published-release-policy.json')
  ? json('shared/post-v117-m6-7-v1018-published-release-policy.json') : null
const updater = fs.existsSync('shared/v118-managed-updater-lifecycle-policy.json')
  ? json('shared/v118-managed-updater-lifecycle-policy.json') : null
const checksum = fs.readFileSync('docs/evidence/v1.0.18-release/SHA256SUMS.txt')
const failures = []
const fail = message => failures.push(message)
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checksumLf = Buffer.from(checksum.toString('utf8').replace(/\r\n/g, '\n'))
const checksumCrlf = Buffer.from(checksumLf.toString('utf8').replace(/\n/g, '\r\n'))
const checksumIdentityMatches = [checksum, checksumLf, checksumCrlf].some(bytes => bytes.length === policy.checksumFile.sizeBytes && sha256(bytes) === policy.checksumFile.sha256)

if (policy.stage !== 'M6-6' || policy.predecessor !== predecessor.stage || predecessor.nextAction !== 'execute-m6-6-v1.0.18-final-artifact-manifest-and-release-readiness-audit') fail('M6-6 predecessor chain drifted')
if (policy.status !== 'accepted-ready-to-publish' || policy.candidateSourceCommit !== predecessor.candidateSourceCommit
  || policy.hostedRunId !== imported.githubRunId || policy.hostedArtifactId !== imported.artifact?.id) fail('M6-6 immutable identity drifted')
if (!policy.releaseReady || policy.releasePublished || policy.enterpriseReleaseCandidate || policy.sourceUserContentIncluded) fail('release readiness boundary drifted')
const releasePublished = published?.status === 'published-and-remote-assets-verified'
const updaterComplete = updater?.status === 'hosted-managed-update-passed'
const expectedManifestStatus = releasePublished ? 'published-remote-assets-verified-hosted-lifecycle-and-runtime-smoke-passed' : 'ready-to-publish-hosted-lifecycle-and-runtime-smoke-passed'
if (manifest.stage !== policy.stage || manifest.status !== expectedManifestStatus
  || manifest.sourceCommit !== policy.candidateSourceCommit || manifest.sourceVersion !== policy.candidateVersion) fail('artifact manifest identity drifted')
if (policy.artifacts?.length !== 2 || manifest.artifacts?.length !== 2 || community.candidate?.artifacts?.length !== 2) fail('final installer count drifted')
for (const expected of policy.artifacts) {
  for (const actual of [manifest.artifacts.find(item => item.target === expected.target), community.candidate?.artifacts?.find(item => item.target === expected.target)]) {
    if (!actual || actual.sourceFileName !== expected.sourceFileName || actual.fileName !== expected.fileName || actual.sizeBytes !== expected.sizeBytes
      || actual.sha256 !== expected.sha256 || actual.authenticodeStatus !== 'NotSigned') fail(`${expected.target} release mapping drifted`)
  }
  if (!checksum.toString('utf8').includes(`${expected.sha256}  ${expected.fileName}`)) fail(`checksum missing ${expected.fileName}`)
}
if (!checksumIdentityMatches || manifest.checksumFile?.sha256 !== policy.checksumFile.sha256) fail('checksum receipt drifted')
if (manifest.runtimeSmoke?.checksPassed !== 6 || manifest.runtimeSmoke?.routesPassed !== 11 || !manifest.runtimeSmoke?.txtSaveReopenPassed || !manifest.runtimeSmoke?.jsonSaveReopenPassed) fail('runtime smoke facts drifted')
if (manifest.hostedInstalledLifecycle?.lifecycleChecksPassed !== 22 || manifest.hostedInstalledLifecycle?.installedWorkspaceChecksPassed !== 18
  || manifest.hostedInstalledLifecycle?.installedRoutesPassed !== 11 || manifest.hostedInstalledLifecycle?.managementRollbackChecksPassed !== 7
  || manifest.hostedInstalledLifecycle?.failedChecks !== 0) fail('hosted lifecycle facts drifted')
if (imported.repositoryCanonicalEvidence?.canonicalTreeSha256 !== '1dbb47325812f166608921528bb88f08275decf980450a7d36e1dfc8d12b3013') fail('canonical evidence receipt drifted')
if (community.currentStatus !== (releasePublished ? 'v1.0.18-community-release-published' : 'v1.0.18-community-release-ready-to-publish')
  || !community.releaseCandidate || (releasePublished ? community.release?.databaseId !== published.releaseDatabaseId : community.release !== null)
  || community.nextAction !== (updaterComplete ? 'v1.0.18-release-and-managed-updater-closure-complete' : releasePublished ? 'execute-m6-8-v1.0.17-to-v1.0.18-managed-updater-observation' : 'execute-m6-7-v1.0.18-tag-release-and-remote-asset-verification')) fail('community ready state drifted')
if (development.currentStage !== (releasePublished ? 'M6-8-v1.0.17-to-v1.0.18-managed-updater-observation' : 'M6-7-v1.0.18-tag-release-and-remote-asset-verification')
  || development.binaryVersionTransition !== (updaterComplete ? 'v1.0.18-release-and-managed-updater-closed' : releasePublished ? 'v1.0.18-public-release-published' : 'v1.0.18-release-ready')
  || development.publicVersion !== (releasePublished ? '1.0.18' : '1.0.17')) fail('development ready handoff drifted')
const candidateTags = execFileSync('git', ['tag', '--list', 'v1.0.18'], { encoding: 'utf8' }).trim()
if (releasePublished ? execFileSync('git', ['rev-list', '-n', '1', 'v1.0.18'], { encoding: 'utf8' }).trim() !== policy.candidateSourceCommit : Boolean(candidateTags)) fail('v1.0.18 tag/publication boundary drifted')

if (failures.length) {
  console.error(`M6-6 release readiness failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M6-6 accepted: hosted lifecycle artifacts, public names, SHA256SUMS and unsigned community release boundaries are ready for M6-7 publication.')
