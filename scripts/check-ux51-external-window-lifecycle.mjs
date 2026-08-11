import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const manifest = JSON.parse(read('docs/evidence/ux51-external-window-lifecycle/manifest.json'))
const externalWindows = read('src-tauri/src/services/external_windows.rs')
const updater = read('src-tauri/src/commands/updater.rs')
const app = read('src/App.vue')
const failures = []
const requireText = (source, token, area) => {
  if (!source.includes(token)) failures.push(`${area} missing ${token}`)
}

if (manifest.stage !== 'UX-51' || manifest.status !== 'debug-tauri-multi-window-passed') failures.push('manifest identity drift')
if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit)) failures.push('source commit is invalid')
else {
  let sourceCommitAvailable = true
  try { execFileSync('git', ['cat-file', '-e', `${manifest.sourceCommit}^{commit}`], { stdio: 'ignore' }) }
  catch { sourceCommitAvailable = false }
  if (sourceCommitAvailable) {
    try { execFileSync('git', ['merge-base', '--is-ancestor', manifest.sourceCommit, 'HEAD'], { stdio: 'ignore' }) }
    catch { failures.push('evidence source commit is not an ancestor of HEAD') }
  }
}
for (const [key, expected] of Object.entries({
  mainWindowPreserved: true,
  secondaryProcessHandoff: true,
  independentTextWindow: true,
  independentJsonWindow: true,
  externalTabsHidden: true,
  updaterLimitedToMainWindow: true,
  runtimeErrorCount: 0,
})) if (manifest.checks?.[key] !== expected) failures.push(`runtime check failed: ${key}`)
if (manifest.checks?.simultaneousWindowCount < 3) failures.push('multi-window evidence is incomplete')
if (manifest.sourceUserContentIncluded !== false || manifest.releaseCandidate !== false) failures.push('evidence privacy or promotion boundary drift')

for (const file of ['main-window-preserved.png', 'external-text-window.png', 'external-json-window.png']) {
  const location = `docs/evidence/ux51-external-window-lifecycle/${file}`
  if (!fs.existsSync(location) || fs.statSync(location).size < 10_000) failures.push(`visual evidence missing: ${file}`)
}
for (const token of ['WebviewWindowBuilder::new', 'external-{}-{sequence}', 'external=1', 'authorize_openable']) requireText(externalWindows, token, 'external window service')
for (const token of ['-PassThru -Wait', '$install.ExitCode', 'Start-Process -FilePath $application', 'CREATE_NEW_PROCESS_GROUP']) requireText(updater, token, 'updater relaunch')
for (const token of ["appWindow.label === 'main'", 'data-window-role', '<AppUpdater v-if="isMainWindow" />']) requireText(app, token, 'window shell')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('UX-51 lifecycle passed: updater relaunch and independent external windows are implementation- and desktop-verified.')
