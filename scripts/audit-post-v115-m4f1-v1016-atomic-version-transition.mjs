import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const freeze = json('shared/post-v115-m4f0-v1016-release-freeze-entry-audit-policy.json')
const policy = json('shared/post-v115-m4f1-v1016-atomic-version-transition-policy.json')
const freezeEvidence = json('docs/evidence/post-v115-m4f0-v1016-release-freeze-entry-audit/freeze-entry.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const pkg = json('package.json')
const lock = json('package-lock.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const degradation = json('shared/safe-degradation-contract.json')
const p1Closure = json('shared/p1-final-capability-closure.json')
const cargo = read('src-tauri/Cargo.toml')
const cargoLock = read('src-tauri/Cargo.lock')
const config = read('src/config/releaseCapabilities.ts')
const library = read('src/views/LibraryMode.vue')
const capabilities = read('src/views/ReleaseCapabilitiesView.vue')
const communityChecker = read('scripts/check-v1-community-release.mjs')
const degradationChecker = read('scripts/check-d2-safe-degradation-contract.mjs')
const releaseAudit = read('docs/V1_0_16_Unsigned_Community_Release_Audit_2026-08-30.md')
const stageAudit = read('docs/Post_v1.0.15_M4F1_v1.0.16_Atomic_Version_Transition_Audit_2026-08-30.md')
const releaseNotes = read('docs/RELEASE_NOTES_v1.0.16_DRAFT.md')

const versionFiles = [...freezeEvidence.atomicVersionScope.atomicVersionFiles].sort()
const changedFiles = git('diff', '--name-only', policy.transitionBaseCommit).split(/\r?\n/).filter(Boolean).map(value => value.replaceAll('\\', '/')).sort()
const changedVersionFiles = versionFiles.filter(file => changedFiles.includes(file))
const activeSharedVersions = freezeEvidence.atomicVersionScope.activeSharedFiles.map(file => ({ file, appVersion: json(file).appVersion }))
const historicalPins = freeze.historicalVersionPins.map(file => ({ file, appVersion: json(file).appVersion }))
const versionState = {
  package: pkg.version,
  packageLock: lock.version,
  packageLockRoot: lock.packages?.['']?.version,
  tauri: tauri.version,
  cargo: /version = "([^"]+)"/.exec(cargo)?.[1],
  cargoLock: /name = "tauri-app"\r?\nversion = "([^"]+)"/.exec(cargoLock)?.[1],
  matrix: matrix.appVersion,
  community: community.appVersion,
  runtimeBase: development.runtimeBaseVersion,
  developmentTarget: development.developmentTargetVersion,
  publicVersion: development.publicVersion,
}
const candidateGateFacts = {
  currentStatus: community.currentStatus,
  allGatesPending: Object.values(community.gates || {}).every(value => value === false),
  candidateReceiptCleared: community.candidate === null,
  releaseReceiptCleared: community.release === null,
  targetTag: community.targetRelease?.tag,
  managedUpdaterPath: community.patchValidation?.managedUpdaterUpgradePath,
}
const gatePlan = [
  { id: 'freeze-product-commit', stage: 'M4F-0', status: 'complete', evidence: freeze.frozenProductCommit },
  { id: 'atomic-version-transition', stage: 'M4F-1', status: 'complete', evidence: `${versionFiles.length} version files` },
  { id: 'full-ci-patch-release-quality-gate', stage: 'M4F-2', status: 'pending' },
  { id: 'current-candidate-runtime-route-and-io-smoke', stage: 'M4F-2', status: 'pending' },
  { id: 'unsigned-msi-and-nsis-build', stage: 'M4F-3', status: 'pending' },
  { id: 'managed-windows-install-lifecycle', stage: 'M4F-3', status: 'pending' },
  { id: 'installed-workspace-regression', stage: 'M4F-3', status: 'pending' },
  { id: 'artifact-sha256-and-release-notes-finalization', stage: 'M4F-4', status: 'pending' },
  { id: 'tag-and-github-release-bound-to-frozen-candidate', stage: 'M4F-4', status: 'pending' },
]
const evidence = {
  schemaVersion: 1,
  stage: policy.stage,
  status: 'passed',
  transitionBaseCommit: policy.transitionBaseCommit,
  headAtTransition: git('rev-parse', 'HEAD'),
  originMainAtTransition: git('rev-parse', 'origin/main'),
  candidateTagExists: Boolean(git('tag', '--list', 'v1.0.16')),
  versionState,
  atomicTransition: {
    expectedFileCount: versionFiles.length,
    changedVersionFileCount: changedVersionFiles.length,
    changedVersionFiles,
    activeSharedVersions,
    historicalPins,
  },
  candidateGateFacts,
  publicBoundary: {
    publicVersion: development.publicVersion,
    publicTag: development.publicTag,
    publicTagCommit: development.publicTagCommit,
    candidateDoesNotReplacePublicRelease: development.publicVersion !== pkg.version,
  },
  metadataConsumerCorrection: {
    candidatePolicyMatchesRuntime: community.appVersion === matrix.appVersion && matrix.appVersion === pkg.version,
    publicVersionRemainsIndependent: development.publicVersion !== community.appVersion,
    configAllowsCandidateRuntimeAbovePublic: config.includes('compareVersions(developmentVersion.publicVersion, developmentVersion.runtimeBaseVersion) > 0')
      && config.includes('communityRelease.appVersion !== matrix.appVersion'),
    publicVersionExportedToUserSurfaces: config.includes('export const PUBLIC_RELEASE_VERSION')
      && library.includes('当前公开版本 v${PUBLIC_RELEASE_VERSION}')
      && capabilities.includes('当前公开 ${PUBLIC_RELEASE_VERSION}'),
    previousPublishedReceiptCanSupplyExplicitPendingBaseline: communityChecker.includes('previousPublishedReceiptAccepted')
      && communityChecker.includes('previousUpdaterLifecycleAccepted || previousPublishedReceiptAccepted'),
    currentCandidateLifecycleStillRequiredBeforePromotion: communityChecker.includes('policy.patchValidation?.fullInstalledLifecycleRerun !== true')
      && communityChecker.includes('hostedInstalledLifecycleRunId'),
    odsReliableCopyLaneAligned: degradation.lanes?.some(lane => lane.id === 'verified-ods-reliable-copy'
      && lane.formats?.join(',') === 'ods'
      && lane.saveModes?.join(',') === 'copy'
      && lane.profiles?.join(',') === 'office-copy'),
    degradationCheckerAcceptsOdsCopy: degradationChecker.includes('"verified-ods-reliable-copy"')
      && degradationChecker.includes('["ods", "copy", "office-copy"]'),
    p1DerivedCandidateIdentityMigrated: p1Closure.nextStage === 'V1.0.16-UNSIGNED-PATCH-RELEASE'
      && p1Closure.acceptedProductLanes?.find(lane => lane.id === 'office-and-spreadsheet')?.scope?.includes('ods-bounded-reliable-copy'),
  },
  documentationChecks: {
    releaseAuditPending: releaseAudit.includes('状态：**质量门禁待执行**') && releaseAudit.includes('releaseCandidate=false'),
    stageAuditBoundary: stageAudit.includes('44 个版本文件') && stageAudit.includes('当前公开版本仍为 v1.0.15'),
    draftNotesBoundary: releaseNotes.includes('M4F-1') && releaseNotes.includes('releaseCandidate=false'),
  },
  candidateSourceCommitSelection: 'bind-the-pushed-m4f1-commit-at-m4f2-entry',
  gatePlan,
  nextStage: policy.selectedNextStage,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}

const failures = []
if (freeze.selectedNextStage?.id !== policy.stage || policy.predecessor !== freeze.stage) failures.push('M4F-0 predecessor chain drifted')
if (evidence.headAtTransition !== policy.transitionBaseCommit || evidence.originMainAtTransition !== policy.transitionBaseCommit || evidence.candidateTagExists) failures.push('transition base or tag boundary drifted')
if (Object.entries(versionState).some(([key, value]) => key === 'publicVersion' ? value !== '1.0.15' : value !== '1.0.16')) failures.push('candidate version identity drifted')
if (versionFiles.length !== 44 || changedVersionFiles.length !== 44 || activeSharedVersions.some(item => item.appVersion !== '1.0.16')) failures.push('44-file atomic transition is incomplete')
if (historicalPins.length !== 5 || historicalPins.some(item => item.appVersion !== '1.0.15')) failures.push('historical version pins drifted')
if (community.releaseCandidate !== false || development.releaseCandidate !== false || matrix.releaseCandidate !== false || !candidateGateFacts.allGatesPending || !candidateGateFacts.candidateReceiptCleared || !candidateGateFacts.releaseReceiptCleared) failures.push('candidate gate state was promoted early')
if (candidateGateFacts.currentStatus !== 'v1.0.16-community-release-quality-gate-pending' || candidateGateFacts.targetTag !== 'v1.0.16' || candidateGateFacts.managedUpdaterPath !== '1.0.15-to-1.0.16-pending') failures.push('candidate metadata drifted')
if (!evidence.publicBoundary.candidateDoesNotReplacePublicRelease || development.publicTag !== policy.publicBoundary.publicTag || development.publicTagCommit !== policy.publicBoundary.publicTagCommit) failures.push('public release boundary drifted')
if (Object.values(evidence.metadataConsumerCorrection).some(value => !value) || Object.values(evidence.documentationChecks).some(value => !value)) failures.push('metadata consumer or documentation alignment drifted')
if (development.currentStage !== `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}` || development.binaryVersionTransition !== 'v1.0.16-quality-gate-pending') failures.push('M4F-2 handoff drifted')
if (gatePlan.length !== 9 || gatePlan.filter(gate => gate.status === 'complete').length !== 2) failures.push('release gate plan drifted')
if (failures.length) throw new Error(`M4F-1 atomic transition audit failed: ${failures.join(', ')}`)

const output = 'docs/evidence/post-v115-m4f1-v1016-atomic-version-transition'
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(`${output}/transition.json`, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`M4F-1 passed: all ${versionFiles.length} frozen version files are v1.0.16, five historical pins remain v1.0.15, and 2/9 release gates are complete.`)
