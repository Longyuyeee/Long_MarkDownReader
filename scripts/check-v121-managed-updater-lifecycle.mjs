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

const policy = json('shared/v121-managed-updater-lifecycle-policy.json')
const development = json('shared/development-version-policy.json')
const previousReceipt = json('docs/evidence/v1.0.20-release/release-receipt.json')
const currentReceipt = json('docs/evidence/v1.0.21-release/release-receipt.json')
const candidateLifecycle = json('docs/evidence/post-v120-v1021-hosted-installer-lifecycle/import-manifest.json')
const workflow = read('.github/workflows/v121-managed-updater-lifecycle.yml')
const probe = read('scripts/capture-v109-managed-updater-lifecycle.mjs')
const audit = read('docs/Post_v1.0.21_M8_12B_Official_Managed_Updater_Observation_Audit_2026-09-03.md')
const previousAsset = previousReceipt.assets.find(item => item.name.endsWith('-setup.exe'))
const currentAsset = currentReceipt.assets.find(item => item.name.endsWith('-setup.exe'))

if (policy.schemaVersion !== 1 || policy.stage !== 'V1.0.21-U1' || !['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) fail('v1.0.21 updater policy identity drift')
if (development.publicVersion !== '1.0.21' || development.runtimeBaseVersion !== '1.0.21' || development.developmentTargetVersion !== '1.0.22') fail('development version boundary drift')
if (policy.releases?.previous?.version !== '1.0.20' || policy.releases?.previous?.tag !== previousReceipt.release?.tag || policy.releases?.previous?.installer?.fileName !== previousAsset?.name || policy.releases?.previous?.installer?.sizeBytes !== previousAsset?.sizeBytes || policy.releases?.previous?.installer?.sha256 !== previousAsset?.sha256) fail('previous official release drift')
if (policy.releases?.current?.version !== '1.0.21' || policy.releases?.current?.tag !== currentReceipt.release?.tag || policy.releases?.current?.url !== currentReceipt.release?.url || policy.releases?.current?.taggedCommit !== currentReceipt.release?.taggedCommit || policy.releases?.current?.installer?.fileName !== currentAsset?.name || policy.releases?.current?.installer?.sizeBytes !== currentAsset?.sizeBytes || policy.releases?.current?.installer?.sha256 !== currentAsset?.sha256) fail('current official release drift')
if (policy.releases?.current?.installedPackageExecutable?.sha256 !== '621f933df95fe6b050c59b98e7471a97d0f2f8487bfc56968bbb54ba29b75539' || policy.releases?.current?.installedPackageExecutable?.sizeBytes !== 112869888 || candidateLifecycle.githubRunId !== 33488674071) fail('installed executable trust anchor drift')
if (Object.entries(policy.requirements ?? {}).some(([key, value]) => key === 'sourceUserContentIncluded' ? value !== false : value !== true)) fail('updater requirement boundary drift')

for (const token of ['workflow_dispatch:', 'runs-on: windows-latest', 'fetch-depth: 0', 'fetch-tags: true', 'LONGEDIT_MANAGED_UPDATER_DISPOSABLE: "1"', 'shared\\v121-managed-updater-lifecycle-policy.json', 'gh release download $env:PREVIOUS_TAG', 'gh release download $env:CURRENT_TAG', 'releases/latest', 'run-v109-managed-updater-lifecycle.ps1', 'capture-v109-managed-updater-lifecycle.mjs', 'v121-managed-updater-lifecycle-${{ github.run_id }}']) if (!workflow.includes(token)) fail(`updater workflow missing: ${token}`)
if (workflow.includes('npm run tauri -- build') || workflow.includes('src-tauri/target')) fail('updater workflow must use published assets')
if (!probe.includes('await delay(1000)') || !probe.includes('visual surface is stable')) fail('updater screenshot stabilization contract is missing')
for (const token of ['v1.0.20', 'v1.0.21', '预期与实际差异', '用户确认', 'SHA-256', '自动重启', '资料', '托管']) if (!audit.includes(token)) fail(`updater audit missing: ${token}`)

const completed = policy.status === 'hosted-managed-update-passed'
if (!completed) {
  if (policy.gates?.harnessImplemented !== true || Object.entries(policy.gates ?? {}).some(([key, value]) => key !== 'harnessImplemented' && value !== false) || policy.githubRun !== null || policy.nextAction !== 'push-harness-pass-current-audit-and-run-hosted-managed-updater-lifecycle') fail('pending updater state drift')
} else {
  if (Object.values(policy.gates ?? {}).some(value => value !== true) || !Number.isInteger(policy.githubRun?.id) || policy.githubRun?.conclusion !== 'success' || !/^[0-9a-f]{40}$/.test(policy.githubRun?.headCommit ?? '') || policy.nextAction !== 'v1.0.21-release-and-managed-updater-closure-complete') fail('completed updater state drift')
  const attempts = policy.attemptHistory ?? []
  if (attempts.length < 1 || attempts.at(-1)?.runId !== policy.githubRun.id || attempts.at(-1)?.accepted !== true) fail('real attempt history drift')
  const root = policy.evidenceRoot
  const manifestPath = `${root}/import-manifest.json`
  if (!fs.existsSync(manifestPath)) fail('v1.0.21 updater evidence is missing')
  else {
    const manifest = json(manifestPath)
    if (manifest.stage !== 'V1.0.21-U1I' || manifest.status !== 'accepted' || manifest.githubRunId !== policy.githubRun.id || manifest.artifactId !== policy.githubRun.artifactId || manifest.headCommit !== policy.githubRun.headCommit || manifest.previousVersion !== '1.0.20' || manifest.currentVersion !== '1.0.21' || manifest.officialInstallerSha256 !== policy.releases.current.installer.sha256 || manifest.installedExecutableSha256 !== policy.releases.current.installedPackageExecutable.sha256 || manifest.lifecycleChecks?.passed !== 12 || manifest.lifecycleChecks?.failed !== 0 || manifest.releaseMessaging !== 'official-published-copy-observed' || manifest.sourceUserContentIncluded !== false || manifest.files?.length !== 9 || manifest.files.filter(file => file.path.endsWith('.jpg')).some(file => file.visuallyReviewed !== true)) fail('v1.0.21 updater import drift')
    for (const file of manifest.files ?? []) {
      const evidencePath = `${root}/${file.path}`
      if (!fs.existsSync(evidencePath)) fail(`v1.0.21 updater evidence missing: ${file.path}`)
      else if (!matchesIdentity(evidencePath, file.bytes, file.sha256)) fail(`v1.0.21 updater evidence hash drift: ${file.path}`)
    }
    const discovery = json(`${root}/managed-updater-discovery-evidence.json`)
    if (!discovery.release?.releaseNotes?.includes('v1.0.21 是知识图谱交互精修补丁') || !discovery.release?.releaseNotes?.includes('普通图谱根据节点密度设置可读缩放下限') || discovery.confirmation?.installerStartedBeforeConfirmation !== false) fail('official published copy or confirmation boundary drift')
  }
}

if (failures.length) { console.error(failures.map(message => `- ${message}`).join('\n')); process.exit(1) }
console.log(`V1.0.21 managed updater lifecycle contract passed: ${completed ? 'hosted 1.0.20 -> 1.0.21 evidence accepted' : 'safe hosted execution harness is ready'}.`)
