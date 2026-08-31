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
const published = json('shared/post-v116-m5-8-v1017-published-release-policy.json')
const updater = json('shared/v117-managed-updater-lifecycle-policy.json')
const checksum = fs.readFileSync('docs/evidence/v1.0.17-release/SHA256SUMS.txt')
const failures = []
const fail = message => failures.push(message)
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checksumLf = Buffer.from(checksum.toString('utf8').replace(/\r\n/g, '\n'))
const checksumCrlf = Buffer.from(checksumLf.toString('utf8').replace(/\n/g, '\r\n'))
const checksumIdentityMatches = [checksum, checksumLf, checksumCrlf].some(bytes => bytes.length === policy.checksumFile.sizeBytes && sha256(bytes) === policy.checksumFile.sha256)

if (policy.stage !== 'M5-7' || policy.predecessor !== predecessor.stage || predecessor.nextAction !== 'execute-m5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit') fail('M5-7 predecessor chain drifted')
if (policy.candidateSourceCommit !== predecessor.candidateSourceCommit || policy.hostedRunId !== imported.githubRunId || policy.hostedArtifactId !== imported.artifact?.id) fail('M5-7 immutable identity drifted')
if (!policy.releaseReady || policy.releasePublished || policy.enterpriseReleaseCandidate || policy.sourceUserContentIncluded) fail('release readiness boundary drifted')
const releasePublished = published.status === 'published-and-remote-assets-verified'
const releaseClosed = updater.status === 'hosted-managed-update-passed'
const laterCandidateActive = ['1.0.18', '1.0.19'].includes(community.appVersion) && /^M[67]-[0-9]+-/.test(development.currentStage)
const laterPublicActive = ['1.0.18', '1.0.19'].includes(development.publicVersion) && development.publicTag === `v${development.publicVersion}`
const expectedManifestStatus = releasePublished ? 'published-remote-assets-verified-hosted-lifecycle-and-runtime-smoke-passed' : 'ready-to-publish-hosted-lifecycle-and-runtime-smoke-passed'
if (manifest.stage !== policy.stage || manifest.status !== expectedManifestStatus || manifest.sourceCommit !== policy.candidateSourceCommit || manifest.sourceVersion !== policy.candidateVersion) fail('artifact manifest identity drifted')
if (policy.artifacts?.length !== 2 || manifest.artifacts?.length !== 2 || (!laterCandidateActive && community.candidate?.artifacts?.length !== 2)) fail('final installer count drifted')
for (const expected of policy.artifacts) {
  const receipts = [manifest.artifacts.find(item => item.target === expected.target)]
  if (!laterCandidateActive) receipts.push(community.candidate?.artifacts?.find(item => item.target === expected.target))
  for (const actual of receipts) {
    if (!actual || actual.sourceFileName !== expected.sourceFileName || actual.fileName !== expected.fileName || actual.sizeBytes !== expected.sizeBytes || actual.sha256 !== expected.sha256 || actual.authenticodeStatus !== 'NotSigned') fail(`${expected.target} release mapping drifted`)
  }
  if (!checksum.toString('utf8').includes(`${expected.sha256}  ${expected.fileName}`)) fail(`checksum missing ${expected.fileName}`)
}
if (!checksumIdentityMatches || manifest.checksumFile?.sha256 !== policy.checksumFile.sha256) fail('checksum receipt drifted')
if (manifest.runtimeSmoke?.checksPassed !== 6 || manifest.runtimeSmoke?.routesPassed !== 11 || !manifest.runtimeSmoke?.txtSaveReopenPassed || !manifest.runtimeSmoke?.jsonSaveReopenPassed) fail('runtime smoke facts drifted')
if (manifest.hostedInstalledLifecycle?.lifecycleChecksPassed !== 22 || manifest.hostedInstalledLifecycle?.installedWorkspaceChecksPassed !== 18 || manifest.hostedInstalledLifecycle?.installedRoutesPassed !== 11 || manifest.hostedInstalledLifecycle?.managementRollbackChecksPassed !== 7 || manifest.hostedInstalledLifecycle?.failedChecks !== 0) fail('hosted lifecycle facts drifted')
if (imported.repositoryCanonicalEvidence?.canonicalTreeSha256 !== 'defb7ae3c255f211b1d4d68ce405e6b2dea0b1b67bc42503d180f70595c336f1') fail('canonical evidence receipt drifted')
if (!laterCandidateActive && (community.currentStatus !== (releasePublished ? 'v1.0.17-community-release-published' : 'v1.0.17-community-release-ready-to-publish')
  || !community.releaseCandidate || (releasePublished ? community.release?.databaseId !== published.releaseDatabaseId : community.release !== null)
  || community.nextAction !== (releaseClosed ? 'v1.0.17-release-and-managed-updater-closure-complete' : releasePublished ? 'execute-m5-9-v1.0.16-to-v1.0.17-managed-updater-observation' : 'execute-m5-8-v1.0.17-tag-release-and-remote-asset-verification'))) fail('community ready state drifted')
if (!(releaseClosed ? /^M[67]-[0-9]+-/.test(development.currentStage) : development.currentStage === (releasePublished ? 'M5-9-v1.0.16-to-v1.0.17-managed-updater-observation' : 'M5-8-v1.0.17-tag-release-and-remote-asset-verification'))
  || !(releaseClosed ? ['v1.0.17-release-and-managed-updater-closed', 'v1.0.18-quality-gate-pending', 'v1.0.18-candidate-packaged', 'v1.0.18-hosted-installer-lifecycle-passed', 'v1.0.18-release-ready', 'v1.0.18-public-release-published', 'v1.0.18-release-and-managed-updater-closed', 'v1.0.19-quality-gate-pending', 'v1.0.19-candidate-packaged', 'v1.0.19-hosted-installer-lifecycle-passed', 'v1.0.19-release-ready', 'v1.0.19-public-release-published', 'v1.0.19-release-and-managed-updater-closed'].includes(development.binaryVersionTransition) : development.binaryVersionTransition === (releasePublished ? 'v1.0.17-public-release-published' : 'v1.0.17-release-ready'))
  || development.publicVersion !== (laterPublicActive ? development.runtimeBaseVersion : releasePublished ? '1.0.17' : '1.0.16')) fail('development ready handoff drifted')
const tagCommit = execFileSync('git', ['rev-list', '-n', '1', 'v1.0.17'], { encoding: 'utf8' }).trim()
if (releasePublished ? tagCommit !== policy.candidateSourceCommit : Boolean(tagCommit)) fail('v1.0.17 tag/publication boundary drifted')
if (failures.length) { console.error(`M5-7 release readiness failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log(`M5-7 accepted: hosted lifecycle artifacts, SHA256SUMS and release boundaries remain valid${releasePublished ? ' after M5-8 publication' : ' for M5-8 publication'}.`)
