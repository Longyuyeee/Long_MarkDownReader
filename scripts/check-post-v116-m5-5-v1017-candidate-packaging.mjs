import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const read = file => fs.readFileSync(file, 'utf8')
const policy = json('shared/post-v116-m5-5-v1017-candidate-packaging-policy.json')
const predecessor = json('shared/post-v116-m5-4-v1017-release-readiness-policy.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const successor = json('shared/post-v116-m5-6-v1017-hosted-installer-lifecycle-policy.json')
const finalReadiness = json('shared/post-v116-m5-7-v1017-final-artifact-manifest-release-readiness-policy.json')
const published = json('shared/post-v116-m5-8-v1017-published-release-policy.json')
const updater = json('shared/v117-managed-updater-lifecycle-policy.json')
const pkg = json('package.json')
const lock = json('package-lock.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const cargo = read('src-tauri/Cargo.toml')
const cargoLock = read('src-tauri/Cargo.lock')
const notes = read('docs/RELEASE_NOTES_v1.0.17.md')
const evidence = fs.existsSync('docs/evidence/post-v116-m5-5-v1017-candidate-packaging/audit.json') ? json('docs/evidence/post-v116-m5-5-v1017-candidate-packaging/audit.json') : null
const runtimeSmoke = fs.existsSync('docs/evidence/post-v116-m5-5-v1017-candidate-packaging/runtime-smoke/audit-manifest.json') ? json('docs/evidence/post-v116-m5-5-v1017-candidate-packaging/runtime-smoke/audit-manifest.json') : null
const failures = []
const fail = message => failures.push(message)
const laterCandidateActive = pkg.version === '1.0.18' && community.appVersion === '1.0.18' && /^M[67]-[0-9]+-/.test(development.currentStage)
const laterPublicActive = development.publicVersion === '1.0.18' && development.publicTag === 'v1.0.18'

if (policy.stage !== 'M5-5' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M5-5 predecessor chain drifted')
if (policy.candidateVersion !== '1.0.17' || policy.publicVersion !== '1.0.16' || policy.atomicVersionFileCount !== 44
  || policy.releaseCandidate || policy.installedLifecyclePassed || policy.githubReleasePublished || policy.sourceUserContentIncluded) fail('M5-5 version/release/privacy boundary drifted')
if (!laterCandidateActive && (pkg.version !== '1.0.17' || lock.version !== '1.0.17' || lock.packages?.['']?.version !== '1.0.17'
  || tauri.version !== '1.0.17' || matrix.appVersion !== '1.0.17' || !cargo.includes('version = "1.0.17"')
  || !/name = "tauri-app"\r?\nversion = "1\.0\.17"/.test(cargoLock))) fail('atomic runtime identity drifted')
const releasePublished = published.status === 'published-and-remote-assets-verified'
if (!['1.0.17', '1.0.18'].includes(development.runtimeBaseVersion)
  || development.publicVersion !== (laterPublicActive ? '1.0.18' : releasePublished ? '1.0.17' : '1.0.16')
  || development.publicTag !== (laterPublicActive ? 'v1.0.18' : releasePublished ? 'v1.0.17' : 'v1.0.16')
  || development.developmentTargetVersion !== (laterPublicActive ? '1.0.19' : releasePublished ? '1.0.18' : '1.0.17')) fail('development public/candidate split drifted')
if (!laterCandidateActive && (community.appVersion !== '1.0.17' || community.patchValidation?.previousPublicVersion !== '1.0.16'
  || community.targetRelease?.tag !== 'v1.0.17' || Boolean(community.gates?.githubReleasePublished) !== releasePublished)) fail('community candidate identity drifted')
if (!(releasePublished ? notes.includes('状态：已正式发布') : ['状态：候选准备中，尚未公开发布', '状态：发布就绪，尚未公开发布'].some(token => notes.includes(token)))
  || !notes.includes('NotSigned') || !notes.includes('安装生命周期')) fail('v1.0.17 release notes boundary drifted')
const tagCommit = execFileSync('git', ['rev-list', '-n', '1', 'v1.0.17'], { encoding: 'utf8' }).trim()
if (releasePublished ? tagCommit !== policy.candidateSourceCommit : Boolean(tagCommit)) fail('v1.0.17 tag/publication boundary drifted')

if (policy.status === 'atomic-transition-complete-package-pending') {
  if (policy.candidateSourceCommit !== null || policy.qualityGatePassed || policy.candidatePackageBuilt || policy.artifacts?.length
    || community.currentStatus !== 'v1.0.17-community-release-quality-gate-pending'
    || development.currentStage !== 'M5-5-v1.0.17-atomic-version-transition-and-candidate-packaging'
    || development.binaryVersionTransition !== 'v1.0.17-quality-gate-pending') fail('M5-5 pending state drifted')
} else if (policy.status === 'accepted') {
  const successorPassed = successor.status === 'hosted-installer-lifecycle-passed-release-readiness-pending'
  const releaseReady = finalReadiness.status === 'accepted-ready-to-publish'
  const releaseClosed = updater.status === 'hosted-managed-update-passed'
  const expectedCommunityStatus = releasePublished ? 'v1.0.17-community-release-published' : releaseReady ? 'v1.0.17-community-release-ready-to-publish' : successorPassed ? 'v1.0.17-community-release-hosted-lifecycle-passed-final-release-audit-pending' : 'v1.0.17-community-release-candidate-packaged-installed-lifecycle-pending'
  const expectedStages = releaseClosed ? null : [releasePublished ? 'M5-9-v1.0.16-to-v1.0.17-managed-updater-observation' : releaseReady ? 'M5-8-v1.0.17-tag-release-and-remote-asset-verification' : successorPassed ? 'M5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit' : `${policy.selectedNextStage?.id}-${policy.selectedNextStage?.name}`]
  const expectedTransitions = releaseClosed ? ['v1.0.17-release-and-managed-updater-closed', 'v1.0.18-quality-gate-pending', 'v1.0.18-candidate-packaged', 'v1.0.18-hosted-installer-lifecycle-passed', 'v1.0.18-release-ready', 'v1.0.18-public-release-published', 'v1.0.18-release-and-managed-updater-closed'] : [releasePublished ? 'v1.0.17-public-release-published' : releaseReady ? 'v1.0.17-release-ready' : successorPassed ? 'v1.0.17-hosted-lifecycle-passed' : 'v1.0.17-candidate-packaged']
  if (!/^[0-9a-f]{40}$/.test(policy.candidateSourceCommit ?? '') || !policy.qualityGatePassed || !policy.candidatePackageBuilt
    || policy.artifacts?.length !== 2 || policy.artifacts.some(item => !['msi', 'nsis'].includes(item.target) || item.authenticodeStatus !== 'NotSigned')
    || (!laterCandidateActive && community.currentStatus !== expectedCommunityStatus)
    || !(releaseClosed ? /^M[67]-[0-9]+-/.test(development.currentStage) : expectedStages.includes(development.currentStage))
    || !expectedTransitions.includes(development.binaryVersionTransition)) fail('M5-5 accepted package state drifted')
  if (policy.artifacts?.[0]?.sizeBytes !== 74186752 || policy.artifacts?.[0]?.sha256 !== '96118462661e7b0eb2370aed49352b9db980fa42b7f8c27444382e1c788b4d6e'
    || policy.artifacts?.[1]?.sizeBytes !== 65922301 || policy.artifacts?.[1]?.sha256 !== '09923846c2ef19b31eb44bfa2bacfdadc6e03de2e50c05a2c03b4e432acc5886') fail('M5-5 artifact receipt drifted')
  if (evidence?.status !== 'passed' || evidence?.candidateSourceCommit !== policy.candidateSourceCommit || evidence?.differencesAndCorrections?.length !== 4
    || runtimeSmoke?.appVersion !== '1.0.17' || runtimeSmoke?.checks?.filter(item => item.status === 'passed').length !== 6
    || evidence?.actual?.runtimeSmoke?.routesPassed !== 11 || !evidence?.actual?.runtimeSmoke?.screenshotsVisuallyReviewed) fail('M5-5 real evidence drifted')
  try {
    execFileSync('git', ['cat-file', '-e', `${policy.candidateSourceCommit}^{commit}`])
    execFileSync('git', ['merge-base', '--is-ancestor', policy.candidateSourceCommit, 'HEAD'])
  } catch { fail('M5-5 candidate source commit is unavailable or not an ancestor') }
} else fail('M5-5 status is unsupported')

if (failures.length) {
  console.error(`M5-5 candidate packaging failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M5-5 ${policy.status}: v1.0.17 candidate identity and historical local package receipts remain valid${releasePublished ? ' after publication' : ' before publication'}.`)
