import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v117-m6-5-v1018-hosted-installer-lifecycle-policy.json')
const predecessor = json('shared/post-v117-m6-4-v1018-candidate-packaging-policy.json')
const development = json('shared/development-version-policy.json')
const finalReadiness = fs.existsSync('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json')
  ? json('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json') : null
const publishedRelease = fs.existsSync('shared/post-v117-m6-7-v1018-published-release-policy.json')
  ? json('shared/post-v117-m6-7-v1018-published-release-policy.json') : null
const managedUpdater = fs.existsSync('shared/v118-managed-updater-lifecycle-policy.json')
  ? json('shared/v118-managed-updater-lifecycle-policy.json') : null
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
const hostedPassed = policy.status === 'hosted-installer-lifecycle-passed-release-readiness-pending'
const releaseReady = finalReadiness?.status === 'accepted-ready-to-publish'
const releasePublished = publishedRelease?.status === 'published-and-remote-assets-verified'
const managedUpdaterComplete = managedUpdater?.status === 'hosted-managed-update-passed'
const laterM7Active = managedUpdaterComplete && /^M7-[0-9]+-/.test(development.currentStage)
const expectedDevelopmentStage = laterM7Active
  ? development.currentStage
  : releasePublished
  ? 'M6-8-v1.0.17-to-v1.0.18-managed-updater-observation'
  : releaseReady
  ? 'M6-7-v1.0.18-tag-release-and-remote-asset-verification'
  : hostedPassed
  ? 'M6-6-v1.0.18-final-artifact-manifest-and-release-readiness-audit'
  : `${policy.stage}-${policy.name}`
const expectedVersionTransition = laterM7Active
  ? development.binaryVersionTransition
  : managedUpdaterComplete
  ? 'v1.0.18-release-and-managed-updater-closed'
  : releasePublished
  ? 'v1.0.18-public-release-published'
  : releaseReady
  ? 'v1.0.18-release-ready'
  : hostedPassed
  ? 'v1.0.18-hosted-installer-lifecycle-passed'
  : 'v1.0.18-candidate-packaged'
if (development.currentStage !== expectedDevelopmentStage || development.binaryVersionTransition !== expectedVersionTransition) failures.push('development M6-5 handoff drift')
for (const token of requiredTokens) if (!workflow.includes(token)) failures.push(`workflow token missing: ${token}`)

if (policy.status === 'workflow-ready-hosted-run-pending') {
  if (policy.attemptHistory?.length || policy.hostedSuccessEvidence !== null || policy.nextAction !== 'push-workflow-and-run-exact-candidate-on-github-hosted-windows') failures.push('pending hosted-run boundary drift')
} else if (policy.status === 'hosted-installer-lifecycle-passed-release-readiness-pending') {
  const attempt = policy.attemptHistory?.[0]
  const evidenceRoot = policy.hostedSuccessEvidence?.evidenceRoot
  const importPath = policy.hostedSuccessEvidence?.importManifest
  if (policy.attemptHistory?.length !== 1 || attempt?.runId !== 33378338422 || attempt?.workflowCommit !== '6d208bcf7d0ba430b7df478718fe636fe91c6e34'
    || attempt?.productSourceCommit !== policy.candidateSourceCommit || attempt?.status !== 'hosted-installers-and-full-lifecycle-passed'
    || attempt?.lifecycleChecksPassed !== 22 || attempt?.installedArtifactChecksPassed !== 18 || attempt?.installedRoutesPassed !== 11
    || attempt?.managementRollbackChecksPassed !== 7 || attempt?.failedChecks !== 0 || !attempt?.acceptedForM6_6 || attempt?.acceptedForRelease) failures.push('successful hosted attempt drift')
  if (!evidenceRoot || !importPath || !fs.existsSync(importPath)) failures.push('hosted success evidence is missing')
  else {
    const imported = json(importPath)
    const lifecycle = json(`${evidenceRoot}/lifecycle-result.json`)
    const installed = json(`${evidenceRoot}/installed-artifact-smoke.json`)
    const routes = json(`${evidenceRoot}/installed-route-mount-evidence.json`)
    const management = json(`${evidenceRoot}/management-backup-index-evidence.json`)
    const receipt = json(`${evidenceRoot}/installer-build-receipt.json`)
    if (imported.githubRunId !== attempt.runId || imported.artifact?.id !== 9754106849 || imported.artifact?.zipSha256 !== policy.hostedSuccessEvidence.artifactZipSha256
      || imported.productSourceCommit !== policy.candidateSourceCommit || imported.previousPublicCommit !== policy.previousPublicCommit
      || imported.visualReview?.reviewed !== true || imported.visualReview?.screenshotCount !== 14 || imported.releaseCandidate || imported.sourceUserContentIncluded
      || imported.selectedNextStage !== 'M6-6-v1.0.18-final-artifact-manifest-and-release-readiness-audit') failures.push('imported hosted evidence identity drift')
    if (receipt.artifacts?.[0]?.sha256 !== '379dc0ca3fc7cf362af6d29818b95ad98f38d03ae5ce78bdb53ceace20cb2955'
      || receipt.artifacts?.[1]?.sha256 !== '477d1423909d660d5c60d238805b54248ac9f667b9f956036589ea55bf9e719d'
      || receipt.artifacts?.some(artifact => artifact.authenticodeStatus !== 'NotSigned')) failures.push('hosted installer receipt drift')
    if (lifecycle.status !== 'passed' || lifecycle.checks?.length !== 22 || lifecycle.checks.some(check => check.status !== 'passed')) failures.push('R5I evidence drift')
    if (installed.status !== 'passed' || installed.checks?.length !== 18 || installed.checks.some(check => check.status !== 'passed')) failures.push('R5J evidence drift')
    if (routes.routes?.length !== 11 || routes.routes.some(route => route.status !== 'passed')) failures.push('installed route evidence drift')
    if (management.status !== 'passed' || management.checks?.length !== 7 || management.checks.some(check => check.status !== 'passed') || management.sourceUserContentIncluded) failures.push('R5L evidence drift')
    const names = fs.readdirSync(evidenceRoot).filter(name => name !== 'import-manifest.json').sort()
    const canonicalBytes = name => name.endsWith('.json')
      ? Buffer.from(`${JSON.stringify(json(`${evidenceRoot}/${name}`), null, 2)}\n`)
      : fs.readFileSync(`${evidenceRoot}/${name}`)
    const rows = names.map(name => {
      const bytes = canonicalBytes(name)
      return `${name}:${bytes.length}:${crypto.createHash('sha256').update(bytes).digest('hex')}`
    })
    const tree = crypto.createHash('sha256').update(rows.join('\n')).digest('hex')
    const totalBytes = names.reduce((sum, name) => sum + canonicalBytes(name).length, 0)
    if (names.length !== imported.repositoryCanonicalEvidence?.fileCount || totalBytes !== imported.repositoryCanonicalEvidence?.totalBytes
      || tree !== imported.repositoryCanonicalEvidence?.canonicalTreeSha256 || tree !== policy.hostedSuccessEvidence.repositoryCanonicalTreeSha256) failures.push('repository canonical evidence tree drift')
  }
  if (policy.nextAction !== 'execute-m6-6-v1.0.18-final-artifact-manifest-and-release-readiness-audit') failures.push('M6-6 handoff drift')
} else {
  failures.push(`unsupported M6-5 status: ${policy.status}`)
}

if (failures.length) {
  console.error(`M6-5 hosted installer lifecycle check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M6-5 contract accepted: ${policy.status}; exact 1.0.18 candidate and v1.0.17 upgrade baseline remain frozen.`)
