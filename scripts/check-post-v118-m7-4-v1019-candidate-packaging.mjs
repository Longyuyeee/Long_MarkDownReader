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
const successorActive = ["1.0.20", "1.0.21", "1.0.22", "1.0.23", "1.0.24", "1.0.25", "1.0.26", "1.1.0", "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5", "1.1.6", "1.1.7", "1.1.8", "1.1.9", '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', "1.1.18", "1.1.19", "1.1.20", "1.1.21", "1.1.22", "1.1.23", "1.1.24", "1.1.25", "1.1.26", "1.1.27", "1.1.28", "1.1.29", "1.1.30", "1.1.31", "1.1.32", "1.1.33", "1.1.34", "1.1.35", "1.1.36", "1.1.37", "1.2.0", "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.2.6", "1.2.7", "1.2.8", "1.2.9", "1.2.10", "1.2.11", "1.2.12", "1.2.13", "1.2.14", "1.2.15", "1.2.16", "1.2.17", "1.2.18", "1.2.19", "1.2.20", "1.2.21", "1.2.22", "1.2.23", "1.2.24", "1.2.25", "1.2.26", "1.2.27", "1.2.28", "1.2.29", "1.2.30", "1.2.31", "1.2.32", "1.2.33", "1.2.34", "1.2.35", "1.2.36", "1.2.37", "1.2.38", "1.2.39", "1.2.40", "1.2.41", "1.2.42", "1.2.43", "1.2.44", "1.2.45", "1.3.0", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5", "1.3.6", "1.3.7", "1.3.8", "1.3.9"].includes(pkg.version) && community.appVersion === pkg.version && /^M8-[0-9]+-/.test(development.currentStage)

if (policy.stage !== 'M7-4' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M7-4 predecessor chain drift')
if (policy.candidateVersion !== '1.0.19' || policy.publicVersion !== '1.0.18' || policy.atomicVersionFileCount !== 44 || policy.releaseCandidate || policy.installedLifecyclePassed || policy.githubReleasePublished || policy.sourceUserContentIncluded) fail('M7-4 version/release/privacy boundary drift')
if (!successorActive && (pkg.version !== '1.0.19' || lock.version !== '1.0.19' || lock.packages?.['']?.version !== '1.0.19' || tauri.version !== '1.0.19' || matrix.appVersion !== '1.0.19' || !cargo.includes('version = "1.0.19"') || !/name = "tauri-app"\r?\nversion = "1\.0\.19"/.test(cargoLock))) fail('atomic runtime identity drift')
const publishedSuccessor = ['1.0.19', '1.0.20', '1.0.21', '1.0.22', '1.0.23', '1.0.24', '1.0.25', '1.0.26', '1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(development.publicVersion) && development.publicTag === `v${development.publicVersion}` && development.developmentTargetVersion === expectedDevelopmentTarget(development.publicVersion, development.developmentTargetVersion)
if ((!successorActive && development.runtimeBaseVersion !== '1.0.19') || (!publishedSuccessor && (development.publicVersion !== '1.0.18' || development.publicTag !== 'v1.0.18' || development.developmentTargetVersion !== '1.0.19')) || development.releaseCandidate) fail('development candidate/public split drift')
if (!successorActive && (community.appVersion !== '1.0.19' || community.patchValidation?.previousPublicVersion !== '1.0.18' || community.targetRelease?.tag !== 'v1.0.19' || (publishedSuccessor ? community.release?.taggedCommit !== policy.candidateSourceCommit : community.release !== null))) fail('community candidate identity drift')
if (!(publishedSuccessor ? notes.includes('已正式发布') : notes.includes('尚未公开发布')) || !notes.includes('本地 JSON Schema') || !notes.includes('NotSigned') || !notes.includes('安装生命周期')) fail('v1.0.19 release notes boundary drift')
const tagCommit = execFileSync('git', ['rev-list', '-n', '1', 'v1.0.19'], { encoding: 'utf8' }).trim()
if ((publishedSuccessor && tagCommit !== policy.candidateSourceCommit) || (!publishedSuccessor && tagCommit)) fail('v1.0.19 tag publication boundary drift')
if (policy.status === 'atomic-transition-complete-package-pending') {
  if (policy.candidateSourceCommit !== null || policy.qualityGatePassed || policy.candidatePackageBuilt || policy.artifacts?.length || policy.runtimeSmoke !== null || development.currentStage !== 'M7-4-v1.0.19-atomic-version-transition-and-candidate-packaging' || development.binaryVersionTransition !== 'v1.0.19-quality-gate-pending' || policy.nextAction !== 'push-atomic-transition-run-full-quality-gate-and-build-real-msi-nsis') fail('M7-4 pending state drift')
  for (const token of ['原子迁移已完成', '44', '候选打包待执行']) if (!audit.includes(token)) fail(`M7-4 pending audit missing: ${token}`)
} else if (policy.status === 'accepted') {
  if (!policy.candidateSourceCommit || !policy.qualityGatePassed || !policy.candidatePackageBuilt || policy.artifacts?.length !== 2 || policy.artifacts.some(item => !['msi', 'nsis'].includes(item.target) || item.productVersion !== '1.0.19' || item.authenticodeStatus !== 'NotSigned') || policy.runtimeSmoke?.checksPassed !== 6 || policy.runtimeSmoke?.routesPassed !== 11 || policy.selectedNextStage?.id !== 'M7-5') fail('M7-4 accepted package receipt drift')
  if (!successorActive && (!community.gates?.qualityGatePassed || !community.gates?.msiBuilt || !community.gates?.nsisBuilt || !community.gates?.artifactHashesVerified || !community.gates?.localRuntimeSmokePassed || community.candidate?.artifactSourceCommit !== policy.candidateSourceCommit)) fail('M7-4 accepted community state drift')
  try { execFileSync('git', ['cat-file', '-e', `${policy.candidateSourceCommit}^{commit}`]); execFileSync('git', ['merge-base', '--is-ancestor', policy.candidateSourceCommit, 'HEAD']) } catch { fail('M7-4 candidate source commit unavailable or not ancestor') }
} else fail('M7-4 status unsupported')

if (failures.length) { console.error(`M7-4 candidate packaging failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log(`M7-4 ${policy.status}: v1.0.19 runtime identity is atomic while public v1.0.18 remains frozen.`)
import { expectedDevelopmentTarget } from './lib/development-target.mjs'
