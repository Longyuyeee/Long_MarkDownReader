import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const policy = JSON.parse(read('shared/community-updater-policy.json'))
const backend = read('src-tauri/src/commands/updater.rs')
const service = read('src/services/appUpdater.ts')
const modal = read('src/components/AppUpdater.vue')
const settings = read('src/components/UpdateSettingsRow.vue')
const app = read('src/App.vue')
const handler = read('src-tauri/src/lib.rs')
const failures = []
const requireTokens = (source, tokens, area) => tokens.forEach(token => {
  if (!source.includes(token)) failures.push(`${area} missing: ${token}`)
})

if (policy.status !== 'active-from-v1.0.5'
  || policy.automaticCheckIntervalHours !== 24
  || policy.userConfirmationRequired !== true
  || policy.integrity?.algorithm !== 'sha256'
  || policy.integrity?.missingDigestAction !== 'reject'
  || policy.migration?.v1_0_4CanSelfUpgrade === true
  || policy.migration?.firstManagedUpdaterVersion !== '1.0.5'
  || policy.migration?.firstManagedUpdaterBuildRequiresManualInstallation !== true) {
  failures.push('community updater policy drift')
}

requireTokens(backend, [
  'api.github.com/repos/Longyuyeee/Long_MarkDownReader/releases/latest',
  'RELEASE_DOWNLOAD_PREFIX',
  'GithubRelease',
  'draft || response.prerelease',
  'parse_sha256',
  'Sha256::digest',
  'actual != release.sha256',
  'LongEdit_{expected_version}_x64-setup.exe',
  'MAX_INSTALLER_BYTES',
  'UPDATE_RELAUNCH_SCRIPT',
  '-PassThru -Wait',
  '$install.ExitCode',
  'Start-Process -FilePath $application',
  'LONGEDIT_UPDATE_APPLICATION',
  'CREATE_NO_WINDOW',
  'CREATE_NEW_PROCESS_GROUP',
], 'backend updater')
requireTokens(handler, ['check_community_update', 'install_community_update'], 'Tauri handler')
requireTokens(service, [
  'AUTO_CHECK_INTERVAL_MS',
  'checkForUpdates',
  "invoke<CommunityUpdateInfo>('check_community_update')",
  "invoke('install_community_update'",
], 'frontend updater service')
requireTokens(modal, [
  '发现新版本',
  'SHA-256',
  '下载并安装',
  '安装完成后 Long编辑会自动重新打开',
  'checkForUpdates(false)',
  ':style="updateModalStyle"',
  "width: 'min(460px, calc(100vw - 24px))'",
  'releaseHighlights',
], 'automatic update prompt')
requireTokens(settings, ['每 24 小时自动检查', '检查更新', '下载并安装'], 'update settings')
requireTokens(app, ['<AppUpdater v-if="isMainWindow" />', "import AppUpdater from './components/AppUpdater.vue'"], 'application shell')

for (const unsafe of ['downloadUrl:', 'installerPath:', 'expectedSha256:']) {
  if (service.includes(unsafe)) failures.push(`frontend must not control updater trust input: ${unsafe}`)
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('Community updater contract passed: fixed GitHub source, SHA-256 verification, hidden install and automatic relaunch are aligned.')
