import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const read = file => fs.readFileSync(file, 'utf8')
const policy = json('shared/post-v116-m5-5-v1017-candidate-packaging-policy.json')
const predecessor = json('shared/post-v116-m5-4-v1017-release-readiness-policy.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const pkg = json('package.json')
const lock = json('package-lock.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const cargo = read('src-tauri/Cargo.toml')
const cargoLock = read('src-tauri/Cargo.lock')
const notes = read('docs/RELEASE_NOTES_v1.0.17.md')
const failures = []
const fail = message => failures.push(message)

if (policy.stage !== 'M5-5' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M5-5 predecessor chain drifted')
if (policy.candidateVersion !== '1.0.17' || policy.publicVersion !== '1.0.16' || policy.atomicVersionFileCount !== 44
  || policy.releaseCandidate || policy.installedLifecyclePassed || policy.githubReleasePublished || policy.sourceUserContentIncluded) fail('M5-5 version/release/privacy boundary drifted')
if (pkg.version !== '1.0.17' || lock.version !== '1.0.17' || lock.packages?.['']?.version !== '1.0.17'
  || tauri.version !== '1.0.17' || matrix.appVersion !== '1.0.17' || !cargo.includes('version = "1.0.17"')
  || !/name = "tauri-app"\r?\nversion = "1\.0\.17"/.test(cargoLock)) fail('atomic runtime identity drifted')
if (development.runtimeBaseVersion !== '1.0.17' || development.publicVersion !== '1.0.16'
  || development.publicTag !== 'v1.0.16' || development.developmentTargetVersion !== '1.0.17') fail('development public/candidate split drifted')
if (community.appVersion !== '1.0.17' || community.patchValidation?.previousPublicVersion !== '1.0.16'
  || community.targetRelease?.tag !== 'v1.0.17' || community.gates?.githubReleasePublished) fail('community candidate identity drifted')
if (!notes.includes('状态：候选准备中，尚未公开发布') || !notes.includes('NotSigned') || !notes.includes('安装生命周期')) fail('v1.0.17 release notes boundary drifted')
if (execFileSync('git', ['tag', '--list', 'v1.0.17'], { encoding: 'utf8' }).trim()) fail('v1.0.17 tag exists before installed lifecycle and publication')

if (policy.status === 'atomic-transition-complete-package-pending') {
  if (policy.candidateSourceCommit !== null || policy.qualityGatePassed || policy.candidatePackageBuilt || policy.artifacts?.length
    || community.currentStatus !== 'v1.0.17-community-release-quality-gate-pending'
    || development.currentStage !== 'M5-5-v1.0.17-atomic-version-transition-and-candidate-packaging'
    || development.binaryVersionTransition !== 'v1.0.17-quality-gate-pending') fail('M5-5 pending state drifted')
} else if (policy.status === 'accepted') {
  if (!/^[0-9a-f]{40}$/.test(policy.candidateSourceCommit ?? '') || !policy.qualityGatePassed || !policy.candidatePackageBuilt
    || policy.artifacts?.length !== 2 || policy.artifacts.some(item => !['msi', 'nsis'].includes(item.target) || item.authenticodeStatus !== 'NotSigned')
    || community.currentStatus !== 'v1.0.17-community-release-candidate-packaged-installed-lifecycle-pending'
    || development.binaryVersionTransition !== 'v1.0.17-candidate-packaged') fail('M5-5 accepted package state drifted')
} else fail('M5-5 status is unsupported')

if (failures.length) {
  console.error(`M5-5 candidate packaging failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M5-5 ${policy.status}: v1.0.17 identity is atomic, public v1.0.16 remains frozen, and publication is blocked until installed lifecycle evidence.`)
