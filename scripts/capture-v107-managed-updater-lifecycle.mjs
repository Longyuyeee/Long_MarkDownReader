import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9343'
const mode = process.env.LONGEDIT_MANAGED_UPDATER_MODE
const output = process.env.LONGEDIT_MANAGED_UPDATER_OUTPUT
const previousVersion = process.env.LONGEDIT_MANAGED_UPDATER_PREVIOUS_VERSION
const currentVersion = process.env.LONGEDIT_MANAGED_UPDATER_CURRENT_VERSION
const expectedInstallerName = process.env.LONGEDIT_MANAGED_UPDATER_INSTALLER_NAME
const expectedInstallerSize = Number(process.env.LONGEDIT_MANAGED_UPDATER_INSTALLER_SIZE)
const expectedInstallerSha256 = process.env.LONGEDIT_MANAGED_UPDATER_INSTALLER_SHA256
const expectedReleaseUrl = process.env.LONGEDIT_MANAGED_UPDATER_RELEASE_URL

for (const [name, value] of Object.entries({
  mode,
  output,
  previousVersion,
  currentVersion,
  expectedInstallerName,
  expectedInstallerSha256,
  expectedReleaseUrl,
})) {
  if (!value) throw new Error(`Missing managed updater environment value: ${name}`)
}
if (!Number.isSafeInteger(expectedInstallerSize) || expectedInstallerSize <= 0) {
  throw new Error('Managed updater installer size is invalid')
}
if (!['discover-install', 'post-upgrade'].includes(mode)) {
  throw new Error(`Unsupported managed updater probe mode: ${mode}`)
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const waitForCdpTarget = async (attempts = 240) => {
  let lastError = ''
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const targets = await fetch(`${endpoint}/json`).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) return target
      lastError = 'no page target advertised'
    } catch (error) {
      lastError = String(error)
    }
    await delay(250)
  }
  throw new Error(`Managed updater CDP target was not found: ${lastError}`)
}

const target = await waitForCdpTarget()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) request.reject(new Error(`${message.error.message} (${message.error.code})`))
  else request.resolve(message.result)
})
socket.addEventListener('close', () => {
  for (const request of pending.values()) request.reject(new Error('Managed updater WebView closed'))
  pending.clear()
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const invokeTauri = (command, args = {}) => evaluate(
  `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`,
)
const waitFor = async (expression, description, attempts = 600) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async fileName => {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 88,
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(output, fileName), Buffer.from(screenshot.data, 'base64'))
}
const writeEvidence = async (fileName, value) => {
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
const assertRelease = (info, expectedAvailable, expectedCurrentVersion) => {
  const expected = {
    available: expectedAvailable,
    currentVersion: expectedCurrentVersion,
    latestVersion: currentVersion,
    releaseUrl: expectedReleaseUrl,
    installerName: expectedInstallerName,
    installerSize: expectedInstallerSize,
    installerSha256: expectedInstallerSha256,
  }
  for (const [key, value] of Object.entries(expected)) {
    if (info?.[key] !== value) {
      throw new Error(`Managed updater release mismatch for ${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(info?.[key])}`)
    }
  }
}

await send('Page.enable')
await waitFor('Boolean(window.__TAURI_INTERNALS__?.invoke)', 'Tauri invoke bridge')

if (mode === 'discover-install') {
  const info = await invokeTauri('check_community_update')
  assertRelease(info, true, previousVersion)
  await waitFor(
    `(() => {
      const modal = document.querySelector('.update-modal')
      const text = modal?.textContent || ''
      return Boolean(modal && text.includes('发现新版本') && text.includes('v${previousVersion}')
        && text.includes('v${currentVersion}') && text.includes('SHA-256') && text.includes('覆盖安装'))
    })()`,
    'visible managed updater confirmation modal',
    1200,
  )
  const surface = await evaluate(`(() => {
    const modal = document.querySelector('.update-modal')
    const button = [...(modal?.querySelectorAll('button') || [])].find(item => item.textContent?.includes('下载并安装'))
    if (!modal || !button) return null
    const modalRect = modal.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    return {
      title: modal.querySelector('.n-card-header__main')?.textContent?.trim() || '',
      text: modal.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1600) || '',
      modalVisible: modalRect.width > 0 && modalRect.height > 0,
      confirmationVisible: buttonRect.width > 0 && buttonRect.height > 0,
      confirmationLabel: button.textContent?.trim() || '',
    }
  })()`)
  if (!surface?.modalVisible || !surface.confirmationVisible || surface.confirmationLabel !== '下载并安装') {
    throw new Error(`Managed updater confirmation surface is invalid: ${JSON.stringify(surface)}`)
  }
  await capture('managed-updater-available.jpg')
  const evidence = {
    schemaVersion: 1,
    stage: 'V1.0.7-U1-DISCOVERY',
    capturedAt: new Date().toISOString(),
    status: 'passed',
    environment: 'GitHub-hosted disposable Windows installed official v1.0.6',
    release: info,
    confirmation: {
      ...surface,
      userActionRequired: true,
      clicked: false,
      installerStartedBeforeConfirmation: false,
    },
    screenshot: 'managed-updater-available.jpg',
    sourceUserContentIncluded: false,
  }
  await writeEvidence('managed-updater-discovery-evidence.json', evidence)

  const clicked = await evaluate(`(() => {
    const modal = document.querySelector('.update-modal')
    const button = [...(modal?.querySelectorAll('button') || [])].find(item => item.textContent?.includes('下载并安装'))
    if (!button || button.disabled) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error('Managed updater confirmation action was not clickable')
  evidence.confirmation.clicked = true
  evidence.confirmation.clickedAt = new Date().toISOString()
  await writeEvidence('managed-updater-discovery-evidence.json', evidence)
  await delay(350)
  try {
    const installing = await evaluate(`document.querySelector('.update-modal')?.textContent?.includes('下载并安装') === true`)
    if (installing) await capture('managed-updater-installing.jpg')
  } catch {
    // The application may close as soon as the verified installer starts.
  }
} else {
  const info = await invokeTauri('check_community_update')
  assertRelease(info, false, currentVersion)
  await waitFor(
    `Boolean(document.querySelector('.app-container') && document.querySelector('.route-wrapper') && document.querySelector('.sidebar-footer'))`,
    'stable library shell and settings entry',
    1200,
  )
  const navigation = await evaluate(`(() => {
    const entry = document.querySelector('.sidebar-footer')
    const rect = entry?.getBoundingClientRect()
    const beforeHash = location.hash
    if (!entry || !rect || rect.width <= 0 || rect.height <= 0) return null
    entry.click()
    return { beforeHash, entryVisible: true, entryText: entry.textContent?.replace(/\s+/g, ' ').trim() || '' }
  })()`)
  if (!navigation?.entryVisible) throw new Error(`Post-upgrade settings entry is invalid: ${JSON.stringify(navigation)}`)
  await waitFor(`location.hash.startsWith('#/settings')`, 'settings route navigation', 600)
  await waitFor(`document.querySelector('.settings-navigation') !== null`, 'settings category navigation', 1200)
  const selectedSystemCategory = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.settings-navigation button')]
      .find(item => item.textContent?.includes('系统与更新'))
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!selectedSystemCategory) throw new Error('Post-upgrade system update category was not selectable')
  await waitFor(`document.querySelector('[data-testid="app-update-settings"]') !== null`, 'software update settings row', 1200)
  await waitFor(`document.querySelector('.page-loader') === null`, 'settings route transition', 1200)
  navigation.afterHash = await evaluate('location.hash')
  navigation.systemCategorySelected = true
  await writeEvidence('managed-updater-post-upgrade-navigation.json', {
    schemaVersion: 1,
    stage: 'V1.0.7-U1-NAVIGATION',
    capturedAt: new Date().toISOString(),
    status: 'passed',
    ...navigation,
    sourceUserContentIncluded: false,
  })
  const clicked = await evaluate(`(() => {
    const root = document.querySelector('[data-testid="app-update-settings"]')
    const button = [...(root?.querySelectorAll('button') || [])].find(item => item.textContent?.includes('检查更新'))
    if (!button || button.disabled) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error('Post-upgrade manual update check was not clickable')
  await waitFor(
    `document.querySelector('[data-testid="app-update-settings"] .update-status')?.textContent?.includes('当前已是最新版本 v${currentVersion}') === true`,
    'post-upgrade up-to-date status',
    1200,
  )
  await evaluate(`document.querySelector('[data-testid="app-update-settings"]')?.scrollIntoView({ block: 'center', inline: 'nearest' })`)
  await waitFor(
    `(() => {
      const root = document.querySelector('[data-testid="app-update-settings"]')
      if (!root) return false
      const rect = root.getBoundingClientRect()
      const style = getComputedStyle(root)
      const containerStyle = getComputedStyle(root.closest('.animate-item') || root)
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
        && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.9
        && containerStyle.display !== 'none' && containerStyle.visibility !== 'hidden' && Number(containerStyle.opacity || 1) > 0.9
    })()`,
    'visible post-upgrade update settings row',
    600,
  )
  await delay(500)
  const surface = await evaluate(`(() => {
    const root = document.querySelector('[data-testid="app-update-settings"]')
    const rect = root?.getBoundingClientRect()
    return root && rect ? {
      text: root.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) || '',
      visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight,
      viewport: { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
    } : null
  })()`)
  if (!surface?.visible || !surface.text.includes(`当前已是最新版本 v${currentVersion}`)) {
    throw new Error(`Post-upgrade update surface is invalid: ${JSON.stringify(surface)}`)
  }
  await capture('managed-updater-current.jpg')
  await writeEvidence('managed-updater-post-upgrade-evidence.json', {
    schemaVersion: 1,
    stage: 'V1.0.7-U1-POST-UPGRADE',
    capturedAt: new Date().toISOString(),
    status: 'passed',
    environment: 'GitHub-hosted disposable Windows updated through the installed v1.0.6 client',
    release: info,
    manualCheckVisible: true,
    settingsNavigation: navigation,
    upToDateSurface: surface,
    screenshot: 'managed-updater-current.jpg',
    sourceUserContentIncluded: false,
  })
}

socket.close()
