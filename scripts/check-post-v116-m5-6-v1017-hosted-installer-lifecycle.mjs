import fs from 'node:fs'
import crypto from 'node:crypto'
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

if (policy.status !== 'hosted-installer-lifecycle-passed-release-readiness-pending' || policy.nextAction !== 'execute-m5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit') failures.push('M5-6 closure boundary drifted')
const attempt = policy.attemptHistory?.[0]
if (policy.attemptHistory?.length !== 1 || attempt?.runId !== 33361759629 || attempt?.workflowCommit !== '98631fd9545f3aeaa653e47bc8b4776c4836f44c' || attempt?.productSourceCommit !== policy.candidateSourceCommit || attempt?.status !== 'hosted-installers-and-full-lifecycle-passed' || attempt?.lifecycleChecksPassed !== 22 || attempt?.installedArtifactChecksPassed !== 18 || attempt?.installedRoutesPassed !== 11 || attempt?.managementRollbackChecksPassed !== 7 || attempt?.failedChecks !== 0 || !attempt?.acceptedForM5_7 || attempt?.acceptedForRelease) failures.push('successful hosted attempt drifted')

const evidenceRoot = 'docs/evidence/post-v116-m5-6-v1017-hosted-installer-lifecycle'
const imported = json(`${evidenceRoot}/import-manifest.json`)
const lifecycle = json(`${evidenceRoot}/lifecycle-result.json`)
const installed = json(`${evidenceRoot}/installed-artifact-smoke.json`)
const routes = json(`${evidenceRoot}/installed-route-mount-evidence.json`)
const management = json(`${evidenceRoot}/management-backup-index-evidence.json`)
const receipt = json(`${evidenceRoot}/installer-build-receipt.json`)
if (imported.status !== 'hosted-installer-lifecycle-passed' || imported.githubRunId !== attempt?.runId || imported.productSourceCommit !== policy.candidateSourceCommit || imported.previousPublicCommit !== policy.previousPublicCommit || imported.releaseCandidate || imported.sourceUserContentIncluded || imported.selectedNextStage !== 'M5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit') failures.push('import manifest identity drifted')
if (imported.artifact?.id !== 9747835764 || imported.artifact?.zipSizeBytes !== 206517643 || imported.artifact?.zipSha256 !== 'f321741bee7a3527750659cf83197e851efa6db717757eacd5dbb0430ca6f51a') failures.push('hosted artifact identity drifted')
if (receipt.artifacts?.[0]?.sha256 !== '1453fa9a911d934fdacda88f63d3bac783100b9ef210fb02362ebe9aa0f16c3e' || receipt.artifacts?.[1]?.sha256 !== '154ace58e2e20b6ebe9947c2690f03b0d9737f69fecb9ffca90c0cdf3b2ba282' || receipt.artifacts.some(artifact => artifact.authenticodeStatus !== 'NotSigned')) failures.push('hosted installer receipt drifted')
if (lifecycle.status !== 'passed' || lifecycle.checks?.length !== 22 || lifecycle.checks.some(check => check.status !== 'passed') || lifecycle.currentInstallerSha256 !== receipt.artifacts?.[1]?.sha256) failures.push('R5I lifecycle evidence drifted')
if (installed.status !== 'passed' || installed.checks?.length !== 18 || installed.checks.some(check => check.status !== 'passed') || installed.installerSha256 !== lifecycle.currentInstallerSha256) failures.push('R5J installed evidence drifted')
if (routes.routes?.length !== 11 || routes.routes.some(route => route.status !== 'passed' || route.crashFallbackVisible || !route.routeWrapperMounted)) failures.push('installed route evidence drifted')
if (management.status !== 'passed' || management.checks?.length !== 7 || management.checks.some(check => check.status !== 'passed') || management.sourceUserContentIncluded) failures.push('R5L management evidence drifted')

const evidenceNames = fs.readdirSync(evidenceRoot).filter(name => name !== 'import-manifest.json').sort()
const rows = evidenceNames.map(name => {
  const bytes = fs.readFileSync(`${evidenceRoot}/${name}`)
  return `${name}:${bytes.length}:${crypto.createHash('sha256').update(bytes).digest('hex')}`
})
if (evidenceNames.length !== imported.repositoryCanonicalEvidence?.fileCount || evidenceNames.reduce((sum, name) => sum + fs.statSync(`${evidenceRoot}/${name}`).size, 0) !== imported.repositoryCanonicalEvidence?.totalBytes || crypto.createHash('sha256').update(rows.join('\n')).digest('hex') !== imported.repositoryCanonicalEvidence?.canonicalTreeSha256) failures.push('repository canonical evidence tree drifted')

if (failures.length) {
  console.error(`M5-6 hosted installer lifecycle check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M5-6 contract accepted: ${policy.status}; exact 1.0.17 candidate and 1.0.16 upgrade baseline remain frozen.`)
