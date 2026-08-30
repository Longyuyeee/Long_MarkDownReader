import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v115-m4f2-v1016-candidate-quality-gate-and-runtime-smoke-policy.json')
const evidence = json('docs/evidence/post-v115-m4f2-v1016-candidate-quality-gate-and-runtime-smoke/audit.json')
const predecessor = json('shared/post-v115-m4f1-v1016-atomic-version-transition-policy.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const packageManifest = json('package.json')
const r5fManifest = json('docs/evidence/r5f-safe-tauri-runtime/manifest.json')
const r5fRoutes = json('docs/evidence/r5f-safe-tauri-runtime/route-mount-evidence.json')
const r5gManifest = json('docs/evidence/r5g-desktop-artifact-smoke/audit-manifest.json')
const r5gRoutes = json('docs/evidence/r5g-desktop-artifact-smoke/route-mount-evidence.json')
const r5gPerformance = json('docs/evidence/r5g-desktop-artifact-smoke/route-performance-evidence.json')
const failures = []

const candidate = policy.candidateSourceCommit
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const passed = entries => entries.filter(entry => entry.status === 'passed').length
const artifact = kind => r5gManifest.artifacts?.find(entry => entry.kind === kind)

if (policy.stage !== 'M4F-2' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4F-2 predecessor chain drifted')
if (evidence.stage !== policy.stage || evidence.status !== 'passed' || evidence.candidateSourceCommit !== candidate) failures.push('M4F-2 evidence identity drifted')
if (!/^[0-9a-f]{40}$/.test(candidate)) failures.push('candidate source commit is not an exact SHA')
else {
  try {
    git('cat-file', '-e', `${candidate}^{commit}`)
    execFileSync('git', ['merge-base', '--is-ancestor', candidate, 'HEAD'])
  } catch {
    failures.push('candidate source commit is missing or is not an ancestor of HEAD')
  }
}
if (packageManifest.version !== '1.0.16' || policy.candidateVersion !== '1.0.16' || evidence.candidateVersion !== '1.0.16') failures.push('candidate binary identity drifted')
if (policy.publicVersion !== '1.0.15' || evidence.publicVersion !== '1.0.15' || development.publicVersion !== '1.0.15' || development.publicTag !== 'v1.0.15') failures.push('public release boundary drifted')
if (policy.qualityGate?.status !== 'passed' || policy.qualityGate?.command !== 'npm run ci:patch-release' || !policy.qualityGate?.frontendBuildPassed || !policy.qualityGate?.rustLockedCheckPassed || !policy.qualityGate?.productionDependencyAuditPassed || policy.qualityGate?.productionVulnerabilities !== 0) failures.push('quality gate policy drifted')
if (evidence.qualityGate?.status !== 'passed' || evidence.qualityGate?.moduleCount !== 6275 || evidence.qualityGate?.formatCount !== 43 || evidence.qualityGate?.extensionCount !== 91 || !evidence.qualityGate?.rustLockedCheckPassed || evidence.qualityGate?.productionVulnerabilities !== 0) failures.push('quality gate evidence drifted')
if (!['v1.0.16-community-release-quality-gate-and-runtime-smoke-passed-installer-pending', 'v1.0.16-community-release-hosted-lifecycle-passed-final-release-audit-pending'].includes(community.currentStatus) || community.releaseCandidate !== false || community.candidate?.artifactSourceCommit !== candidate || community.candidate?.qualityGateCommand !== policy.qualityGate.command) failures.push('community candidate intermediate state drifted')
if (!community.gates?.frontendBuildPassed || !community.gates?.rustLockedCheckPassed || !community.gates?.productionDependencyAuditPassed || !community.gates?.qualityGatePassed || !community.gates?.localRuntimeSmokePassed) failures.push('completed community gates drifted')
const lifecycleAdvanced = community.currentStatus === 'v1.0.16-community-release-hosted-lifecycle-passed-final-release-audit-pending'
if (lifecycleAdvanced) {
  if (!community.gates?.msiBuilt || !community.gates?.nsisBuilt || !community.gates?.artifactHashesVerified || !community.gates?.installedLifecyclePassed || community.gates?.githubReleasePublished || community.candidate?.artifacts?.length !== 2) failures.push('M4F-3 completion facts drifted')
  if (development.currentStage !== 'M4F-4-v1.0.16-final-artifact-manifest-and-release-readiness-audit' || development.binaryVersionTransition !== 'v1.0.16-hosted-installer-lifecycle-passed') failures.push('M4F-4 handoff drifted')
} else {
  if (community.gates?.msiBuilt || community.gates?.nsisBuilt || community.gates?.artifactHashesVerified || community.gates?.installedLifecyclePassed || community.gates?.githubReleasePublished || community.candidate?.artifacts?.length) failures.push('installer or publication boundary was promoted early')
  if (development.currentStage !== `${policy.selectedNextStage?.id}-${policy.selectedNextStage?.name}` || development.binaryVersionTransition !== 'v1.0.16-quality-gate-and-runtime-smoke-passed') failures.push('M4F-3 handoff drifted')
}
if (development.releaseCandidate !== false) failures.push('development candidate boundary drifted')
if (r5fManifest.appVersion !== '1.0.16' || r5fManifest.routeCount !== 11 || r5fManifest.passedRouteCount !== 11 || r5fManifest.failedRouteCount !== 0 || r5fManifest.desktopFileIoProven || r5fManifest.sourceUserContentIncluded || r5fManifest.releaseCandidate) failures.push('R5F manifest drifted')
if (r5fRoutes.routes?.length !== 11 || passed(r5fRoutes.routes) !== 11 || r5fRoutes.routes.some(route => !route.appMounted || !route.routeWrapperMounted || route.crashFallbackVisible)) failures.push('R5F route evidence drifted')
if (r5gManifest.appVersion !== '1.0.16' || r5gManifest.checks?.length !== 6 || passed(r5gManifest.checks) !== 6 || r5gManifest.sourceUserContentIncluded || r5gManifest.signedArtifactRuntimeProven || r5gManifest.releaseCandidate) failures.push('R5G manifest drifted')
if (r5gRoutes.routes?.length !== 11 || passed(r5gRoutes.routes) !== 11 || r5gRoutes.routes.some(route => !route.routeWrapperMounted || route.crashFallbackVisible)) failures.push('R5G route evidence drifted')
if (r5gPerformance.routes?.length < 11 || r5gPerformance.sourceUserContentIncluded) failures.push('R5G performance evidence drifted')
const debugArtifact = artifact('debug-runtime-smoke')
const releaseArtifact = artifact('release-no-bundle')
if (debugArtifact?.size !== evidence.r5g?.debugArtifact?.sizeBytes || debugArtifact?.sha256 !== evidence.r5g?.debugArtifact?.sha256 || debugArtifact?.runtimeSmokeExecuted !== true) failures.push('R5G debug artifact receipt drifted')
if (releaseArtifact?.size !== evidence.r5g?.releaseNoBundleArtifact?.sizeBytes || releaseArtifact?.sha256 !== evidence.r5g?.releaseNoBundleArtifact?.sha256 || releaseArtifact?.runtimeSmokeExecuted !== false) failures.push('R5G release no-bundle receipt drifted')
for (const image of ['docs/evidence/r5g-desktop-artifact-smoke/txt-save-reopen.jpg', 'docs/evidence/r5g-desktop-artifact-smoke/json-save-reopen.jpg']) {
  if (!fs.existsSync(image) || fs.statSync(image).size < 10000) failures.push(`${image} is missing or too small`)
}
if (git('tag', '--list', 'v1.0.16')) failures.push('v1.0.16 tag exists before release closure')
if (failures.length) { console.error(`M4F-2 candidate quality/runtime check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log(`M4F-2 accepted: candidate ${candidate} passed the full quality gate, R5F 11/11 and R5G 6/6 + 11/11; installers, tag and release remain pending.`)
