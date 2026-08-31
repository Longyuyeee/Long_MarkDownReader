import crypto from 'node:crypto'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const byteVariants = file => {
  const raw = fs.readFileSync(file)
  if (!file.endsWith('.json')) return [raw]
  const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))
  const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'))
  return [raw, lf, crlf]
}
const matchesIdentity = (file, sizeBytes, sha256) => byteVariants(file).some(bytes => bytes.length === sizeBytes && crypto.createHash('sha256').update(bytes).digest('hex') === sha256)
const failures = []
const fail = message => failures.push(message)
const requireTokens = (source, tokens, area) => tokens.forEach(token => {
  if (!source.includes(token)) fail(`${area} missing: ${token}`)
})

const policy = json('shared/v116-managed-updater-lifecycle-policy.json')
const previousReceipt = json('docs/evidence/v1.0.15-release/release-receipt.json')
const currentReceipt = json('docs/evidence/v1.0.16-release/release-receipt.json')
const currentInstalled = json('docs/evidence/post-v115-m4f3-v1016-hosted-installer-lifecycle/installed-artifact-smoke.json')
const workflow = read('.github/workflows/v116-managed-updater-lifecycle.yml')
const runner = read('scripts/run-v109-managed-updater-lifecycle.ps1')
const probe = read('scripts/capture-v109-managed-updater-lifecycle.mjs')
const audit = read('docs/Post_v1.0.15_M4F6_v1.0.16_Official_Managed_Updater_Observation_Audit_2026-08-31.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'V1.0.16-U1'
  || !['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) fail('v1.0.16 updater policy identity drift')
const previousAsset = previousReceipt.assets.find(item => item.name.endsWith('-setup.exe'))
const currentAsset = currentReceipt.assets.find(item => item.name.endsWith('-setup.exe'))
if (policy.releases?.previous?.version !== '1.0.15'
  || policy.releases?.previous?.tag !== previousReceipt.release?.tag
  || policy.releases?.previous?.installer?.fileName !== previousAsset?.name
  || policy.releases?.previous?.installer?.sizeBytes !== previousAsset?.sizeBytes
  || policy.releases?.previous?.installer?.sha256 !== previousAsset?.sha256) fail('previous official release drift')
if (policy.releases?.current?.version !== '1.0.16'
  || policy.releases?.current?.tag !== currentReceipt.release?.tag
  || policy.releases?.current?.url !== currentReceipt.release?.url
  || policy.releases?.current?.taggedCommit !== currentReceipt.release?.taggedCommit
  || policy.releases?.current?.releaseTargetCommitishObserved !== 'main'
  || policy.releases?.current?.installer?.fileName !== currentAsset?.name
  || policy.releases?.current?.installer?.sizeBytes !== currentAsset?.sizeBytes
  || policy.releases?.current?.installer?.sha256 !== currentAsset?.sha256
  || policy.releases?.current?.standaloneReleaseExecutableReferenceSha256 !== currentInstalled.installedExecutable?.sha256
  || policy.releases?.current?.installedPackageExecutable?.sizeBytes !== currentInstalled.installedExecutable?.sizeBytes) fail('current official release drift')
if (Object.entries(policy.requirements ?? {}).some(([key, value]) => key === 'sourceUserContentIncluded' ? value !== false : value !== true)) fail('updater requirement boundary drift')

requireTokens(workflow, [
  'workflow_dispatch:', 'runs-on: windows-latest', 'LONGEDIT_MANAGED_UPDATER_DISPOSABLE: "1"',
  'shared\\v116-managed-updater-lifecycle-policy.json', 'gh release download $env:PREVIOUS_TAG',
  'gh release download $env:CURRENT_TAG', 'releases/latest', 'refs/tags/${env:CURRENT_TAG}:refs/tags/${env:CURRENT_TAG}', 'git rev-list -n 1 $env:CURRENT_TAG',
  'releaseTargetCommitish = $current.target_commitish', 'run-v109-managed-updater-lifecycle.ps1',
  'capture-v109-managed-updater-lifecycle.mjs', 'v116-managed-updater-lifecycle-${{ github.run_id }}',
], 'v1.0.16 updater workflow')
if (workflow.includes('npm run tauri -- build') || workflow.includes('src-tauri/target')) fail('updater workflow must use published assets')
requireTokens(runner, [
  '-ConfirmDisposableMachine', '-AllowInstallerMutation', 'Updater downloaded an installer before explicit user confirmation',
  'downloaded-installer-sha256', 'silent-overwrite-install', 'automatic-relaunch-after-managed-update',
  'post-upgrade-reports-current', 'uninstall-retains-user-data', '$currentStage = "V$CurrentVersion-U1"',
], 'managed updater runner')
requireTokens(probe, [
  "invokeTauri('check_community_update')", "document.querySelector('.update-modal')", "textContent?.includes('下载并安装')",
  'installerStartedBeforeConfirmation: false', 'const currentStage = `V${currentVersion}-U1`',
], 'managed updater probe')
for (const token of ['v1.0.15', 'v1.0.16', '用户确认', 'SHA-256', '自动重启', '资料', '托管']) {
  if (!audit.includes(token)) fail(`v1.0.16 updater audit missing: ${token}`)
}

const completed = policy.status === 'hosted-managed-update-passed'
const firstAttempt = policy.attemptHistory?.[0]
if (firstAttempt?.runId !== 33350679455 || firstAttempt?.status !== 'failed-before-updater-at-tag-fetch-refspec' || firstAttempt?.installerExecuted !== false || firstAttempt?.accepted !== false) fail('first hosted attempt history drift')
if (!completed) {
  if (policy.gates?.harnessImplemented !== true
    || Object.entries(policy.gates ?? {}).some(([key, value]) => key !== 'harnessImplemented' && value !== false)
    || policy.githubRun !== null
    || policy.nextAction !== 'push-harness-pass-quality-gate-and-run-hosted-managed-updater-lifecycle') fail('pending updater state drift')
} else {
  if (Object.values(policy.gates ?? {}).some(value => value !== true)
    || !Number.isInteger(policy.githubRun?.id) || policy.githubRun?.conclusion !== 'success'
    || !/^[0-9a-f]{40}$/.test(policy.githubRun?.headCommit ?? '')
    || policy.nextAction !== 'v1.0.16-release-and-managed-updater-closure-complete') fail('completed updater state drift')
  const root = policy.evidenceRoot
  const importPath = `${root}/import-manifest.json`
  if (!fs.existsSync(importPath)) fail('v1.0.16 updater evidence is missing')
  else {
    const manifest = json(importPath)
    if (manifest.stage !== 'V1.0.16-U1I' || manifest.status !== 'accepted'
      || manifest.githubRunId !== policy.githubRun.id || manifest.headCommit !== policy.githubRun.headCommit
      || manifest.previousVersion !== '1.0.15' || manifest.currentVersion !== '1.0.16'
      || manifest.officialInstallerSha256 !== policy.releases.current.installer.sha256
      || manifest.installedExecutableSha256 !== policy.releases.current.installedPackageExecutable?.sha256
      || manifest.lifecycleChecks?.passed !== 12 || manifest.lifecycleChecks?.failed !== 0
      || manifest.sourceUserContentIncluded !== false || manifest.files?.length !== 9
      || manifest.files.filter(file => file.path.endsWith('.jpg')).some(file => file.visuallyReviewed !== true)) fail('v1.0.16 updater import drift')
    for (const file of manifest.files ?? []) {
      const evidencePath = `${root}/${file.path}`
      if (!fs.existsSync(evidencePath)) fail(`v1.0.16 updater evidence missing: ${file.path}`)
      else if (!matchesIdentity(evidencePath, file.bytes, file.sha256)) fail(`v1.0.16 updater evidence hash drift: ${file.path}`)
    }
  }
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}
console.log(`V1.0.16 managed updater lifecycle contract passed: ${completed ? 'hosted 1.0.15 -> 1.0.16 evidence accepted' : 'safe hosted execution harness is ready'}.`)
