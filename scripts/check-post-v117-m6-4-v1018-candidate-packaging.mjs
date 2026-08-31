import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const read = file => fs.readFileSync(file, 'utf8')
const policy = json('shared/post-v117-m6-4-v1018-candidate-packaging-policy.json')
const predecessor = json('shared/post-v117-m6-3-v1018-release-readiness-policy.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const pkg = json('package.json')
const lock = json('package-lock.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const cargo = read('src-tauri/Cargo.toml')
const cargoLock = read('src-tauri/Cargo.lock')
const notes = read('docs/RELEASE_NOTES_v1.0.18.md')
const failures = []
const fail = message => failures.push(message)

if (policy.stage !== 'M6-4' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M6-4 predecessor chain drift')
if (policy.candidateVersion !== '1.0.18' || policy.publicVersion !== '1.0.17' || policy.atomicVersionFileCount !== 44
  || policy.releaseCandidate || policy.installedLifecyclePassed || policy.githubReleasePublished || policy.sourceUserContentIncluded) fail('M6-4 version/release/privacy boundary drift')
if (pkg.version !== '1.0.18' || lock.version !== '1.0.18' || lock.packages?.['']?.version !== '1.0.18'
  || tauri.version !== '1.0.18' || matrix.appVersion !== '1.0.18' || !cargo.includes('version = "1.0.18"')
  || !/name = "tauri-app"\r?\nversion = "1\.0\.18"/.test(cargoLock)) fail('atomic runtime identity drift')
if (development.runtimeBaseVersion !== '1.0.18' || development.publicVersion !== '1.0.17' || development.publicTag !== 'v1.0.17'
  || development.developmentTargetVersion !== '1.0.18' || development.currentStage !== `${policy.stage}-${policy.name}`
  || development.binaryVersionTransition !== 'v1.0.18-quality-gate-pending' || development.releaseCandidate) fail('development candidate/public split drift')
if (community.appVersion !== '1.0.18' || community.currentStatus !== 'v1.0.18-community-release-quality-gate-pending'
  || community.patchValidation?.previousPublicVersion !== '1.0.17' || community.patchValidation?.managedUpdaterUpgradePath !== '1.0.17-to-1.0.18-pending'
  || community.targetRelease?.tag !== 'v1.0.18' || community.candidate !== null || community.release !== null
  || Object.values(community.gates ?? {}).some(Boolean)) fail('community candidate reset drift')
if (!notes.includes('状态：候选准备中，尚未公开发布') || !notes.includes('NotSigned') || !notes.includes('安装生命周期')) fail('v1.0.18 release notes boundary drift')
const candidateTags = execFileSync('git', ['tag', '--list', 'v1.0.18'], { encoding: 'utf8' }).trim()
if (candidateTags) fail('v1.0.18 tag must not exist before publication')
if (policy.status !== 'atomic-transition-complete-package-pending' || policy.candidateSourceCommit !== null || policy.qualityGatePassed
  || policy.candidatePackageBuilt || policy.artifacts?.length || policy.nextAction !== 'push-atomic-transition-run-full-quality-gate-and-build-real-msi-nsis') fail('M6-4 pending state drift')

if (failures.length) {
  console.error(`M6-4 candidate packaging failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M6-4 atomic transition accepted: 44 current identity files target v1.0.18 while public v1.0.17 facts remain frozen; package evidence is still pending.')
