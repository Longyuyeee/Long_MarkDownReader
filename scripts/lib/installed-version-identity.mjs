import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export function validateInstalledVersionObservations(observations, appVersion) {
  assert.equal(observations.nativeVersion, appVersion)
  assert.equal(observations.badge.trim(), `v${appVersion}`)
  assert.ok(observations.badgeLabel.includes(`当前软件版本 v${appVersion}`))
  assert.match(observations.settingsRoute, /\/settings\?.*focus=software-update/)
  assert.ok(observations.settings.includes(`当前版本 v${appVersion}`))
  assert.ok(observations.checkedSettings.includes(`当前已是最新版本 v${appVersion}`))
  assert.doesNotMatch(observations.checkedSettings, /下载并安装|更新失败/)
  assert.ok(observations.capabilities.includes(`v${appVersion}`))
  assert.doesNotMatch([observations.badge, observations.badgeLabel, observations.capabilities].join('\n'), /\bdev\b|开发模式|下一目标/i)
}

export async function runInstalledVersionScenario({ send, evaluate, waitFor, navigate, capture, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || appVersion !== '1.0.23') throw new Error('Version scenario requires disposable v1.0.23 installer')
  const observations = {}
  const report = { sourceCommit, installerSha256, appVersion, evidenceLevel: 'installed-webview-input-events', sourceUserContentIncluded: false, status: 'running', observations, checks: [] }
  const click = async expression => {
    const point = `(() => { const e=${expression}; if(!e||e.disabled)return null; const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:null })()`
    await waitFor(point, 'visible version control')
    const coordinates = await evaluate(point)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...coordinates, button: 'left', clickCount: 1 })
  }
  try {
    observations.nativeVersion = await evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:app|version')`)
    await navigate('#/library', '.library-mode', 'installed version sidebar')
    await waitFor(`document.querySelector('[data-testid="main-app-version"]')?.textContent.trim() === 'v1.0.23'`, 'native version on sidebar')
    observations.badge = await evaluate(`document.querySelector('[data-testid="main-app-version"]').textContent`)
    observations.badgeLabel = await evaluate(`document.querySelector('[data-testid="main-app-version"]').getAttribute('aria-label')`)
    await capture('installed-version-library.jpg')
    await click(`document.querySelector('[data-testid="main-app-version"]')`)
    await waitFor(`document.querySelector('[data-testid="app-update-settings"]') !== null`, 'version badge opens update settings')
    observations.settingsRoute = await evaluate('location.hash')
    observations.settings = await evaluate(`document.querySelector('[data-testid="app-update-settings"]').innerText`)
    await click(`[...document.querySelectorAll('[data-testid="app-update-settings"] button')].find(e=>e.textContent.includes('检查更新'))`)
    await waitFor(`document.querySelector('.update-status')?.textContent.includes('当前已是最新版本')`, 'real official update check', 1200)
    observations.checkedSettings = await evaluate(`document.querySelector('[data-testid="app-update-settings"]').innerText`)
    await capture('installed-version-settings.jpg')
    await navigate('#/release-capabilities', '.release-capabilities', 'installed capability version')
    observations.capabilities = await evaluate(`document.querySelector('.release-capabilities').innerText`)
    await capture('installed-version-capabilities.jpg')
    validateInstalledVersionObservations(observations, appVersion)
    report.checks = ['native-version-and-sidebar', 'badge-opens-settings', 'real-update-preserves-installed-version', 'production-capability-no-dev'].map(id => ({ id, status: 'passed' }))
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.error = String(error)
    throw error
  } finally {
    await fs.writeFile(path.join(output, 'installed-version-identity.json'), JSON.stringify(report, null, 2)+'\n')
  }
}
