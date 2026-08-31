import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const fail = message => failures.push(message)
const policy = json('shared/v117-managed-updater-lifecycle-policy.json')
const previousReceipt = json('docs/evidence/v1.0.16-release/release-receipt.json')
const currentReceipt = json('docs/evidence/v1.0.17-release/release-receipt.json')
const currentInstalled = json('docs/evidence/post-v116-m5-6-v1017-hosted-installer-lifecycle/installed-artifact-smoke.json')
const workflow = read('.github/workflows/v117-managed-updater-lifecycle.yml')
const audit = read('docs/Post_v1.0.16_M5_9_v1.0.17_Official_Managed_Updater_Observation_Audit_2026-08-31.md')
const readme = read('README.md')
const previousAsset = previousReceipt.assets.find(item => item.name.endsWith('-setup.exe'))
const currentAsset = currentReceipt.assets.find(item => item.name.endsWith('-setup.exe'))

if (policy.schemaVersion !== 1 || policy.stage !== 'V1.0.17-U1' || !['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) fail('v1.0.17 updater policy identity drift')
if (policy.releases?.previous?.version !== '1.0.16' || policy.releases?.previous?.tag !== previousReceipt.release?.tag || policy.releases?.previous?.installer?.fileName !== previousAsset?.name || policy.releases?.previous?.installer?.sizeBytes !== previousAsset?.sizeBytes || policy.releases?.previous?.installer?.sha256 !== previousAsset?.sha256) fail('previous official release drift')
if (policy.releases?.current?.version !== '1.0.17' || policy.releases?.current?.tag !== currentReceipt.release?.tag || policy.releases?.current?.url !== currentReceipt.release?.url || policy.releases?.current?.taggedCommit !== currentReceipt.release?.taggedCommit || policy.releases?.current?.installer?.fileName !== currentAsset?.name || policy.releases?.current?.installer?.sizeBytes !== currentAsset?.sizeBytes || policy.releases?.current?.installer?.sha256 !== currentAsset?.sha256 || policy.releases?.current?.standaloneReleaseExecutableReferenceSha256 !== currentInstalled.installedExecutable?.sha256 || policy.releases?.current?.installedPackageExecutable?.sizeBytes !== currentInstalled.installedExecutable?.sizeBytes) fail('current official release drift')
if (Object.entries(policy.requirements ?? {}).some(([key, value]) => key === 'sourceUserContentIncluded' ? value !== false : value !== true)) fail('updater requirement boundary drift')
for (const token of ['workflow_dispatch:', 'runs-on: windows-latest', 'LONGEDIT_MANAGED_UPDATER_DISPOSABLE: "1"', 'shared\\v117-managed-updater-lifecycle-policy.json', 'gh release download $env:PREVIOUS_TAG', 'gh release download $env:CURRENT_TAG', 'releases/latest', 'refs/tags/${env:CURRENT_TAG}:refs/tags/${env:CURRENT_TAG}', 'run-v109-managed-updater-lifecycle.ps1', 'capture-v109-managed-updater-lifecycle.mjs', 'v117-managed-updater-lifecycle-${{ github.run_id }}']) if (!workflow.includes(token)) fail(`updater workflow missing: ${token}`)
if (workflow.includes('npm run tauri -- build') || workflow.includes('src-tauri/target')) fail('updater workflow must use published assets')
for (const token of ['v1.0.16', 'v1.0.17', '预期与实际差异', '用户确认', 'SHA-256', '自动重启', '资料', '托管']) if (!audit.includes(token)) fail(`updater audit missing: ${token}`)
for (const token of ['Stable-v1.0.17', 'LongEdit_1.0.17_x64-setup.exe', currentAsset.sha256, 'LongEdit_1.0.17_x64_zh-CN.msi']) if (!readme.includes(token)) fail(`README public download fact missing: ${token}`)

const completed = policy.status === 'hosted-managed-update-passed'
if (!completed) {
  if (policy.gates?.harnessImplemented !== true || Object.entries(policy.gates ?? {}).some(([key, value]) => key !== 'harnessImplemented' && value !== false) || policy.githubRun !== null || policy.nextAction !== 'push-harness-pass-current-audit-and-run-hosted-managed-updater-lifecycle') fail('pending updater state drift')
} else if (Object.values(policy.gates ?? {}).some(value => value !== true) || !Number.isInteger(policy.githubRun?.id) || policy.githubRun?.conclusion !== 'success' || !/^[0-9a-f]{40}$/.test(policy.githubRun?.headCommit ?? '') || policy.nextAction !== 'v1.0.17-release-and-managed-updater-closure-complete') fail('completed updater state drift')

if (failures.length) { console.error(failures.map(message => `- ${message}`).join('\n')); process.exit(1) }
console.log(`V1.0.17 managed updater lifecycle contract passed: ${completed ? 'hosted 1.0.16 -> 1.0.17 evidence accepted' : 'safe hosted execution harness is ready'}.`)
