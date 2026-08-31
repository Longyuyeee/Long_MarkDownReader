import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v116-m5-7-v1017-final-artifact-manifest-release-readiness-policy.json')
const predecessor = json('shared/post-v116-m5-6-v1017-hosted-installer-lifecycle-policy.json')
const imported = json('docs/evidence/post-v116-m5-6-v1017-hosted-installer-lifecycle/import-manifest.json')
const manifest = json('docs/evidence/v1.0.17-release/artifact-manifest.json')
const community = json('shared/v1-community-release-policy.json')
const development = json('shared/development-version-policy.json')
const checksum = fs.readFileSync('docs/evidence/v1.0.17-release/SHA256SUMS.txt')
const failures = []
const fail = message => failures.push(message)
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

if (policy.stage !== 'M5-7' || policy.predecessor !== predecessor.stage || predecessor.nextAction !== 'execute-m5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit') fail('M5-7 predecessor chain drifted')
if (policy.candidateSourceCommit !== predecessor.candidateSourceCommit || policy.hostedRunId !== imported.githubRunId || policy.hostedArtifactId !== imported.artifact?.id) fail('M5-7 immutable identity drifted')
if (!policy.releaseReady || policy.releasePublished || policy.enterpriseReleaseCandidate || policy.sourceUserContentIncluded) fail('release readiness boundary drifted')
if (manifest.stage !== policy.stage || manifest.status !== 'ready-to-publish-hosted-lifecycle-and-runtime-smoke-passed' || manifest.sourceCommit !== policy.candidateSourceCommit || manifest.sourceVersion !== policy.candidateVersion) fail('artifact manifest identity drifted')
if (policy.artifacts?.length !== 2 || manifest.artifacts?.length !== 2 || community.candidate?.artifacts?.length !== 2) fail('final installer count drifted')
for (const expected of policy.artifacts) {
  for (const actual of [manifest.artifacts.find(item => item.target === expected.target), community.candidate.artifacts.find(item => item.target === expected.target)]) {
    if (!actual || actual.sourceFileName !== expected.sourceFileName || actual.fileName !== expected.fileName || actual.sizeBytes !== expected.sizeBytes || actual.sha256 !== expected.sha256 || actual.authenticodeStatus !== 'NotSigned') fail(`${expected.target} release mapping drifted`)
  }
  if (!checksum.toString('utf8').includes(`${expected.sha256}  ${expected.fileName}`)) fail(`checksum missing ${expected.fileName}`)
}
if (checksum.length !== policy.checksumFile.sizeBytes || sha256(checksum) !== policy.checksumFile.sha256 || manifest.checksumFile?.sha256 !== policy.checksumFile.sha256) fail('checksum receipt drifted')
if (manifest.runtimeSmoke?.checksPassed !== 6 || manifest.runtimeSmoke?.routesPassed !== 11 || !manifest.runtimeSmoke?.txtSaveReopenPassed || !manifest.runtimeSmoke?.jsonSaveReopenPassed) fail('runtime smoke facts drifted')
if (manifest.hostedInstalledLifecycle?.lifecycleChecksPassed !== 22 || manifest.hostedInstalledLifecycle?.installedWorkspaceChecksPassed !== 18 || manifest.hostedInstalledLifecycle?.installedRoutesPassed !== 11 || manifest.hostedInstalledLifecycle?.managementRollbackChecksPassed !== 7 || manifest.hostedInstalledLifecycle?.failedChecks !== 0) fail('hosted lifecycle facts drifted')
if (imported.repositoryCanonicalEvidence?.canonicalTreeSha256 !== 'defb7ae3c255f211b1d4d68ce405e6b2dea0b1b67bc42503d180f70595c336f1') fail('canonical evidence receipt drifted')
if (community.currentStatus !== 'v1.0.17-community-release-ready-to-publish' || !community.releaseCandidate || community.release !== null || community.nextAction !== 'execute-m5-8-v1.0.17-tag-release-and-remote-asset-verification') fail('community ready state drifted')
if (development.currentStage !== 'M5-8-v1.0.17-tag-release-and-remote-asset-verification' || development.binaryVersionTransition !== 'v1.0.17-release-ready' || development.publicVersion !== '1.0.16') fail('development ready handoff drifted')
if (execFileSync('git', ['tag', '--list', 'v1.0.17'], { encoding: 'utf8' }).trim()) fail('v1.0.17 tag exists before M5-8')
if (failures.length) { console.error(`M5-7 release readiness failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M5-7 accepted: hosted lifecycle artifacts, SHA256SUMS, release notes and publication boundaries are ready for M5-8.')
