import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const normalize = value => value.replaceAll('\\', '/')
const policy = json('shared/post-v115-m4f0-v1016-release-freeze-entry-audit-policy.json')
const predecessor = json('shared/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit-policy.json')
const predecessorEvidence = json('docs/evidence/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit/decision.json')
const development = json('shared/development-version-policy.json')
const pkg = json('package.json')
const lock = json('package-lock.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const community = json('shared/v1-community-release-policy.json')
const cargo = read('src-tauri/Cargo.toml')
const cargoLock = read('src-tauri/Cargo.lock')
const qualityWorkflow = read('.github/workflows/quality-gate.yml')
const lifecycleWorkflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const r5e = json('shared/r5e-runtime-route-smoke-policy.json')
const r5f = json('shared/r5f-safe-tauri-runtime-policy.json')
const r5g = json('shared/r5g-desktop-artifact-smoke-policy.json')

const historicalPins = new Set(policy.historicalVersionPins.map(normalize))
const activeSharedFiles = fs.readdirSync('shared')
  .filter(file => file.endsWith('.json'))
  .map(file => `shared/${file}`)
  .filter(file => {
    const value = json(file)
    return value.appVersion === '1.0.15' && !historicalPins.has(file)
  })
  .sort()
const atomicVersionFiles = [...policy.atomicVersionScope.primaryFiles.map(normalize), ...activeSharedFiles].sort()
const frozenCommitExists = (() => { try { git('cat-file', '-e', `${policy.frozenProductCommit}^{commit}`); return true } catch { return false } })()
const headAtSelection = git('rev-parse', 'HEAD')
const originMainAtSelection = git('rev-parse', 'origin/main')
const candidateTagExists = Boolean(git('tag', '--list', 'v1.0.16'))

const gatePlan = [
  { id: 'freeze-product-commit', stage: 'M4F-0', status: 'complete', evidence: policy.frozenProductCommit },
  { id: 'atomic-version-transition', stage: 'M4F-1', status: 'pending' },
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
  stage: 'M4F-0',
  status: 'passed',
  frozenProductCommit: policy.frozenProductCommit,
  frozenCommitExists,
  headAtSelection,
  originMainAtSelection,
  frozenCommitWasOriginMain: headAtSelection === policy.frozenProductCommit && originMainAtSelection === policy.frozenProductCommit,
  candidateTagExists,
  versionState: {
    package: pkg.version,
    packageLock: lock.version,
    packageLockRoot: lock.packages?.['']?.version,
    tauri: tauri.version,
    cargo: /version = "([^"]+)"/.exec(cargo)?.[1],
    cargoLock: /name = "tauri-app"\r?\nversion = "([^"]+)"/.exec(cargoLock)?.[1],
    matrix: matrix.appVersion,
    community: community.appVersion,
    runtimeBase: development.runtimeBaseVersion,
    publicVersion: development.publicVersion,
    targetVersion: development.developmentTargetVersion,
    releaseCandidate: development.releaseCandidate,
  },
  atomicVersionScope: {
    activeSharedFiles,
    activeSharedFileCount: activeSharedFiles.length,
    atomicVersionFiles,
    totalFileCount: atomicVersionFiles.length,
    historicalPins: [...historicalPins].sort(),
  },
  runtimeSmokeCorrection: {
    historicalR5eStatus: r5e.currentStatus,
    historicalR5eQualifiesAsCurrentCandidatePass: false,
    r5fRouteMountContractPresent: r5f.releaseGate?.browserPreviewRouteMountPassed === true,
    r5gDesktopRouteIoContractPresent: r5g.releaseGate?.currentDesktopIoSmokePassed === true,
    requiredCandidateAction: 'rerun R5F route mount plus R5G desktop route/I-O smoke against the v1.0.16 candidate commit or artifact',
  },
  workflowChecks: {
    qualityGateRunsPatchRelease: qualityWorkflow.includes('npm run ci:patch-release'),
    qualityGateUsesLockedInstall: qualityWorkflow.includes('npm ci'),
    lifecycleIsManual: lifecycleWorkflow.includes('workflow_dispatch:'),
    lifecycleBindsSourceCommitAndVersion: lifecycleWorkflow.includes('Unable to resolve frozen product identity.') && lifecycleWorkflow.includes('CURRENT_APP_VERSION'),
    lifecycleSupportsExactArtifactReuse: lifecycleWorkflow.includes('artifact_run_id') && lifecycleWorkflow.includes('does not match the frozen product commit and version'),
  },
  gatePlan,
  predecessorDecision: predecessor.decision,
  predecessorEvidenceStatus: predecessorEvidence.status,
  nextStage: policy.selectedNextStage,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}

const failures = []
if (!frozenCommitExists || !evidence.frozenCommitWasOriginMain || candidateTagExists) failures.push('frozen product commit or candidate tag boundary drifted')
if (predecessor.selectedNextStage?.id !== policy.stage || policy.predecessor !== predecessor.stage || predecessorEvidence.status !== 'passed') failures.push('M4E-0 predecessor chain drifted')
if (Object.entries(evidence.versionState).some(([key, value]) => key === 'targetVersion' ? value !== '1.0.16' : key === 'releaseCandidate' ? value !== false : value !== '1.0.15')) failures.push('pre-transition version boundary drifted')
if (activeSharedFiles.length !== policy.atomicVersionScope.activeSharedFileCount || atomicVersionFiles.length !== policy.atomicVersionScope.totalFileCount) failures.push('atomic version file inventory drifted')
if (policy.historicalVersionPins.some(file => json(file).appVersion !== '1.0.15')) failures.push('historical post-v1.0.15 baseline pin drifted')
if (Object.values(evidence.workflowChecks).some(value => !value)) failures.push('release workflow contract drifted')
if (r5e.releaseGate?.browserPreviewSmokeCanPass !== false || evidence.runtimeSmokeCorrection.historicalR5eQualifiesAsCurrentCandidatePass !== false || !evidence.runtimeSmokeCorrection.r5fRouteMountContractPresent || !evidence.runtimeSmokeCorrection.r5gDesktopRouteIoContractPresent) failures.push('runtime smoke correction drifted')
if (gatePlan.length !== 9 || gatePlan.filter(gate => gate.status === 'complete').map(gate => gate.id).join(',') !== 'freeze-product-commit') failures.push('release gate entry state drifted')
if (failures.length) throw new Error(`M4F-0 release freeze entry audit failed: ${failures.join(', ')}`)

const output = 'docs/evidence/post-v115-m4f0-v1016-release-freeze-entry-audit'
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(`${output}/freeze-entry.json`, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`M4F-0 passed: product commit ${policy.frozenProductCommit.slice(0, 7)} is frozen; ${atomicVersionFiles.length} atomic version files are inventoried; 1/9 release gates is complete.`)
