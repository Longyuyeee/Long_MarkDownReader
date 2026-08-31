import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v118-m7-6-v1019-final-artifact-manifest-release-readiness-policy.json')
const predecessor = json('shared/post-v118-m7-5-v1019-hosted-installer-lifecycle-policy.json')
const imported = json('docs/evidence/post-v118-m7-5-v1019-hosted-installer-lifecycle/import-manifest.json')
const manifest = json('docs/evidence/v1.0.19-release/artifact-manifest.json')
const community = json('shared/v1-community-release-policy.json')
const development = json('shared/development-version-policy.json')
const published = fs.existsSync('shared/post-v118-m7-7-v1019-published-release-policy.json')
  ? json('shared/post-v118-m7-7-v1019-published-release-policy.json')
  : null
const checksum = fs.readFileSync('docs/evidence/v1.0.19-release/SHA256SUMS.txt')
const failures = []
const fail = message => failures.push(message)
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

if (policy.stage !== 'M7-6' || policy.predecessor !== predecessor.stage || predecessor.nextAction !== 'execute-m7-6-v1.0.19-final-artifact-manifest-and-release-readiness-audit') fail('M7-6 predecessor chain drift')
if (policy.status !== 'accepted-ready-to-publish' || policy.candidateSourceCommit !== predecessor.candidateSourceCommit || policy.hostedRunId !== imported.githubRunId || policy.hostedArtifactId !== imported.artifact?.id) fail('M7-6 immutable identity drift')
if (!policy.releaseReady || policy.releasePublished || policy.enterpriseReleaseCandidate || policy.sourceUserContentIncluded) fail('M7-6 release boundary drift')
const isPublished = published?.status === 'published-and-remote-assets-verified'
const expectedManifestStatus = isPublished ? 'published-remote-assets-verified-hosted-lifecycle-and-runtime-smoke-passed' : 'ready-to-publish-hosted-lifecycle-and-runtime-smoke-passed'
if (manifest.stage !== policy.stage || manifest.status !== expectedManifestStatus || manifest.sourceCommit !== policy.candidateSourceCommit || manifest.sourceVersion !== '1.0.19') fail('M7-6 manifest identity drift')
if (policy.artifacts?.length !== 2 || manifest.artifacts?.length !== 2 || community.candidate?.artifacts?.length !== 2) fail('M7-6 artifact count drift')
for (const expected of policy.artifacts) {
  for (const actual of [manifest.artifacts.find(item => item.target === expected.target), community.candidate.artifacts.find(item => item.target === expected.target)]) {
    if (!actual || actual.sourceFileName !== expected.sourceFileName || actual.fileName !== expected.fileName || actual.sizeBytes !== expected.sizeBytes || actual.sha256 !== expected.sha256 || actual.authenticodeStatus !== 'NotSigned') fail(`${expected.target} release mapping drift`)
  }
  if (!checksum.toString('utf8').includes(`${expected.sha256}  ${expected.fileName}`)) fail(`checksum missing ${expected.fileName}`)
}
if (checksum.length !== policy.checksumFile.sizeBytes || sha256(checksum) !== policy.checksumFile.sha256 || manifest.checksumFile?.sha256 !== policy.checksumFile.sha256) fail('M7-6 checksum drift')
if (manifest.runtimeSmoke?.checksPassed !== 6 || manifest.runtimeSmoke?.routesPassed !== 11 || !manifest.runtimeSmoke?.txtSaveReopenPassed || !manifest.runtimeSmoke?.jsonSaveReopenPassed) fail('M7-6 runtime smoke drift')
if (manifest.hostedInstalledLifecycle?.lifecycleChecksPassed !== 22 || manifest.hostedInstalledLifecycle?.installedWorkspaceChecksPassed !== 18 || manifest.hostedInstalledLifecycle?.installedRoutesPassed !== 11 || manifest.hostedInstalledLifecycle?.managementRollbackChecksPassed !== 7 || manifest.hostedInstalledLifecycle?.failedChecks !== 0) fail('M7-6 hosted lifecycle drift')
if (imported.repositoryCanonicalEvidence?.canonicalTreeSha256 !== '3b3acdd400ca523ed5c7bc40015e912f22a1fb6f50f5b2b3584b1b021eaa90b6') fail('M7-6 canonical evidence drift')
if (!isPublished && (community.currentStatus !== 'v1.0.19-community-release-ready-to-publish' || !community.releaseCandidate || community.release !== null || community.nextAction !== 'execute-m7-7-v1.0.19-tag-release-and-remote-asset-verification')) fail('M7-6 community ready state drift')
if (isPublished && (community.currentStatus !== 'v1.0.19-community-release-published' || !community.gates?.githubReleasePublished || community.release?.taggedCommit !== policy.candidateSourceCommit)) fail('M7-6 published successor drift')
if (!isPublished && (development.currentStage !== 'M7-7-v1.0.19-tag-release-and-remote-asset-verification' || development.binaryVersionTransition !== 'v1.0.19-release-ready' || development.publicVersion !== '1.0.18')) fail('M7-6 development handoff drift')
if (isPublished && (development.currentStage !== 'M7-8-v1.0.18-to-v1.0.19-managed-updater-observation' || development.publicVersion !== '1.0.19')) fail('M7-6 published development successor drift')
const tagCommit = execFileSync('git', ['rev-list', '-n', '1', 'v1.0.19'], { encoding: 'utf8' }).trim()
if ((!isPublished && tagCommit) || (isPublished && tagCommit !== policy.candidateSourceCommit)) fail('v1.0.19 tag publication boundary drift')

if (failures.length) { console.error(`M7-6 final readiness failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M7-6 accepted: hosted lifecycle artifacts, ASCII names and SHA256SUMS are frozen for v1.0.19 publication.')
