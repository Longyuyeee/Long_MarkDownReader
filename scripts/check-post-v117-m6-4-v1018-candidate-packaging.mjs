import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const read = file => fs.readFileSync(file, 'utf8')
const policy = json('shared/post-v117-m6-4-v1018-candidate-packaging-policy.json')
const predecessor = json('shared/post-v117-m6-3-v1018-release-readiness-policy.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const hostedLifecycle = json('shared/post-v117-m6-5-v1018-hosted-installer-lifecycle-policy.json')
const finalReadiness = fs.existsSync('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json')
  ? json('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json') : null
const publishedRelease = fs.existsSync('shared/post-v117-m6-7-v1018-published-release-policy.json')
  ? json('shared/post-v117-m6-7-v1018-published-release-policy.json') : null
const managedUpdater = fs.existsSync('shared/v118-managed-updater-lifecycle-policy.json')
  ? json('shared/v118-managed-updater-lifecycle-policy.json') : null
const pkg = json('package.json')
const lock = json('package-lock.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const cargo = read('src-tauri/Cargo.toml')
const cargoLock = read('src-tauri/Cargo.lock')
const notes = read('docs/RELEASE_NOTES_v1.0.18.md')
const evidence = fs.existsSync('docs/evidence/post-v117-m6-4-v1018-candidate-packaging/audit.json') ? json('docs/evidence/post-v117-m6-4-v1018-candidate-packaging/audit.json') : null
const runtimeSmoke = fs.existsSync('docs/evidence/post-v117-m6-4-v1018-candidate-packaging/runtime-smoke/audit-manifest.json') ? json('docs/evidence/post-v117-m6-4-v1018-candidate-packaging/runtime-smoke/audit-manifest.json') : null
const failures = []
const fail = message => failures.push(message)

if (policy.stage !== 'M6-4' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M6-4 predecessor chain drift')
if (policy.candidateVersion !== '1.0.18' || policy.publicVersion !== '1.0.17' || policy.atomicVersionFileCount !== 44
  || policy.releaseCandidate || policy.installedLifecyclePassed || policy.githubReleasePublished || policy.sourceUserContentIncluded) fail('M6-4 version/release/privacy boundary drift')
if (pkg.version !== '1.0.18' || lock.version !== '1.0.18' || lock.packages?.['']?.version !== '1.0.18'
  || tauri.version !== '1.0.18' || matrix.appVersion !== '1.0.18' || !cargo.includes('version = "1.0.18"')
  || !/name = "tauri-app"\r?\nversion = "1\.0\.18"/.test(cargoLock)) fail('atomic runtime identity drift')
const hostedPassed = hostedLifecycle.status === 'hosted-installer-lifecycle-passed-release-readiness-pending'
const releaseReady = finalReadiness?.status === 'accepted-ready-to-publish'
const releasePublished = publishedRelease?.status === 'published-and-remote-assets-verified'
const managedUpdaterComplete = managedUpdater?.status === 'hosted-managed-update-passed'
if (development.runtimeBaseVersion !== '1.0.18' || development.publicVersion !== (releasePublished ? '1.0.18' : '1.0.17')
  || development.publicTag !== (releasePublished ? 'v1.0.18' : 'v1.0.17')
  || development.developmentTargetVersion !== (releasePublished ? '1.0.19' : '1.0.18') || development.releaseCandidate) fail('development candidate/public split drift')
if (community.appVersion !== '1.0.18'
  || community.patchValidation?.previousPublicVersion !== '1.0.17' || community.patchValidation?.managedUpdaterUpgradePath !== (managedUpdaterComplete ? '1.0.17-to-1.0.18-passed' : '1.0.17-to-1.0.18-pending')
  || community.targetRelease?.tag !== 'v1.0.18' || (releasePublished ? community.release?.databaseId !== publishedRelease.releaseDatabaseId : community.release !== null)) fail('community candidate identity drift')
if (!['状态：候选准备中，尚未公开发布', '状态：候选已打包，托管安装生命周期待验证，尚未公开发布', '状态：托管安装生命周期已通过，最终发布就绪审计中，尚未公开发布。', '状态：发布就绪，尚未公开发布。', '状态：已正式发布；三项公开附件已完成远端回下载复核。'].some(token => notes.includes(token))
  || !notes.includes('NotSigned') || !notes.includes('安装生命周期')) fail('v1.0.18 release notes boundary drift')
const candidateTags = execFileSync('git', ['tag', '--list', 'v1.0.18'], { encoding: 'utf8' }).trim()
if (releasePublished ? execFileSync('git', ['rev-list', '-n', '1', 'v1.0.18'], { encoding: 'utf8' }).trim() !== policy.candidateSourceCommit : Boolean(candidateTags)) fail('v1.0.18 tag/publication boundary drift')
if (policy.status === 'atomic-transition-complete-package-pending') {
  if (policy.candidateSourceCommit !== null || policy.qualityGatePassed || policy.candidatePackageBuilt || policy.artifacts?.length
    || community.currentStatus !== 'v1.0.18-community-release-quality-gate-pending' || community.candidate !== null
    || Object.values(community.gates ?? {}).some(Boolean)
    || development.currentStage !== `${policy.stage}-${policy.name}`
    || development.binaryVersionTransition !== 'v1.0.18-quality-gate-pending'
    || policy.nextAction !== 'push-atomic-transition-run-full-quality-gate-and-build-real-msi-nsis') fail('M6-4 pending state drift')
} else if (policy.status === 'accepted') {
  if (policy.candidateSourceCommit !== '5988c03c0167b00cb86ed9a5f3cfe85f0b280a6a' || !policy.qualityGatePassed || !policy.candidatePackageBuilt
    || policy.artifacts?.length !== 2 || policy.artifacts.some(item => !['msi', 'nsis'].includes(item.target) || item.productVersion !== '1.0.18' || item.authenticodeStatus !== 'NotSigned')
    || policy.artifacts?.[0]?.sizeBytes !== 74186752 || policy.artifacts?.[0]?.sha256 !== 'f1f5c147c9ff8b04c5f8b8a486fdb6cdd32abedd771e19d092c54c2f5185be01'
    || policy.artifacts?.[1]?.sizeBytes !== 65934312 || policy.artifacts?.[1]?.sha256 !== '96db31068a1b00732ab289474ab000ee465d4565a9150d8cb8a055a8ac96869f'
    || policy.runtimeSmoke?.checksPassed !== 6 || policy.runtimeSmoke?.routesPassed !== 11
    || policy.selectedNextStage?.id !== 'M6-5' || policy.nextAction !== 'execute-m6-5-v1.0.18-hosted-installer-lifecycle') fail('M6-4 accepted package receipt drift')
  const expectedStage = managedUpdaterComplete && /^M7-[0-9]+-/.test(development.currentStage) ? development.currentStage : releasePublished ? 'M6-8-v1.0.17-to-v1.0.18-managed-updater-observation' : releaseReady ? 'M6-7-v1.0.18-tag-release-and-remote-asset-verification' : hostedPassed ? 'M6-6-v1.0.18-final-artifact-manifest-and-release-readiness-audit' : `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`
  const expectedTransition = managedUpdaterComplete ? 'v1.0.18-release-and-managed-updater-closed' : releasePublished ? 'v1.0.18-public-release-published' : releaseReady ? 'v1.0.18-release-ready' : hostedPassed ? 'v1.0.18-hosted-installer-lifecycle-passed' : 'v1.0.18-candidate-packaged'
  const expectedCommunityStatus = releasePublished ? 'v1.0.18-community-release-published' : releaseReady ? 'v1.0.18-community-release-ready-to-publish' : hostedPassed ? 'v1.0.18-community-release-hosted-lifecycle-passed-final-release-audit-pending' : 'v1.0.18-community-release-candidate-packaged-installed-lifecycle-pending'
  if (development.currentStage !== expectedStage
    || development.binaryVersionTransition !== expectedTransition
    || community.currentStatus !== expectedCommunityStatus
    || community.releaseCandidate !== releaseReady || !community.gates?.qualityGatePassed || !community.gates?.msiBuilt || !community.gates?.nsisBuilt
    || !community.gates?.artifactHashesVerified || !community.gates?.localRuntimeSmokePassed || community.gates?.installedLifecyclePassed !== hostedPassed
    || community.gates?.githubReleasePublished !== releasePublished || community.candidate?.artifactSourceCommit !== policy.candidateSourceCommit
    || community.candidate?.artifacts?.length !== 2) fail('M6-4 accepted development/community state drift')
  if (evidence?.status !== 'passed' || evidence?.candidateSourceCommit !== policy.candidateSourceCommit || evidence?.differencesAndCorrections?.length !== 4
    || runtimeSmoke?.appVersion !== '1.0.18' || runtimeSmoke?.checks?.filter(item => item.status === 'passed').length !== 6
    || evidence?.actual?.runtimeSmoke?.routesPassed !== 11 || !evidence?.actual?.runtimeSmoke?.screenshotsVisuallyReviewed) fail('M6-4 real evidence drift')
  try {
    execFileSync('git', ['cat-file', '-e', `${policy.candidateSourceCommit}^{commit}`])
    execFileSync('git', ['merge-base', '--is-ancestor', policy.candidateSourceCommit, 'HEAD'])
  } catch { fail('M6-4 candidate source commit is unavailable or not an ancestor') }
} else fail('M6-4 status is unsupported')

if (failures.length) {
  console.error(`M6-4 candidate packaging failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M6-4 ${policy.status}: v1.0.18 candidate identity, real local package receipts, and WebView2 evidence are valid while public v1.0.17 remains frozen.`)
