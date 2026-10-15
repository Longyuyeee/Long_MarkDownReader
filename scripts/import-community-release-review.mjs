import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value, all[index + 1]]], []))
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
const directory = args['--review-dir'], buildRun = Number(args['--build-run']), reviewRun = Number(args['--review-run'])
assert.ok(directory && Number.isSafeInteger(buildRun) && buildRun > 0 && Number.isSafeInteger(reviewRun) && reviewRun > 0, 'Provide immutable build/review run IDs and the downloaded review directory')
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const receipt = json(path.join(directory, 'installer-build-receipt.json'))
assert.equal(receipt.appVersion, version)
assert.equal(receipt.sourceUserContentIncluded, false)
assert.match(receipt.candidateSourceCommit, /^[a-f0-9]{40}$/)
assert.equal(receipt.artifacts.length, 2)
const reports = Object.fromEntries([
  ['lifecycle', 'lifecycle-result.json', 22], ['management', 'management-backup-index-evidence.json', 7],
  ['workspace', 'installed-artifact-smoke.json', 18], ['version', 'installed-version-identity.json', 4],
  ['workflow', 'installed-v110-workflow.json', 8], ['experience', 'installed-v111-workflow.json', 8],
  ['fileManagement', 'installed-v112-workflow.json', 9], ['foundation', 'installed-v113-workflow.json', 8],
...(['1.1.4', '1.1.5'].includes(version) ? [['foundationExtended', 'installed-v114-workflow.json', 8]] : []),
...(version === '1.1.5' ? [['foundationHardening', 'installed-v115-workflow.json', 10]] : []),
].map(([key, file, count]) => {
  const report = json(path.join(directory, file))
  assert.equal(report.status, 'passed', file); assert.equal(report.sourceUserContentIncluded, false, file)
  assert.equal(report.checks.length, count, file); assert.ok(report.checks.every(check => check.status === 'passed'), file)
  if (report.appVersion) assert.equal(report.appVersion, version, file)
  if (report.sourceCommit) assert.equal(report.sourceCommit, receipt.candidateSourceCommit, file)
  return [key, { file, report }]
}))
assert.equal(reports.lifecycle.report.currentVersion, version)
assert.equal(reports.lifecycle.report.previousVersion, receipt.previousVersion)
const artifacts = receipt.artifacts.map(artifact => ({
  ...artifact, sourceFileName: artifact.fileName, fileName: artifact.fileName.replace('Long编辑_', 'LongEdit_'),
}))
for (const artifact of artifacts) {
  assert.ok(['msi', 'nsis'].includes(artifact.target)); assert.equal(artifact.authenticodeStatus, 'NotSigned')
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/); assert.ok(artifact.sizeBytes > 0)
}
const nsis = artifacts.find(artifact => artifact.target === 'nsis')
assert.equal(reports.lifecycle.report.currentInstallerSha256, nsis.sha256)
const evidenceRoot = 'docs/evidence/v' + version.replaceAll('.', '-') + '-candidate-lifecycle'
const releaseRoot = 'docs/evidence/v' + version + '-release'
fs.mkdirSync(evidenceRoot, { recursive: true }); fs.mkdirSync(releaseRoot, { recursive: true })
const files = fs.readdirSync(directory).filter(file => /\.(?:json|jpg|png)$/i.test(file) && fs.statSync(path.join(directory, file)).isFile()).sort()
for (const file of files) fs.copyFileSync(path.join(directory, file), path.join(evidenceRoot, file))
const entries = files.map(file => { const bytes = fs.readFileSync(path.join(evidenceRoot, file)); return { path: file, sizeBytes: bytes.length, sha256: digest(bytes) } })
const runtimeReports = Object.fromEntries([
  ...['workspace', 'version', 'workflow', 'experience', 'fileManagement', 'foundation', ...(['1.1.4', '1.1.5'].includes(version) ? ['foundationExtended'] : []), ...(version === '1.1.5' ? ['foundationHardening'] : [])].map(key => [key, reports[key].file]),
  ['routes', 'installed-route-mount-evidence.json'],
].map(([key, file]) => [key, { path: evidenceRoot + '/' + file, sha256: digest(fs.readFileSync(path.join(evidenceRoot, file))) }]))
const checksums = artifacts.map(artifact => artifact.sha256 + '  ' + artifact.fileName).join('\n') + '\n'
fs.writeFileSync(path.join(releaseRoot, 'SHA256SUMS.txt'), checksums)
const manifest = {
  schemaVersion: 1, stage: 'V' + version, status: 'hosted-lifecycle-and-installed-workflows-passed-ready-to-publish',
  appVersion: version, sourceVersion: version, sourceCommit: receipt.candidateSourceCommit,
  hostedRunId: reviewRun, artifactBuildRunId: buildRun, artifacts,
  checksumFile: { fileName: 'SHA256SUMS.txt', sizeBytes: Buffer.byteLength(checksums), sha256: digest(checksums) },
  qualityGate: { status: 'passed', command: 'npm run ci:patch-release', runId: buildRun },
  runtimeSmoke: { status: 'passed-installed-tauri-webview2', checksPassed: 18, routesPassed: 11, reports: runtimeReports },
  hostedInstalledLifecycle: {
    status: 'passed', runId: reviewRun, sourceCommit: receipt.candidateSourceCommit, evidenceRoot,
    evidenceManifest: releaseRoot + '/import-manifest.json', lifecycleChecksPassed: 22, installedWorkspaceChecksPassed: 18,
    installedRoutesPassed: 11, managementRollbackChecksPassed: 7, workflowChecksPassed: 8,
    experienceChecksPassed: 8, fileManagementChecksPassed: 9, foundationChecksPassed: 8, ...(['1.1.4', '1.1.5'].includes(version) ? { foundationExtendedChecksPassed: 8 } : {}),
    ...(version === '1.1.5' ? { foundationHardeningChecksPassed: 10 } : {}),
    versionChecksPassed: 4, failedChecks: 0, sourceUserContentIncluded: false,
  },
  boundaries: { communityUnsigned: true, enterprisePromotionEligible: false, releaseAssetsPublished: false, managedUpdaterReleaseAssetsPresent: false, legacyTauriUpdaterArtifactsPresent: false },
  sourceUserContentIncluded: false, releasePublished: false,
}
assertInstalledReleaseRuntime(manifest)
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
write(path.join(releaseRoot, 'artifact-manifest.json'), manifest)
write(path.join(releaseRoot, 'import-manifest.json'), {
  schemaVersion: 1, status: 'hosted-installer-lifecycle-passed', githubRunId: reviewRun, artifactBuildRunId: buildRun,
  productSourceCommit: receipt.candidateSourceCommit, appVersion: version, sourceUserContentIncluded: false,
  releaseCandidate: false,
  checks: {
    lifecyclePassed: 22, lifecycleFailed: 0, installedArtifactPassed: 18, installedArtifactFailed: 0,
    installedRoutesPassed: 11, managementRollbackPassed: 7, workflowPassed: 8,
    experiencePassed: 8, fileManagementPassed: 9, foundationPassed: 8, ...(['1.1.4', '1.1.5'].includes(version) ? { foundationExtendedPassed: 8 } : {}), versionPassed: 4,
    ...(version === '1.1.5' ? { foundationHardeningPassed: 10 } : {}),
  },
  files: entries,
})
const community = json('shared/v1-community-release-policy.json')
assert.equal(community.appVersion, version); assert.equal(community.patchValidation.previousPublicVersion, receipt.previousVersion)
community.gates = Object.fromEntries(Object.keys(community.gates).map(key => [key, key !== 'githubReleasePublished']))
community.releaseCandidate = true; community.currentStatus = 'v' + version + '-community-release-ready-to-publish'
community.patchValidation.fullInstalledLifecycleRerun = true
community.candidate = { artifactSourceCommit: receipt.candidateSourceCommit, qualityGateCommand: 'npm run ci:patch-release', artifactBuildRunId: buildRun, hostedInstalledLifecycleRunId: reviewRun, artifacts }
community.nextAction = 'publish-verified-v' + version
write('shared/v1-community-release-policy.json', community)
const development = json('shared/development-version-policy.json')
development.binaryVersionTransition = 'v' + version + '-release-ready'
development.activeSlice.status = 'installed-workflows-passed-ready-to-publish'
write('shared/development-version-policy.json', development)
console.log('Imported immutable review and marked v' + version + ' ready; release publication remains pending.')
