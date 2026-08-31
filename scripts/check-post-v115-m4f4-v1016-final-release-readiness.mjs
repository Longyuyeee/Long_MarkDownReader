import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const policy = json('shared/post-v115-m4f4-v1016-final-artifact-manifest-release-readiness-policy.json')
const predecessor = json('shared/post-v115-m4f3a-v1016-hosted-installer-lifecycle-handoff-policy.json')
const imported = json('docs/evidence/post-v115-m4f3-v1016-hosted-installer-lifecycle/import-manifest.json')
const manifest = json('docs/evidence/v1.0.16-release/artifact-manifest.json')
const community = json('shared/v1-community-release-policy.json')
const development = json('shared/development-version-policy.json')
const checksumBytes = fs.readFileSync('docs/evidence/v1.0.16-release/SHA256SUMS.txt')
const releaseNotes = fs.readFileSync('docs/RELEASE_NOTES_v1.0.16.md', 'utf8')
const readme = fs.readFileSync('README.md', 'utf8')
const audit = fs.readFileSync('docs/Post_v1.0.15_M4F4_v1.0.16_Final_Artifact_Manifest_and_Release_Readiness_Audit_2026-08-31.md', 'utf8')
const failures = []
const fail = message => failures.push(message)

if (policy.stage !== 'M4F-4' || policy.predecessor !== predecessor.stage || predecessor.nextAction !== 'execute-m4f4-final-artifact-manifest-release-notes-and-release-readiness-audit') fail('M4F-4 predecessor chain drifted')
if (policy.candidateSourceCommit !== predecessor.candidateSourceCommit || policy.hostedRunId !== 33322246630 || policy.hostedArtifactId !== 9735798998) fail('M4F-4 immutable identity drifted')
if (!policy.releaseReady || policy.releasePublished || policy.enterpriseReleaseCandidate || policy.sourceUserContentIncluded) fail('M4F-4 promotion/privacy boundary drifted')
if (manifest.stage !== policy.stage || manifest.status !== 'ready-to-publish-hosted-lifecycle-and-runtime-smoke-passed' || manifest.sourceCommit !== policy.candidateSourceCommit || manifest.sourceVersion !== policy.candidateVersion) fail('final artifact manifest identity drifted')
if (manifest.artifacts?.length !== 2 || policy.artifacts?.length !== 2 || community.candidate?.artifacts?.length !== 2) fail('final installer count drifted')
for (const expected of policy.artifacts) {
  const actual = manifest.artifacts.find(item => item.target === expected.target)
  const candidate = community.candidate.artifacts.find(item => item.target === expected.target)
  for (const item of [actual, candidate]) if (!item || item.sourceFileName !== expected.sourceFileName || item.fileName !== expected.fileName || item.sizeBytes !== expected.sizeBytes || item.sha256 !== expected.sha256 || item.authenticodeStatus !== 'NotSigned') fail(`${expected.target} release mapping drifted`)
}
if (checksumBytes.length !== policy.checksumFile.sizeBytes || sha256(checksumBytes) !== policy.checksumFile.sha256 || manifest.checksumFile.sha256 !== policy.checksumFile.sha256) fail('SHA256SUMS receipt drifted')
for (const artifact of policy.artifacts) if (!checksumBytes.toString('utf8').includes(`${artifact.sha256}  ${artifact.fileName}`)) fail(`SHA256SUMS missing ${artifact.fileName}`)
if (manifest.runtimeSmoke?.status !== 'passed-real-tauri-debug-webview2' || manifest.runtimeSmoke?.checksPassed !== 6 || manifest.runtimeSmoke?.routesPassed !== 11 || !manifest.runtimeSmoke?.txtSaveReopenPassed || !manifest.runtimeSmoke?.jsonSaveReopenPassed) fail('real runtime smoke facts drifted')
if (manifest.hostedInstalledLifecycle?.runId !== policy.hostedRunId || manifest.hostedInstalledLifecycle?.lifecycleChecksPassed !== 22 || manifest.hostedInstalledLifecycle?.installedWorkspaceChecksPassed !== 18 || manifest.hostedInstalledLifecycle?.installedRoutesPassed !== 11 || manifest.hostedInstalledLifecycle?.managementRollbackChecksPassed !== 7 || manifest.hostedInstalledLifecycle?.failedChecks !== 0) fail('hosted lifecycle facts drifted')
if (imported.repositoryCanonicalEvidence?.canonicalTreeSha256 !== '8488388c57a5646454a8d6ab7723ddcdbe135ce5259ede436d89b990ed045ad0') fail('cross-platform evidence receipt drifted')
if (community.currentStatus !== 'v1.0.16-community-release-ready-to-publish' || community.releaseCandidate !== true || community.gates?.githubReleasePublished || community.release !== null || community.nextAction !== 'execute-m4f5-v1.0.16-tag-release-and-remote-asset-verification') fail('community ready state drifted')
if (development.currentStage !== 'M4F-5-v1.0.16-tag-release-and-remote-asset-verification' || development.binaryVersionTransition !== 'v1.0.16-release-ready' || development.publicVersion !== '1.0.15' || development.publicTag !== 'v1.0.15') fail('development/public handoff drifted')
if (execFileSync('git', ['tag', '--list', 'v1.0.16'], { encoding: 'utf8' }).trim()) fail('v1.0.16 tag exists before M4F-5')
for (const [document, tokens] of [[releaseNotes, ['最终 artifact manifest', 'SHA256SUMS.txt', '尚未创建']], [readme, ['M4F-4', '尚未发布', '33322246630']], [audit, ['预期与实际差异', 'M4F-5', 'releaseCandidate=true']]]) for (const token of tokens) if (!document.includes(token)) fail(`M4F-4 document token missing: ${token}`)
if (failures.length) { console.error(`M4F-4 release readiness check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4F-4 accepted: two real unsigned installers, public-name mapping, SHA256SUMS, passed Tauri smoke, hosted lifecycle and cross-platform evidence are ready; tag and GitHub Release remain M4F-5.')
