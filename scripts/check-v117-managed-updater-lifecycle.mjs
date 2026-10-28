import crypto from 'node:crypto'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const fail = message => failures.push(message)
const byteVariants = file => {
  const raw = fs.readFileSync(file)
  if (!file.endsWith('.json')) return [raw]
  const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))
  const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'))
  return [raw, lf, crlf]
}
const matchesIdentity = (file, sizeBytes, sha256) => byteVariants(file).some(bytes => bytes.length === sizeBytes && crypto.createHash('sha256').update(bytes).digest('hex') === sha256)
const policy = json('shared/v117-managed-updater-lifecycle-policy.json')
const previousReceipt = json('docs/evidence/v1.0.16-release/release-receipt.json')
const currentReceipt = json('docs/evidence/v1.0.17-release/release-receipt.json')
const currentInstalled = json('docs/evidence/post-v116-m5-6-v1017-hosted-installer-lifecycle/installed-artifact-smoke.json')
const workflow = read('.github/workflows/v117-managed-updater-lifecycle.yml')
const probe = read('scripts/capture-v109-managed-updater-lifecycle.mjs')
const audit = read('docs/Post_v1.0.16_M5_9_v1.0.17_Official_Managed_Updater_Observation_Audit_2026-08-31.md')
const readme = read('README.md')
const development = json('shared/development-version-policy.json')
const previousAsset = previousReceipt.assets.find(item => item.name.endsWith('-setup.exe'))
const currentAsset = currentReceipt.assets.find(item => item.name.endsWith('-setup.exe'))

if (policy.schemaVersion !== 1 || policy.stage !== 'V1.0.17-U1' || !['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) fail('v1.0.17 updater policy identity drift')
if (policy.releases?.previous?.version !== '1.0.16' || policy.releases?.previous?.tag !== previousReceipt.release?.tag || policy.releases?.previous?.installer?.fileName !== previousAsset?.name || policy.releases?.previous?.installer?.sizeBytes !== previousAsset?.sizeBytes || policy.releases?.previous?.installer?.sha256 !== previousAsset?.sha256) fail('previous official release drift')
if (policy.releases?.current?.version !== '1.0.17' || policy.releases?.current?.tag !== currentReceipt.release?.tag || policy.releases?.current?.url !== currentReceipt.release?.url || policy.releases?.current?.taggedCommit !== currentReceipt.release?.taggedCommit || policy.releases?.current?.installer?.fileName !== currentAsset?.name || policy.releases?.current?.installer?.sizeBytes !== currentAsset?.sizeBytes || policy.releases?.current?.installer?.sha256 !== currentAsset?.sha256 || policy.releases?.current?.standaloneReleaseExecutableReferenceSha256 !== currentInstalled.installedExecutable?.sha256 || policy.releases?.current?.installedPackageExecutable?.sizeBytes !== currentInstalled.installedExecutable?.sizeBytes) fail('current official release drift')
if (Object.entries(policy.requirements ?? {}).some(([key, value]) => key === 'sourceUserContentIncluded' ? value !== false : value !== true)) fail('updater requirement boundary drift')
for (const token of ['workflow_dispatch:', 'runs-on: windows-latest', 'LONGEDIT_MANAGED_UPDATER_DISPOSABLE: "1"', 'shared\\v117-managed-updater-lifecycle-policy.json', 'gh release download $env:PREVIOUS_TAG', 'gh release download $env:CURRENT_TAG', 'releases/latest', 'refs/tags/${env:CURRENT_TAG}:refs/tags/${env:CURRENT_TAG}', 'run-v109-managed-updater-lifecycle.ps1', 'capture-v109-managed-updater-lifecycle.mjs', 'v117-managed-updater-lifecycle-${{ github.run_id }}']) if (!workflow.includes(token)) fail(`updater workflow missing: ${token}`)
if (workflow.includes('npm run tauri -- build') || workflow.includes('src-tauri/target')) fail('updater workflow must use published assets')
if (!probe.includes('await delay(1000)') || !probe.includes('visual surface is stable')) fail('updater screenshot stabilization contract is missing')
for (const token of ['v1.0.16', 'v1.0.17', '预期与实际差异', '用户确认', 'SHA-256', '自动重启', '资料', '托管']) if (!audit.includes(token)) fail(`updater audit missing: ${token}`)
const readmeTokens = ['1.0.18', '1.0.19', '1.0.20', '1.0.21', '1.0.22', '1.0.23', '1.0.24', '1.0.25', '1.0.26', '1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4'].includes(development.publicVersion)
  ? [`Stable-v${development.publicVersion}`, `LongEdit_${development.publicVersion}_x64-setup.exe`, `LongEdit_${development.publicVersion}_x64_zh-CN.msi`]
  : ['Stable-v1.0.17', 'LongEdit_1.0.17_x64-setup.exe', currentAsset.sha256, 'LongEdit_1.0.17_x64_zh-CN.msi']
for (const token of readmeTokens) if (!readme.includes(token)) fail(`README public download fact missing: ${token}`)

const completed = policy.status === 'hosted-managed-update-passed'
if (!completed) {
  if (policy.gates?.harnessImplemented !== true || Object.entries(policy.gates ?? {}).some(([key, value]) => key !== 'harnessImplemented' && value !== false) || policy.githubRun !== null || policy.nextAction !== 'push-harness-pass-current-audit-and-run-hosted-managed-updater-lifecycle') fail('pending updater state drift')
} else {
  if (Object.values(policy.gates ?? {}).some(value => value !== true) || !Number.isInteger(policy.githubRun?.id) || policy.githubRun?.conclusion !== 'success' || !/^[0-9a-f]{40}$/.test(policy.githubRun?.headCommit ?? '') || policy.nextAction !== 'v1.0.17-release-and-managed-updater-closure-complete') fail('completed updater state drift')
  const attempts = policy.attemptHistory ?? []
  if (attempts.length !== 3 || attempts[0]?.status !== 'rejected-stale-release-copy' || attempts[0]?.accepted !== false || attempts[1]?.status !== 'rejected-transition-ghosting-in-available-screenshot' || attempts[1]?.accepted !== false || attempts[2]?.runId !== policy.githubRun.id || attempts[2]?.accepted !== true) fail('real attempt history drift')
  const root = policy.evidenceRoot
  const manifestPath = `${root}/import-manifest.json`
  if (!fs.existsSync(manifestPath)) fail('v1.0.17 updater evidence is missing')
  else {
    const manifest = json(manifestPath)
    if (manifest.stage !== 'V1.0.17-U1I' || manifest.status !== 'accepted' || manifest.githubRunId !== policy.githubRun.id || manifest.artifactId !== policy.githubRun.artifactId || manifest.headCommit !== policy.githubRun.headCommit || manifest.previousVersion !== '1.0.16' || manifest.currentVersion !== '1.0.17' || manifest.officialInstallerSha256 !== policy.releases.current.installer.sha256 || manifest.installedExecutableSha256 !== policy.releases.current.installedPackageExecutable.sha256 || manifest.lifecycleChecks?.passed !== 12 || manifest.lifecycleChecks?.failed !== 0 || manifest.releaseMessaging !== 'official-published-copy-observed-after-correction' || manifest.sourceUserContentIncluded !== false || manifest.files?.length !== 9 || manifest.files.filter(file => file.path.endsWith('.jpg')).some(file => file.visuallyReviewed !== true)) fail('v1.0.17 updater import drift')
    for (const file of manifest.files ?? []) {
      const evidencePath = `${root}/${file.path}`
      if (!fs.existsSync(evidencePath)) fail(`v1.0.17 updater evidence missing: ${file.path}`)
      else if (!matchesIdentity(evidencePath, file.bytes, file.sha256)) fail(`v1.0.17 updater evidence hash drift: ${file.path}`)
    }
    const discovery = json(`${root}/managed-updater-discovery-evidence.json`)
    if (!discovery.release?.releaseNotes?.includes('状态：已正式发布。') || discovery.confirmation?.installerStartedBeforeConfirmation !== false) fail('official published copy or confirmation boundary drift')
  }
}

if (failures.length) { console.error(failures.map(message => `- ${message}`).join('\n')); process.exit(1) }
console.log(`V1.0.17 managed updater lifecycle contract passed: ${completed ? 'hosted 1.0.16 -> 1.0.17 evidence accepted' : 'safe hosted execution harness is ready'}.`)
