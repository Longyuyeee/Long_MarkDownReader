import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v116-m5-6-v1017-hosted-installer-lifecycle-policy.json')
const predecessor = json('shared/post-v116-m5-5-v1017-candidate-packaging-policy.json')
const workflow = fs.readFileSync(policy.workflow, 'utf8')
const failures = []
const requiredTokens = [
  policy.candidateSourceCommit,
  'ref: v1.0.16',
  "PREVIOUS_VERSION: \"1.0.16\"",
  "package.version -ne '1.0.17'",
  'build --bundles msi,nsis',
  'Get-AuthenticodeSignature',
  'run-r5i-isolated-install-lifecycle.ps1',
  'capture-r5j-installed-artifact-smoke.mjs',
  'capture-r5l-management-rollback-smoke.mjs',
]

if (policy.stage !== 'M5-6' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== 'M5-6') failures.push('M5-6 predecessor chain drifted')
if (policy.candidateSourceCommit !== predecessor.candidateSourceCommit || policy.candidateVersion !== predecessor.candidateVersion) failures.push('candidate identity drifted')
if (policy.previousPublicTag !== 'v1.0.16' || execFileSync('git', ['rev-list', '-n', '1', policy.previousPublicTag], { encoding: 'utf8' }).trim() !== policy.previousPublicCommit) failures.push('previous public source drifted')
if (policy.requiredArtifacts?.join(',') !== 'msi,nsis' || policy.requiredLifecycle?.length !== 4) failures.push('required hosted scope drifted')
if (policy.releaseCandidate || policy.sourceUserContentIncluded || policy.localCandidateObservation?.promotionalEvidence) failures.push('pre-hosted release boundary drifted')
for (const token of requiredTokens) if (!workflow.includes(token)) failures.push(`workflow token missing: ${token}`)

if (policy.status === 'workflow-ready-hosted-run-pending') {
  if (policy.attemptHistory?.length || policy.hostedSuccessEvidence !== null || policy.nextAction !== 'push-workflow-and-run-exact-candidate-on-github-hosted-windows') failures.push('pending hosted-run boundary drifted')
} else if (policy.status !== 'hosted-installer-lifecycle-passed-release-readiness-pending') {
  failures.push(`unsupported M5-6 status: ${policy.status}`)
}

if (failures.length) {
  console.error(`M5-6 hosted installer lifecycle check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M5-6 contract accepted: ${policy.status}; exact 1.0.17 candidate and 1.0.16 upgrade baseline remain frozen.`)
