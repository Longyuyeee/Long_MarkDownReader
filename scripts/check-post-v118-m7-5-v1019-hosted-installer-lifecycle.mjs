import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const failures = []
const fail = message => failures.push(message)
const policy = json('shared/post-v118-m7-5-v1019-hosted-installer-lifecycle-policy.json')
const predecessor = json('shared/post-v118-m7-4-v1019-candidate-packaging-policy.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const workflow = fs.readFileSync(policy.workflow, 'utf8')
const evidenceRoot = policy.hostedSuccessEvidence?.evidenceRoot
const imported = evidenceRoot ? json(`${evidenceRoot}/import-manifest.json`) : null
const receipt = evidenceRoot ? json(`${evidenceRoot}/installer-build-receipt.json`) : null
const lifecycle = evidenceRoot ? json(`${evidenceRoot}/lifecycle-result.json`) : null
const installed = evidenceRoot ? json(`${evidenceRoot}/installed-artifact-smoke.json`) : null
const routes = evidenceRoot ? json(`${evidenceRoot}/installed-route-mount-evidence.json`) : null
const management = evidenceRoot ? json(`${evidenceRoot}/management-backup-index-evidence.json`) : null

if (policy.stage !== 'M7-5' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage || predecessor.status !== 'accepted') fail('M7-5 predecessor chain drift')
if (policy.candidateSourceCommit !== predecessor.candidateSourceCommit || policy.candidateVersion !== '1.0.19') fail('M7-5 candidate identity drift')
if (policy.previousPublicTag !== 'v1.0.18' || execFileSync('git', ['rev-list', '-n', '1', policy.previousPublicTag], { encoding: 'utf8' }).trim() !== policy.previousPublicCommit) fail('M7-5 previous public source drift')
if (policy.status !== 'hosted-installer-lifecycle-passed-release-readiness-pending' || policy.releaseCandidate || policy.sourceUserContentIncluded || policy.localCandidateObservation?.promotionalEvidence) fail('M7-5 release/privacy boundary drift')
if (policy.requiredArtifacts?.join(',') !== 'msi,nsis' || policy.requiredLifecycle?.length !== 4) fail('M7-5 hosted scope drift')

for (const token of [policy.candidateSourceCommit, 'ref: v1.0.18', 'PREVIOUS_VERSION: "1.0.18"', "package.version -ne '1.0.19'", 'build --bundles msi,nsis', 'Get-AuthenticodeSignature', 'run-r5i-isolated-install-lifecycle.ps1']) {
  if (!workflow.includes(token)) fail(`M7-5 workflow token missing: ${token}`)
}

const attempt = policy.attemptHistory?.[0]
if (policy.attemptHistory?.length !== 1 || attempt?.runId !== 33409497055 || attempt?.workflowCommit !== '1d48ea5fd3ccb182959a6b63256709ef5b34c8a8'
  || attempt?.productSourceCommit !== policy.candidateSourceCommit || attempt?.status !== 'hosted-installers-and-full-lifecycle-passed'
  || attempt?.lifecycleChecksPassed !== 22 || attempt?.installedArtifactChecksPassed !== 18 || attempt?.installedRoutesPassed !== 11
  || attempt?.managementRollbackChecksPassed !== 7 || attempt?.failedChecks !== 0 || !attempt?.acceptedForM7_6 || attempt?.acceptedForRelease) fail('M7-5 hosted attempt drift')

if (!imported || imported.githubRunId !== attempt?.runId || imported.artifact?.id !== 9766240379
  || imported.artifact?.zipSha256 !== policy.hostedSuccessEvidence?.artifactZipSha256
  || imported.productSourceCommit !== policy.candidateSourceCommit || imported.previousPublicCommit !== policy.previousPublicCommit
  || !imported.visualReview?.reviewed || imported.visualReview?.screenshotCount !== 14 || imported.releaseCandidate || imported.sourceUserContentIncluded
  || imported.selectedNextStage !== 'M7-6-v1.0.19-final-artifact-manifest-and-release-readiness-audit') fail('M7-5 imported evidence identity drift')
if (receipt?.artifacts?.[0]?.sha256 !== '04aca041970120b0685cb1d30ee95e5102b6fdd60b59394f3ecac45a00b863f0'
  || receipt?.artifacts?.[1]?.sha256 !== '996e12218a24e1689947ec0c358720cc84cc136ffb2ac581fe31682fb8516582'
  || receipt?.artifacts?.some(artifact => artifact.authenticodeStatus !== 'NotSigned')) fail('M7-5 hosted installer receipt drift')
if (lifecycle?.status !== 'passed' || lifecycle?.checks?.length !== 22 || lifecycle.checks.some(check => check.status !== 'passed')) fail('M7-5 R5I evidence drift')
if (installed?.status !== 'passed' || installed?.checks?.length !== 18 || installed.checks.some(check => check.status !== 'passed')) fail('M7-5 R5J evidence drift')
if (routes?.routes?.length !== 11 || routes.routes.some(route => route.status !== 'passed')) fail('M7-5 route evidence drift')
if (management?.status !== 'passed' || management?.checks?.length !== 7 || management.checks.some(check => check.status !== 'passed') || management.sourceUserContentIncluded) fail('M7-5 R5L evidence drift')

if (evidenceRoot) {
  const names = fs.readdirSync(evidenceRoot).filter(name => name !== 'import-manifest.json').sort()
  const bytesFor = name => name.endsWith('.json') ? Buffer.from(`${JSON.stringify(json(`${evidenceRoot}/${name}`), null, 2)}\n`) : fs.readFileSync(`${evidenceRoot}/${name}`)
  const rows = names.map(name => { const bytes = bytesFor(name); return `${name}:${bytes.length}:${crypto.createHash('sha256').update(bytes).digest('hex')}` })
  const tree = crypto.createHash('sha256').update(rows.join('\n')).digest('hex')
  if (names.length !== 29 || tree !== imported?.repositoryCanonicalEvidence?.canonicalTreeSha256 || tree !== policy.hostedSuccessEvidence?.repositoryCanonicalTreeSha256) fail('M7-5 canonical evidence tree drift')
}

if (development.currentStage !== 'M7-6-v1.0.19-final-artifact-manifest-and-release-readiness-audit' || development.binaryVersionTransition !== 'v1.0.19-hosted-installer-lifecycle-passed') fail('M7-5 development handoff drift')
if (!community.gates?.qualityGatePassed || !community.gates?.msiBuilt || !community.gates?.nsisBuilt || !community.gates?.artifactHashesVerified || !community.gates?.localRuntimeSmokePassed || !community.gates?.installedLifecyclePassed || community.gates?.githubReleasePublished || community.candidate?.artifactSourceCommit !== policy.candidateSourceCommit) fail('M7-5 community handoff drift')
if (policy.nextAction !== 'execute-m7-6-v1.0.19-final-artifact-manifest-and-release-readiness-audit') fail('M7-5 next action drift')

if (failures.length) { console.error(`M7-5 hosted lifecycle failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M7-5 hosted lifecycle accepted: 22/22 lifecycle, 18/18 installed, 11/11 routes, 7/7 rollback; v1.0.19 remains unpublished.')
