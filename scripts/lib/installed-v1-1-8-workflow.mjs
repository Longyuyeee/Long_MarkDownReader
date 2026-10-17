import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { withDeadline } from './with-deadline.mjs'
import { assertHostedSearchAudit, createNativeSearchFixture } from './v118-native-search-fixture.mjs'
import { nativeUserInput } from './v118-native-user-input.mjs'
import { validateInstalledSearchCompleteness, searchCompletenessChecks } from './installed-v1-1-8-evidence.mjs'

export async function runInstalledV118Workflow({ send, evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion, installedExecutable, repoRoot }) {
  assertHostedSearchAudit()
  assert.equal(process.env.LONGEDIT_R5I_DISPOSABLE, '1'); assert.equal(appVersion, '1.1.8')
  assert.equal(path.resolve(library).toLowerCase(), 'c:\\longeditr5ilibrary')
  assert.equal(installedExecutable, path.resolve(process.env.LONGEDIT_R5J_EXECUTABLE))
  const harnessSourceCommit = process.env.GITHUB_SHA
  assert.match(harnessSourceCommit || '', /^[a-f0-9]{40}$/)
  const report = { appVersion, sourceCommit, installerSha256, harnessSourceCommit,
    executableSha256: crypto.createHash('sha256').update(await fs.readFile(installedExecutable)).digest('hex'),
    evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, desktopInputUsed: false, status: 'running', checks: [] }
  const ui = nativeUserInput({ send, evaluate }, { timeoutMs: 60000 })
  const store = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
  const invoke = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`)
  const root = path.join(os.tmpdir(), 'longedit-v118-native-installed-' + crypto.randomUUID())
  let originalConfig, failure
  const reloadConfig = async hash => {
    await evaluate(`location.hash=${JSON.stringify(hash)}`)
    const origin = await evaluate('performance.timeOrigin')
    await send('Page.reload')
    // The old context can disappear between CDP requests during a normal reload.
    for (let n = 0; n < 600; n++) {
      try { if (await evaluate(`performance.timeOrigin!==${origin}&&document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('app')?.configReady===true&&!document.querySelector('#app-startup-screen')`)) return }
      catch (error) { if (!/context|navigat/i.test(String(error))) throw error }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw Error('Installed configuration did not reload')
  }
  const run = async (script, phase) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', script), phase, root, repoRoot, output], {
      cwd: repoRoot, windowsHide: true, stdio: 'inherit', env: { ...process.env,
        LONGEDIT_SEARCH_INSTALLED: '1', LONGEDIT_NATIVE_EXECUTABLE: installedExecutable,
        LONGEDIT_R5J_APP_VERSION: appVersion, LONGEDIT_R5J_SOURCE_COMMIT: sourceCommit, LONGEDIT_R5J_INSTALLER_SHA256: installerSha256 },
    })
    try {
      await withDeadline(() => new Promise((resolve, reject) => {
        child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? resolve() : reject(Error(`${phase} installed search driver failed: ${code}/${signal}`)))
      }), 600000, 'installed search ' + phase)
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill() }
  }
  try {
    // All content here belongs to the generated disposable lifecycle library.
    // Finish preceding edits by the real Save control, never clear dirty flags.
    await navigate('#/library', '.library-mode', 'v118 predecessor draft checkpoint')
    for (let n = 0; n < 64; n++) {
      const label = await evaluate(`document.querySelector('.workspace-tab[aria-label*="有未保存的修改"]')?.getAttribute('aria-label')`)
      if (!label) break
      await ui.clickTarget(`[...document.querySelectorAll('.workspace-tab')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)})`)
      await ui.waitFor(`document.querySelector('.workspace-tab.active')?.getAttribute('aria-label')===${JSON.stringify(label)}`, 'predecessor dirty tab selected')
      await ui.clickText('button', '保存')
      await ui.waitFor(`!document.querySelector('.workspace-tab.active[aria-label*="有未保存的修改"]')`, 'predecessor draft explicitly saved')
    }
    assert.equal(await evaluate(`${store}.tabs.filter(t=>t.isDirty).length`), 0)
    originalConfig = await invoke('get_config')
    const fixture = await createNativeSearchFixture(root, repoRoot, { unregisteredEntries: 21050 })
    const config = JSON.parse(await fs.readFile(path.join(fixture.config, 'config.json'), 'utf8'))
    await invoke('save_config', { config })
    await reloadConfig('#/settings')
    await waitFor(`!!document.querySelector('.settings-view')&&${store}.activeLibraryPath===${JSON.stringify(fixture.library)}`, 'isolated installed search libraries')
    await run('capture-v118-native-search.mjs', 'baseline')
    await run('capture-v118-native-user.mjs', 'user')
    const read = async file => JSON.parse(await fs.readFile(path.join(output, file), 'utf8'))
    const baseline = await read('installed-v118-baseline.json'), user = await read('installed-v118-user.json'), office = await read('installed-v118-office.json')
    report.checks = searchCompletenessChecks.map(id => ({ id, status: 'passed' })); report.status = 'passed'
    validateInstalledSearchCompleteness(report, baseline, user, office, { appVersion, sourceCommit, artifacts: [{ target: 'nsis', sha256: installerSha256 }] })
    // Search must preserve this draft through all checks. Only now explicitly save.
    await ui.clickText('.app-navigation a', '资料库')
    await ui.clickTarget(`[...document.querySelectorAll('.workspace-tab')].find(e=>e.getAttribute('aria-label')?.includes('zz-项目预算'))`)
    await ui.clickText('button', '保存')
    await ui.waitFor(`!document.querySelector('.workspace-tab.active[aria-label*="有未保存的修改"]')`, 'v118 own draft explicitly saved after preservation proof')
    assert.match(await fs.readFile(path.join(fixture.library, 'zz-项目预算.md'), 'utf8'), /我正在写正式预算/)
    report.finalDraftAction = 'explicit-user-save-after-all-preservation-checks'
  } catch (error) { failure = error; report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; await capture('installed-v118-failure.jpg').catch(() => {}) }
  finally {
    if (originalConfig) {
      try { await invoke('save_config', { config: originalConfig }); if (!failure) await reloadConfig('#/library') }
      catch (error) { failure ||= error; report.status = 'failed'; report.cleanupError = String(error) }
    }
    await fs.writeFile(path.join(output, 'installed-v118-workflow.json'), JSON.stringify(report, null, 2) + '\n')
  }
  if (failure) throw failure
}
