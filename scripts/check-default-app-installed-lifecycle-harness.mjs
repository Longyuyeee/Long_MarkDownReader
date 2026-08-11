import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const smoke = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const exporter = read('scripts/export-r5k-windows-evidence-bundle.ps1')
const view = read('src/views/ReleaseCapabilitiesView.vue')
const app = read('src/App.vue')
const rustApp = read('src-tauri/src/lib.rs')
const externalWindows = read('src-tauri/src/services/external_windows.rs')
const workflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const failures = []

const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

for (const token of [
  'LONGEDIT_EA5B_COLD_FILE',
  'LONGEDIT_EA5B_SECONDARY_FILE',
  "spawn(installedExecutable, [secondaryLaunchFile]",
  'installed-external-cold-launch-unicode-space-path',
  'installed-single-instance-external-handoff',
  "const windowsDevicePrefix = '\\\\\\\\?\\\\'",
  'const normalizeWindowsPath = value =>',
  'EA5B_SECONDARY_INSTANCE_UNICODE_PATH',
  'single-instance external TXT route with Chinese and spaces',
  'single-instance external TXT content marker',
  'normalizeWindowsPath(routedSecondaryPath) !== normalizeWindowsPath(secondaryLaunchFile)',
  "waitForCdpTarget(item => item.url.includes('/mindmap?'))",
  "waitForCdpTarget(item => item.id !== coldTarget.id && item.url.includes('/text?')",
  "document.querySelector('.app-container')?.dataset.windowRole === 'main'",
  "for (const formatId of ['opml', 'raster-image'])",
  'installed-user-triggered-default-app-candidates',
  'installed-default-app-candidates.jpg',
]) requireText(smoke, token, `installed WebView probe is missing ${token}`)

if (smoke.includes("location.hash.split('?')")) {
  failures.push('installed WebView probe must preserve raw question marks inside Windows device paths')
}

for (const token of [
  "appWindow.label === 'main'",
  'data-window-role',
  "invoke<string>('open_external_file_window'",
  '<AppUpdater v-if="isMainWindow" />',
]) requireText(app, token, `independent external window shell is missing ${token}`)

for (const token of [
  'open_external_arguments',
  'authorize_and_create_external_window',
  'focus_main_window',
  'LONGEDIT_E2E_SINGLE_INSTANCE',
  'let builder = tauri::Builder::default();',
]) requireText(rustApp, token, `single-instance external window routing is missing ${token}`)

if (rustApp.indexOf('plugin(tauri_plugin_single_instance::init') > rustApp.indexOf('.manage(ExternalFileAccess::default())')) {
  failures.push('single-instance plugin must be registered before managed state and all other plugins')
}

for (const token of [
  'WebviewWindowBuilder::new',
  'external-{}-{sequence}',
  'external=1',
  'authorize_openable',
]) requireText(externalWindows, token, `dedicated external window service is missing ${token}`)

for (const token of [
  '$unicodeMarker = -join @([char]0x4E2D, [char]0x6587)',
  'C:\\LongEdit EA5B $unicodeMarker',
  'cold launch $unicodeMarker mindmap.opml',
  'secondary $unicodeMarker notes.txt',
  'Get-UserChoiceProgId',
  'Get-RegisteredApplication',
  'LongEdit.ExternalFile',
  '(Get-OpenWithProgIds ".json") -contains "LongEdit.ExternalFile"',
  'default-app-candidate-registration',
  'external-cold-launch-unicode-space-path',
  'single-instance-secondary-file-handoff',
  'default-app-candidate-uninstall-recovery',
  'windowsDefaultSelectionChanged = $false',
  'longEditRegistrationsRemovedAfterUninstall = $true',
  'installed-default-app-lifecycle-evidence.json',
]) requireText(lifecycle, token, `disposable lifecycle is missing ${token}`)

if (/[^\x00-\x7f]/.test(lifecycle)) {
  failures.push('Windows PowerShell 5.1 lifecycle source must stay ASCII and construct Unicode fixtures at runtime')
}

for (const token of [
  ':data-format-id="row.format.id"',
  ':data-testid="`default-app-candidate-${row.format.id}`"',
  ':data-prepared="candidatePrepared(row.format.id)"',
]) requireText(view, token, `format capability installed-test anchor is missing ${token}`)

for (const token of [
  'installed-default-app-lifecycle-evidence.json',
  'installed-default-app-candidates.jpg',
]) requireText(exporter, token, `Windows evidence exporter is missing ${token}`)

for (const token of [
  'LONGEDIT_R5I_DISPOSABLE: "1"',
  '-ConfirmDisposableMachine',
  '-AllowInstallerMutation',
  '-ExpectedSourceCommit $env:PRODUCT_SOURCE_COMMIT',
]) requireText(workflow, token, `hosted disposable workflow is missing ${token}`)

if (lifecycle.includes('UserChoice" "') || lifecycle.includes('SetValue("ProgId"')) {
  failures.push('installed lifecycle must observe Windows UserChoice without mutating it')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-5B2A installed lifecycle harness passed: user-triggered candidates, independent Unicode launch windows, Windows ownership, uninstall recovery, and disposable evidence export are locked.')
