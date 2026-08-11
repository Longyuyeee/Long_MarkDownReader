import crypto from 'node:crypto'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const failures = []
const fail = message => failures.push(message)
const requireTokens = (source, tokens, area) => tokens.forEach(token => {
  if (!source.includes(token)) fail(`${area} missing: ${token}`)
})

const policy = json('shared/v108-managed-updater-lifecycle-policy.json')
const previousReceipt = json('docs/evidence/v1.0.7-release/release-receipt.json')
const currentReceipt = json('docs/evidence/v1.0.8-release/release-receipt.json')
const currentManifest = json('docs/evidence/v1.0.8-release/artifact-manifest.json')
const workflow = read('.github/workflows/v108-managed-updater-lifecycle.yml')
const runner = read('scripts/run-v108-managed-updater-lifecycle.ps1')
const probe = read('scripts/capture-v108-managed-updater-lifecycle.mjs')
const audit = read('docs/V1_0_8_Managed_Updater_Lifecycle_Audit_2026-08-11.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'V1.0.8-U1'
  || !['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) fail('v1.0.8 updater policy identity drift')
const previousAsset = previousReceipt.assets.find(item => item.name.endsWith('-setup.exe'))
const currentAsset = currentReceipt.assets.find(item => item.name.endsWith('-setup.exe'))
if (policy.releases?.previous?.version !== '1.0.7'
  || policy.releases?.previous?.tag !== previousReceipt.release?.tag
  || policy.releases?.previous?.installer?.fileName !== previousAsset?.name
  || policy.releases?.previous?.installer?.sizeBytes !== previousAsset?.sizeBytes
  || policy.releases?.previous?.installer?.sha256 !== previousAsset?.sha256) fail('previous official release drift')
if (policy.releases?.current?.version !== '1.0.8'
  || policy.releases?.current?.tag !== currentReceipt.release?.tag
  || policy.releases?.current?.url !== currentReceipt.release?.url
  || policy.releases?.current?.taggedCommit !== currentReceipt.release?.taggedCommit
  || policy.releases?.current?.installer?.fileName !== currentAsset?.name
  || policy.releases?.current?.installer?.sizeBytes !== currentAsset?.sizeBytes
  || policy.releases?.current?.installer?.sha256 !== currentAsset?.sha256
  || policy.releases?.current?.standaloneReleaseExecutableReferenceSha256 !== currentManifest.artifacts.find(item => item.target === 'release-executable')?.sha256) fail('current official release drift')
if (Object.values(policy.requirements ?? {}).some(value => value !== true && value !== false)
  || policy.requirements?.sourceUserContentIncluded !== false
  || Object.entries(policy.requirements ?? {}).some(([key, value]) => key !== 'sourceUserContentIncluded' && value !== true)) fail('updater requirement boundary drift')

requireTokens(workflow, [
  'workflow_dispatch:',
  'runs-on: windows-latest',
  'LONGEDIT_MANAGED_UPDATER_DISPOSABLE: "1"',
  'shared\\v108-managed-updater-lifecycle-policy.json',
  'gh release download $env:PREVIOUS_TAG',
  'gh release download $env:CURRENT_TAG',
  'releases/latest',
  'run-v108-managed-updater-lifecycle.ps1',
  'capture-v108-managed-updater-lifecycle.mjs',
  'v108-managed-updater-lifecycle-${{ github.run_id }}',
], 'v1.0.8 updater workflow')
if (workflow.includes('npm run tauri -- build') || workflow.includes('src-tauri/target')) fail('updater workflow must use published assets')
requireTokens(runner, [
  '-ConfirmDisposableMachine',
  '-AllowInstallerMutation',
  'Updater downloaded an installer before explicit user confirmation',
  'downloaded-installer-sha256',
  'silent-overwrite-install',
  'installed-version-and-binary-recorded',
  'overwrite-retains-user-data',
  'automatic-relaunch-after-managed-update',
  'Wait-ForInstalledProcess -ExecutablePath $mainBinary',
  'post-upgrade-reports-current',
  'uninstall-retains-user-data',
], 'v1.0.8 updater runner')
requireTokens(probe, [
  "invokeTauri('check_community_update')",
  "document.querySelector('.update-modal')",
  "textContent?.includes('下载并安装')",
  'installerStartedBeforeConfirmation: false',
  'managed-updater-available.jpg',
  'managed-updater-current.jpg',
], 'v1.0.8 updater probe')
for (const token of ['v1.0.7', 'v1.0.8', '用户确认', 'SHA-256', '自动重启', '资料保留', '托管 Windows']) {
  if (!audit.includes(token)) fail(`v1.0.8 updater audit missing: ${token}`)
}

const completed = policy.status === 'hosted-managed-update-passed'
if (!completed) {
  if (policy.gates?.harnessImplemented !== true
    || Object.entries(policy.gates ?? {}).some(([key, value]) => key !== 'harnessImplemented' && value !== false)
    || policy.githubRun !== null
    || policy.nextAction !== 'push-harness-pass-quality-gate-and-run-hosted-managed-updater-lifecycle') fail('pending updater state drift')
} else {
  if (Object.values(policy.gates ?? {}).some(value => value !== true)
    || !Number.isInteger(policy.githubRun?.id)
    || policy.githubRun?.conclusion !== 'success'
    || !/^[0-9a-f]{40}$/.test(policy.githubRun?.headCommit ?? '')
    || policy.nextAction !== 'v1.0.8-release-closure-complete') fail('completed updater state drift')
  const root = policy.evidenceRoot
  const importPath = `${root}/import-manifest.json`
  if (!fs.existsSync(importPath)) fail('v1.0.8 updater evidence is missing')
  else {
    const manifest = json(importPath)
    if (manifest.stage !== 'V1.0.8-U1I'
      || manifest.status !== 'accepted'
      || manifest.githubRunId !== policy.githubRun.id
      || manifest.headCommit !== policy.githubRun.headCommit
      || manifest.previousVersion !== '1.0.7'
      || manifest.currentVersion !== '1.0.8'
      || manifest.officialInstallerSha256 !== policy.releases.current.installer.sha256
      || manifest.installedExecutableSha256 !== policy.releases.current.installedPackageExecutable?.sha256
      || manifest.lifecycleChecks?.passed !== 12
      || manifest.lifecycleChecks?.failed !== 0
      || manifest.sourceUserContentIncluded !== false
      || manifest.files?.length !== 9
      || manifest.files.filter(file => file.path.endsWith('.jpg')).some(file => file.visuallyReviewed !== true)) fail('v1.0.8 updater import drift')
    for (const file of manifest.files ?? []) {
      const evidencePath = `${root}/${file.path}`
      if (!fs.existsSync(evidencePath)) fail(`v1.0.8 updater evidence missing: ${file.path}`)
      else if (fs.statSync(evidencePath).size !== file.bytes || sha256(evidencePath) !== file.sha256) fail(`v1.0.8 updater evidence hash drift: ${file.path}`)
    }
    const lifecyclePath = `${root}/managed-updater-lifecycle-result.json`
    if (fs.existsSync(lifecyclePath)) {
      const lifecycle = json(lifecyclePath)
      if (lifecycle.status !== 'passed'
        || lifecycle.previousVersion !== '1.0.7'
        || lifecycle.currentVersion !== '1.0.8'
        || lifecycle.currentInstallerSha256 !== policy.releases.current.installer.sha256
        || lifecycle.installedExecutableSha256 !== policy.releases.current.installedPackageExecutable?.sha256
        || lifecycle.checksPassed !== 12
        || lifecycle.checksFailed !== 0
        || lifecycle.explicitUserConfirmation !== true
        || lifecycle.automaticRelaunchAfterInstall !== true
        || lifecycle.userDataRetainedAfterOverwrite !== true
        || lifecycle.userDataRetainedAfterUninstall !== true
        || lifecycle.sourceUserContentIncluded !== false) fail('v1.0.8 updater lifecycle drift')
    }
  }
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}
console.log(`V1.0.8 managed updater lifecycle passed: ${completed ? 'hosted 1.0.7 -> 1.0.8 evidence accepted' : 'safe hosted execution harness is ready'}.`)
