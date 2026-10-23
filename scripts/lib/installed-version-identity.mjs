import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

// Read-only observation: never disable animations or change product styles for acceptance.
export function visibleVersionSurfaceExpression(selector, allowInfiniteAnimations = false) {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.99) return false;
      if (ancestor.getAnimations().some(animation => (animation.playState === 'running' || animation.playState === 'pending') && !(${allowInfiniteAnimations} && animation.effect?.getTiming().iterations === Infinity))) return false;
    }
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })()`
}

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
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || !['1.0.23', '1.0.24', '1.0.25', '1.0.26', '1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13'].includes(appVersion)) throw new Error('Version scenario requires a supported disposable installer')
  const observations = {}
  const report = { sourceCommit, installerSha256, appVersion, evidenceLevel: 'installed-webview-input-events', sourceUserContentIncluded: false, status: 'running', observations, checks: [] }
  const waitForVisibleSettings = async () => {
    const expression = visibleVersionSurfaceExpression('[data-testid="app-update-settings"]');
    await waitFor(expression, 'fully visible update settings after entry animation', 100);
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await evaluate(expression), true, 'Update settings must remain visibly rendered');
  }
  const click = async expression => {
    const point = `(() => { const e=${expression}; if(!e||e.disabled)return null; const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:null })()`
    await waitFor(point, 'visible version control')
    const coordinates = await evaluate(point)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...coordinates, button: 'left', clickCount: 1 })
  }
  try {
    observations.nativeVersion = await evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:app|version')`)
    await navigate('#/library', '.library-mode', 'installed version sidebar')
    await waitFor(`document.querySelector('[data-testid="main-app-version"]')?.textContent.trim() === 'v${appVersion}'`, 'native version on sidebar')
    observations.badge = await evaluate(`document.querySelector('[data-testid="main-app-version"]').textContent`)
    observations.badgeLabel = await evaluate(`document.querySelector('[data-testid="main-app-version"]').getAttribute('aria-label')`)
    await waitFor(`!document.querySelector('.n-message')`, 'transient feedback completion before version screenshot')
    await capture('installed-version-library.jpg')
    await click(`document.querySelector('[data-testid="main-app-version"]')`)
    await waitFor(`document.querySelector('[data-testid="app-update-settings"]') !== null`, 'version badge opens update settings')
    observations.settingsRoute = await evaluate('location.hash')
    await waitForVisibleSettings()
    observations.settings = await evaluate(`document.querySelector('[data-testid="app-update-settings"]').innerText`)
    await click(`[...document.querySelectorAll('[data-testid="app-update-settings"] button')].find(e=>e.textContent.includes('检查更新'))`)
    // The previous successful status remains visible while a new check runs.
    // Wait for the clicked request to settle, not just that stale status text.
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await waitFor(`(() => { const panel=document.querySelector('[data-testid="app-update-settings"]'); const button=[...panel.querySelectorAll('button')].find(e=>e.textContent.includes('检查更新')); return button && !button.disabled && !button.querySelector('.n-base-loading') && document.querySelector('.update-status')?.textContent.includes('当前已是最新版本'); })()`, 'completed real official update check with enabled control', 1200)
    observations.checkedSettings = await evaluate(`document.querySelector('[data-testid="app-update-settings"]').innerText`)
    await waitForVisibleSettings()
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
    // Preserve the actual failed request state; a timeout alone does not prove
    // whether the product, native network, or input observation failed.
    observations.failureSurface = await evaluate(`(() => { const panel=document.querySelector('[data-testid="app-update-settings"]');return {route:location.hash,settings:panel?.innerText||'',status:document.querySelector('.update-status')?.outerHTML||'',buttons:panel?Array.from(panel.querySelectorAll('button'),button=>({text:button.textContent,disabled:button.disabled,loading:!!button.querySelector('.n-base-loading')})):[]}; })()`).catch(() => null)
    await capture('installed-version-failure.jpg').catch(() => {})
    throw error
  } finally {
    await fs.writeFile(path.join(output, 'installed-version-identity.json'), JSON.stringify(report, null, 2)+'\n')
  }
}
