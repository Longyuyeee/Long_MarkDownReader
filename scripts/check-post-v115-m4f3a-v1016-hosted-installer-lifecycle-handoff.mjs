import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v115-m4f3a-v1016-hosted-installer-lifecycle-handoff-policy.json')
const predecessor = json('shared/post-v115-m4f2-v1016-candidate-quality-gate-and-runtime-smoke-policy.json')
const workflow = fs.readFileSync(policy.workflow, 'utf8')
const evidenceRoot = 'docs/evidence/post-v115-m4f3-v1016-hosted-installer-lifecycle'
const imported = json(`${evidenceRoot}/import-manifest.json`)
const lifecycle = json(`${evidenceRoot}/lifecycle-result.json`)
const installed = json(`${evidenceRoot}/installed-artifact-smoke.json`)
const routes = json(`${evidenceRoot}/installed-route-mount-evidence.json`)
const management = json(`${evidenceRoot}/management-backup-index-evidence.json`)
const buildReceipt = json(`${evidenceRoot}/installer-build-receipt.json`)
const failures = []
const tokens = [
  policy.candidateSourceCommit,
  "ref: v1.0.15",
  'build --bundles msi,nsis',
  '-PreviousVersion $env:PREVIOUS_VERSION',
  'Get-AuthenticodeSignature',
  'installer-build-receipt.json',
  'capture-r5j-installed-artifact-smoke.mjs',
  'capture-r5l-management-rollback-smoke.mjs',
]

if (policy.stage !== 'M4F-3A' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== 'M4F-3') failures.push('M4F-3A predecessor chain drifted')
if (policy.status !== 'hosted-installer-lifecycle-passed-m4f4-pending' || policy.releaseCandidate || policy.localBuildObservation?.msiBuilt !== true || policy.localBuildObservation?.nsisBuilt !== false || policy.localBuildObservation?.promotionalEvidence !== false) failures.push('M4F-3 closure boundary drifted')
const firstAttempt = policy.attemptHistory?.[0]
const secondAttempt = policy.attemptHistory?.[1]
const thirdAttempt = policy.attemptHistory?.[2]
const fourthAttempt = policy.attemptHistory?.[3]
if (policy.attemptHistory?.length !== 4 || firstAttempt?.runId !== 33264898797 || firstAttempt?.status !== 'installers-built-lifecycle-failed-before-route-io' || firstAttempt?.msiBuilt !== true || firstAttempt?.nsisBuilt !== true || firstAttempt?.artifactHashesIndependentlyVerified !== true || firstAttempt?.acceptedForRelease !== false) failures.push('first hosted attempt boundary drifted')
if (secondAttempt?.runId !== 33267563652 || secondAttempt?.productSourceCommit !== '99cc4b79e13fc7fcc198da975b51880fc366afe4' || secondAttempt?.status !== 'installers-built-lifecycle-failed-at-initial-graph-governance-scan' || secondAttempt?.msiBuilt !== true || secondAttempt?.nsisBuilt !== true || secondAttempt?.artifactHashesIndependentlyVerified !== true || secondAttempt?.acceptedForRelease !== false) failures.push('second hosted attempt boundary drifted')
if (thirdAttempt?.runId !== 33319332897 || thirdAttempt?.productSourceCommit !== '3d7807d7c1bc899b86b57a0cae4cd264746fdfb6' || thirdAttempt?.status !== 'installers-built-lifecycle-failed-at-centered-graph-route-identity' || thirdAttempt?.msiBuilt !== true || thirdAttempt?.nsisBuilt !== true || thirdAttempt?.artifactHashesIndependentlyVerified !== true || thirdAttempt?.failedCheck !== 'installed-knowledge-topic-centered-navigation' || thirdAttempt?.acceptedForRelease !== false) failures.push('third hosted attempt boundary drifted')
if (fourthAttempt?.runId !== 33322246630 || fourthAttempt?.productSourceCommit !== policy.candidateSourceCommit || fourthAttempt?.status !== 'hosted-installers-and-full-lifecycle-passed' || fourthAttempt?.lifecycleChecksPassed !== 22 || fourthAttempt?.installedArtifactChecksPassed !== 18 || fourthAttempt?.installedRoutesPassed !== 11 || fourthAttempt?.managementRollbackChecksPassed !== 7 || fourthAttempt?.failedChecks !== 0 || fourthAttempt?.acceptedForM4F4 !== true || fourthAttempt?.acceptedForRelease !== false) failures.push('successful hosted attempt boundary drifted')
if (imported.status !== 'hosted-installer-lifecycle-passed' || imported.githubRunId !== fourthAttempt?.runId || imported.productSourceCommit !== policy.candidateSourceCommit || imported.sourceUserContentIncluded || imported.releaseCandidate || imported.selectedNextStage !== 'M4F-4-v1.0.16-final-artifact-manifest-and-release-readiness-audit') failures.push('import manifest identity drifted')
if (lifecycle.status !== 'passed' || lifecycle.checks?.length !== 22 || lifecycle.checks.some(check => check.status !== 'passed') || lifecycle.currentInstallerSha256 !== imported.installers?.find(item => item.target === 'nsis')?.sha256) failures.push('R5I lifecycle evidence drifted')
if (installed.status !== 'passed' || installed.checks?.length !== 18 || installed.checks.some(check => check.status !== 'passed') || installed.installerSha256 !== lifecycle.currentInstallerSha256) failures.push('R5J installed evidence drifted')
if (routes.routes?.length !== 11 || routes.routes.some(route => route.status !== 'passed' || route.crashFallbackVisible || !route.routeWrapperMounted)) failures.push('installed route evidence drifted')
if (management.status !== 'passed' || management.checks?.length !== 7 || management.checks.some(check => check.status !== 'passed') || management.sourceUserContentIncluded) failures.push('R5L management rollback evidence drifted')
if (buildReceipt.candidateSourceCommit !== policy.candidateSourceCommit || buildReceipt.artifacts?.length !== 2 || buildReceipt.artifacts.some(artifact => artifact.authenticodeStatus !== 'NotSigned')) failures.push('hosted installer receipt drifted')
const importedFiles = fs.readdirSync(evidenceRoot).filter(name => name !== 'import-manifest.json').sort()
const canonicalTree = importedFiles.map(name => {
  const bytes = fs.readFileSync(`${evidenceRoot}/${name}`)
  return `${name}:${bytes.length}:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}).join('\n')
if (importedFiles.length !== imported.importedEvidence?.fileCount || importedFiles.reduce((sum, name) => sum + fs.statSync(`${evidenceRoot}/${name}`).size, 0) !== imported.importedEvidence?.totalBytes || crypto.createHash('sha256').update(canonicalTree).digest('hex') !== imported.importedEvidence?.canonicalTreeSha256) failures.push('imported evidence tree drifted')
if (policy.previousPublicTag !== 'v1.0.15' || execFileSync('git', ['rev-list', '-n', '1', policy.previousPublicTag], { encoding: 'utf8' }).trim() !== policy.previousPublicCommit) failures.push('previous public source drifted')
if (policy.requiredArtifacts?.join(',') !== 'msi,nsis' || policy.requiredLifecycle?.length !== 4) failures.push('required hosted scope drifted')
for (const token of tokens) if (!workflow.includes(token)) failures.push(`workflow token missing: ${token}`)
if (execFileSync('git', ['tag', '--list', 'v1.0.16'], { encoding: 'utf8' }).trim()) failures.push('v1.0.16 tag exists before release closure')
if (failures.length) { console.error(`M4F-3A handoff check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4F-3 closure accepted: run 33322246630 built both unsigned installers and passed R5I 22/22, R5J 18/18 + 11/11 routes, and R5L 7/7; M4F-4 remains pending.')
