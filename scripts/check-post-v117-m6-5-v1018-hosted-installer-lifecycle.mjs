import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v117-m6-5-v1018-hosted-installer-lifecycle-policy.json')
const predecessor = json('shared/post-v117-m6-4-v1018-candidate-packaging-policy.json')
const development = json('shared/development-version-policy.json')
const workflow = fs.readFileSync(policy.workflow, 'utf8')
const failures = []
const requiredTokens = [
  policy.candidateSourceCommit,
  'ref: v1.0.17',
  'PREVIOUS_VERSION: "1.0.17"',
  "package.version -ne '1.0.18'",
  'build --bundles msi,nsis',
  'Get-AuthenticodeSignature',
  'run-r5i-isolated-install-lifecycle.ps1',
  'capture-r5j-installed-artifact-smoke.mjs',
  'capture-r5l-management-rollback-smoke.mjs',
]

if (policy.stage !== 'M6-5' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M6-5 predecessor chain drift')
if (policy.candidateSourceCommit !== predecessor.candidateSourceCommit || policy.candidateVersion !== predecessor.candidateVersion) failures.push('candidate identity drift')
if (policy.previousPublicTag !== 'v1.0.17' || execFileSync('git', ['rev-list', '-n', '1', policy.previousPublicTag], { encoding: 'utf8' }).trim() !== policy.previousPublicCommit) failures.push('previous public source drift')
if (policy.requiredArtifacts?.join(',') !== 'msi,nsis' || policy.requiredLifecycle?.length !== 4) failures.push('required hosted scope drift')
if (policy.releaseCandidate || policy.sourceUserContentIncluded || policy.localCandidateObservation?.promotionalEvidence) failures.push('pre-hosted release boundary drift')
if (development.currentStage !== `${policy.stage}-${policy.name}` || development.binaryVersionTransition !== 'v1.0.18-candidate-packaged') failures.push('development M6-5 handoff drift')
for (const token of requiredTokens) if (!workflow.includes(token)) failures.push(`workflow token missing: ${token}`)

if (policy.status === 'workflow-ready-hosted-run-pending') {
  if (policy.attemptHistory?.length || policy.hostedSuccessEvidence !== null || policy.nextAction !== 'push-workflow-and-run-exact-candidate-on-github-hosted-windows') failures.push('pending hosted-run boundary drift')
} else if (policy.status !== 'hosted-installer-lifecycle-passed-release-readiness-pending') {
  failures.push(`unsupported M6-5 status: ${policy.status}`)
}

if (failures.length) {
  console.error(`M6-5 hosted installer lifecycle check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M6-5 contract accepted: ${policy.status}; exact 1.0.18 candidate and v1.0.17 upgrade baseline remain frozen.`)
