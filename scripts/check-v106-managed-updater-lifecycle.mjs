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

const policy = json('shared/v1-managed-updater-lifecycle-policy.json')
const releasePolicy = json('shared/v1-community-release-policy.json')
const releaseReceipt = json('docs/evidence/v1.0.6-release/release-receipt.json')
const artifactManifest = json('docs/evidence/v1.0.6-release/artifact-manifest.json')
const previousManifest = json('docs/evidence/v1.0.5-release/artifact-manifest.json')
const workflow = read('.github/workflows/v106-managed-updater-lifecycle.yml')
const runner = read('scripts/run-v106-managed-updater-lifecycle.ps1')
const probe = read('scripts/capture-v106-managed-updater-lifecycle.mjs')
const audit = read('docs/V1_0_6_Managed_Updater_Lifecycle_Audit_2026-08-10.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'V1.0.6-U1' || !['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) fail('managed updater policy identity drift')
if (policy.releases?.previous?.version !== '1.0.5'
  || policy.releases?.previous?.tag !== 'v1.0.5'
  || policy.releases?.previous?.installer?.fileName !== 'LongEdit_1.0.5_x64-setup.exe'
  || policy.releases?.previous?.installer?.sizeBytes !== previousManifest.artifacts.find(item => item.target === 'nsis')?.sizeBytes
  || policy.releases?.previous?.installer?.sha256 !== previousManifest.artifacts.find(item => item.target === 'nsis')?.sha256) fail('managed updater previous release drift')
if (policy.releases?.current?.version !== releasePolicy.appVersion
  || policy.releases?.current?.tag !== releaseReceipt.release?.tag
  || policy.releases?.current?.url !== releaseReceipt.release?.url
  || policy.releases?.current?.taggedCommit !== releaseReceipt.release?.taggedCommit
  || policy.releases?.current?.installer?.fileName !== releaseReceipt.assets.find(item => item.name.endsWith('-setup.exe'))?.name
  || policy.releases?.current?.installer?.sizeBytes !== releaseReceipt.assets.find(item => item.name.endsWith('-setup.exe'))?.sizeBytes
  || policy.releases?.current?.installer?.sha256 !== releaseReceipt.assets.find(item => item.name.endsWith('-setup.exe'))?.sha256
  || policy.releases?.current?.standaloneReleaseExecutableReferenceSha256 !== artifactManifest.artifacts.find(item => item.target === 'release-executable')?.sha256) fail('managed updater current release drift')
if (policy.requirements?.officialLatestRelease !== true
  || policy.requirements?.explicitUserConfirmation !== true
  || policy.requirements?.sha256BeforeInstall !== true
  || policy.requirements?.silentOverwrite !== true
  || policy.requirements?.sameInstallRoot !== true
  || policy.requirements?.installedExecutableIdentityRecorded !== true
  || policy.requirements?.firstLaunchAfterUpdate !== true
  || policy.requirements?.postUpgradeReportsCurrent !== true
  || policy.requirements?.libraryDataRetained !== true
  || policy.requirements?.configDataRetained !== true
  || policy.requirements?.uninstallRetainsUserData !== true
  || policy.requirements?.sourceUserContentIncluded !== false) fail('managed updater requirement boundary drift')

requireTokens(workflow, [
  'workflow_dispatch:',
  'runs-on: windows-latest',
  'LONGEDIT_MANAGED_UPDATER_DISPOSABLE: "1"',
  'gh release download $env:PREVIOUS_TAG',
  'gh release download $env:CURRENT_TAG',
  'releases/latest',
  'current.target_commitish -ne $env:CURRENT_TAGGED_COMMIT',
  'run-v106-managed-updater-lifecycle.ps1',
  'v106-managed-updater-lifecycle-${{ github.run_id }}',
  'path: managed-updater-output',
], 'managed updater workflow')
if (workflow.includes('npm run tauri -- build') || workflow.includes('src-tauri/target')) fail('managed updater workflow must exercise published assets rather than rebuild source')

requireTokens(runner, [
  '-ConfirmDisposableMachine',
  '-AllowInstallerMutation',
  'LONGEDIT_MANAGED_UPDATER_DISPOSABLE',
  'ExpectedPreviousInstallerSha256',
  'ExpectedCurrentInstallerSha256',
  'ReleaseExecutableReferenceSha256',
  'Updater downloaded an installer before explicit user confirmation',
  'managed-updater-discovery-evidence.json',
  'downloaded-installer-sha256',
  'silent-overwrite-install',
  'managed-updater-installed-binary.json',
  'installed-version-and-binary-recorded',
  'trustAnchor = "verified-official-nsis-installer"',
  'overwrite-retains-user-data',
  'first-launch-after-managed-update',
  'post-upgrade-reports-current',
  'uninstall-retains-user-data',
  'sourceUserContentIncluded = $false',
], 'managed updater lifecycle runner')
requireTokens(probe, [
  "invokeTauri('check_community_update')",
  "document.querySelector('.update-modal')",
  "textContent?.includes('下载并安装')",
  'installerStartedBeforeConfirmation: false',
  "location.hash = '#/settings'",
  '当前已是最新版本',
  'managed-updater-available.jpg',
  'managed-updater-current.jpg',
  'sourceUserContentIncluded: false',
], 'managed updater installed probe')
for (const token of ['v1.0.5', 'v1.0.6', '用户确认', 'SHA-256', '资料保留', '托管 Windows']) {
  if (!audit.includes(token)) fail(`managed updater audit missing: ${token}`)
}

const completed = policy.status === 'hosted-managed-update-passed'
if (!completed) {
  if (policy.gates?.harnessImplemented !== true
    || Object.entries(policy.gates ?? {}).some(([key, value]) => key !== 'harnessImplemented' && value !== false)
    || policy.githubRun !== null
    || policy.nextAction !== 'push-harness-pass-quality-gate-and-run-hosted-managed-updater-lifecycle') fail('managed updater pending state drift')
} else {
  if (Object.values(policy.gates ?? {}).some(value => value !== true)
    || !Number.isInteger(policy.githubRun?.id)
    || policy.githubRun?.conclusion !== 'success'
    || !/^[0-9a-f]{40}$/.test(policy.githubRun?.headCommit ?? '')
    || policy.nextAction !== 'monitor-community-updater-and-resume-bounded-format-capability-development') fail('managed updater completed state drift')

  const root = policy.evidenceRoot
  const importPath = `${root}/import-manifest.json`
  if (!fs.existsSync(importPath)) fail('managed updater imported evidence is missing')
  else {
    const manifest = json(importPath)
    if (manifest.stage !== 'V1.0.6-U1I'
      || manifest.status !== 'accepted'
      || manifest.githubRunId !== policy.githubRun.id
      || manifest.previousVersion !== policy.releases.previous.version
      || manifest.currentVersion !== policy.releases.current.version
      || manifest.sourceUserContentIncluded !== false
      || manifest.files?.length < 6) fail('managed updater import manifest drift')
    for (const file of manifest.files ?? []) {
      const evidencePath = `${root}/${file.path}`
      if (!fs.existsSync(evidencePath)) fail(`managed updater evidence missing: ${file.path}`)
      else if (fs.statSync(evidencePath).size !== file.bytes || sha256(evidencePath) !== file.sha256) fail(`managed updater evidence hash drift: ${file.path}`)
    }
    const lifecyclePath = `${root}/managed-updater-lifecycle-result.json`
    if (fs.existsSync(lifecyclePath)) {
      const lifecycle = json(lifecyclePath)
      if (lifecycle.status !== 'passed'
        || lifecycle.previousVersion !== '1.0.5'
        || lifecycle.currentVersion !== '1.0.6'
        || lifecycle.currentInstallerSha256 !== policy.releases.current.installer.sha256
        || !/^[0-9a-f]{64}$/.test(lifecycle.installedExecutableSha256 ?? '')
        || lifecycle.installedExecutableAuthenticodeStatus !== 'NotSigned'
        || lifecycle.standaloneReleaseExecutableReferenceSha256 !== policy.releases.current.standaloneReleaseExecutableReferenceSha256
        || typeof lifecycle.matchesStandaloneReleaseExecutableReference !== 'boolean'
        || lifecycle.checksPassed < 10
        || lifecycle.checksFailed !== 0
        || lifecycle.explicitUserConfirmation !== true
        || lifecycle.userDataRetainedAfterOverwrite !== true
        || lifecycle.userDataRetainedAfterUninstall !== true
        || lifecycle.sourceUserContentIncluded !== false) fail('managed updater lifecycle result drift')
    }
  }
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}
console.log(`V1.0.6 managed updater lifecycle contract passed: ${completed ? 'hosted 1.0.5 -> 1.0.6 evidence accepted' : 'safe hosted execution harness is ready'}.`)
