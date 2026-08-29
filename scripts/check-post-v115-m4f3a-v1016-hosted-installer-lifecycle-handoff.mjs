import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v115-m4f3a-v1016-hosted-installer-lifecycle-handoff-policy.json')
const predecessor = json('shared/post-v115-m4f2-v1016-candidate-quality-gate-and-runtime-smoke-policy.json')
const workflow = fs.readFileSync(policy.workflow, 'utf8')
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
if (policy.status !== 'hosted-first-attempt-failed-remediated-rerun-pending' || policy.releaseCandidate || policy.localBuildObservation?.msiBuilt !== true || policy.localBuildObservation?.nsisBuilt !== false || policy.localBuildObservation?.promotionalEvidence !== false) failures.push('local blocker boundary drifted')
const firstAttempt = policy.attemptHistory?.[0]
if (policy.attemptHistory?.length !== 1 || firstAttempt?.runId !== 33264898797 || firstAttempt?.status !== 'installers-built-lifecycle-failed-before-route-io' || firstAttempt?.msiBuilt !== true || firstAttempt?.nsisBuilt !== true || firstAttempt?.artifactHashesIndependentlyVerified !== true || firstAttempt?.acceptedForRelease !== false) failures.push('first hosted attempt boundary drifted')
if (policy.previousPublicTag !== 'v1.0.15' || execFileSync('git', ['rev-list', '-n', '1', policy.previousPublicTag], { encoding: 'utf8' }).trim() !== policy.previousPublicCommit) failures.push('previous public source drifted')
if (policy.requiredArtifacts?.join(',') !== 'msi,nsis' || policy.requiredLifecycle?.length !== 4) failures.push('required hosted scope drifted')
for (const token of tokens) if (!workflow.includes(token)) failures.push(`workflow token missing: ${token}`)
if (execFileSync('git', ['tag', '--list', 'v1.0.16'], { encoding: 'utf8' }).trim()) failures.push('v1.0.16 tag exists before release closure')
if (failures.length) { console.error(`M4F-3A handoff check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4F-3A handoff accepted: the first hosted installer build and lifecycle failure are immutable, the remediated exact candidate is rerun-ready, and no evidence is promotional.')
