import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const read = file => fs.readFileSync(file, 'utf8')
const failures = []
const fail = message => failures.push(message)
const policy = json('shared/post-v118-m7-4-v1019-candidate-packaging-policy.json')
const predecessor = json('shared/post-v118-m7-3-v1019-release-readiness-policy.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const pkg = json('package.json')
const lock = json('package-lock.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const cargo = read('src-tauri/Cargo.toml')
const cargoLock = read('src-tauri/Cargo.lock')
const notes = read('docs/RELEASE_NOTES_v1.0.19.md')
const audit = read('docs/Post_v1.0.18_M7_4_v1.0.19_Atomic_Version_Transition_and_Candidate_Packaging_Audit_2026-08-31.md')

if (policy.stage !== 'M7-4' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M7-4 predecessor chain drift')
if (policy.candidateVersion !== '1.0.19' || policy.publicVersion !== '1.0.18' || policy.atomicVersionFileCount !== 44 || policy.releaseCandidate || policy.installedLifecyclePassed || policy.githubReleasePublished || policy.sourceUserContentIncluded) fail('M7-4 version/release/privacy boundary drift')
if (pkg.version !== '1.0.19' || lock.version !== '1.0.19' || lock.packages?.['']?.version !== '1.0.19' || tauri.version !== '1.0.19' || matrix.appVersion !== '1.0.19' || !cargo.includes('version = "1.0.19"') || !/name = "tauri-app"\r?\nversion = "1\.0\.19"/.test(cargoLock)) fail('atomic runtime identity drift')
if (development.runtimeBaseVersion !== '1.0.19' || development.publicVersion !== '1.0.18' || development.publicTag !== 'v1.0.18' || development.developmentTargetVersion !== '1.0.19' || development.releaseCandidate) fail('development candidate/public split drift')
if (community.appVersion !== '1.0.19' || community.patchValidation?.previousPublicVersion !== '1.0.18' || community.targetRelease?.tag !== 'v1.0.19' || community.release !== null) fail('community candidate identity drift')
if (!notes.includes('尚未公开发布') || !notes.includes('本地 JSON Schema') || !notes.includes('NotSigned') || !notes.includes('安装生命周期')) fail('v1.0.19 release notes boundary drift')
if (execFileSync('git', ['tag', '--list', 'v1.0.19'], { encoding: 'utf8' }).trim()) fail('v1.0.19 tag must not exist before publication')
if (policy.status === 'atomic-transition-complete-package-pending') {
  if (policy.candidateSourceCommit !== null || policy.qualityGatePassed || policy.candidatePackageBuilt || policy.artifacts?.length || policy.runtimeSmoke !== null || development.currentStage !== 'M7-4-v1.0.19-atomic-version-transition-and-candidate-packaging' || development.binaryVersionTransition !== 'v1.0.19-quality-gate-pending' || policy.nextAction !== 'push-atomic-transition-run-full-quality-gate-and-build-real-msi-nsis') fail('M7-4 pending state drift')
  for (const token of ['原子迁移已完成', '44', '候选打包待执行']) if (!audit.includes(token)) fail(`M7-4 pending audit missing: ${token}`)
} else if (policy.status === 'accepted') {
  if (!policy.candidateSourceCommit || !policy.qualityGatePassed || !policy.candidatePackageBuilt || policy.artifacts?.length !== 2 || policy.artifacts.some(item => !['msi', 'nsis'].includes(item.target) || item.productVersion !== '1.0.19' || item.authenticodeStatus !== 'NotSigned') || policy.runtimeSmoke?.checksPassed !== 6 || policy.runtimeSmoke?.routesPassed !== 11 || policy.selectedNextStage?.id !== 'M7-5') fail('M7-4 accepted package receipt drift')
  if (!community.gates?.qualityGatePassed || !community.gates?.msiBuilt || !community.gates?.nsisBuilt || !community.gates?.artifactHashesVerified || !community.gates?.localRuntimeSmokePassed || community.candidate?.artifactSourceCommit !== policy.candidateSourceCommit) fail('M7-4 accepted community state drift')
  try { execFileSync('git', ['cat-file', '-e', `${policy.candidateSourceCommit}^{commit}`]); execFileSync('git', ['merge-base', '--is-ancestor', policy.candidateSourceCommit, 'HEAD']) } catch { fail('M7-4 candidate source commit unavailable or not ancestor') }
} else fail('M7-4 status unsupported')

if (failures.length) { console.error(`M7-4 candidate packaging failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log(`M7-4 ${policy.status}: v1.0.19 runtime identity is atomic while public v1.0.18 remains frozen.`)
