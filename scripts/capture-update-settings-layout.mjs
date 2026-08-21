import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14524'
const output = path.resolve('docs/evidence/v1013-update-settings-ui')
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url === 'about:blank')
if (!target) throw new Error('LongEdit WebView target was not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception')
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    runtimeErrors.push(message.params.args?.map(argument => argument.value || argument.description || '').join(' ') || 'Console error')
  }
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Browser log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const waitFor = async (expression, description) => {
  for (let index = 0; index < 400; index += 1) {
    if (await evaluate(expression)) return
    if (await evaluate(`Boolean(document.querySelector('.crash-fallback'))`)) break
    await delay(100)
  }
  const diagnostic = await evaluate(`({ hash: location.hash, title: document.title, body: document.body?.innerText?.slice(0, 1200), html: document.querySelector('#app')?.innerHTML?.slice(0, 1600) })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify({ diagnostic, runtimeErrors })}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const clickCategory = async label => {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.settings-navigation button')].find(item => item.textContent?.trim() === ${JSON.stringify(label)})
    if (!button) return false
    button.click()
    return true
  })()`)
  await waitFor(`document.querySelector('.settings-category-heading h2')?.textContent?.trim() === ${JSON.stringify(label)}`, `${label} settings category`)
  await delay(120)
}
const settingsMetrics = () => evaluate(`(() => {
  const navigation = document.querySelector('.settings-navigation')?.getBoundingClientRect()
  const panel = document.querySelector('.settings-panel')
  return {
    navigation: navigation && { x: navigation.x, y: navigation.y, width: navigation.width, height: navigation.height },
    panelScrollTop: panel?.scrollTop,
    contentOverflow: document.querySelector('.settings-content')?.scrollHeight - document.querySelector('.settings-content')?.clientHeight,
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
  }
})()`)
const modalMetrics = () => evaluate(`(() => {
  const modal = document.querySelector('.update-modal')?.getBoundingClientRect()
  const actions = document.querySelector('.modal-actions')?.getBoundingClientRect()
  return {
    viewport: [innerWidth, innerHeight],
    modal: modal && { x: modal.x, y: modal.y, width: modal.width, height: modal.height, right: modal.right, bottom: modal.bottom },
    actions: actions && { width: actions.width, height: actions.height },
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    title: document.querySelector('.update-heading strong')?.textContent?.trim(),
    version: document.querySelector('.version-line')?.textContent?.replace(/\s+/g, ' ').trim(),
  }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } } }`,
})
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://127.0.0.1:9000/#/settings?category=appearance' })
await waitFor(`document.querySelector('.settings-category-heading h2')?.textContent?.trim() === '外观'`, 'appearance settings')
await evaluate(`document.querySelector('.settings-panel').scrollTop = 640`)
await delay(120)
const appearance = await settingsMetrics()
await clickCategory('格式与文件')
const formats = await settingsMetrics()
await clickCategory('系统与更新')
const system = await settingsMetrics()
await capture('settings-fixed-navigation.png')

await evaluate(`import('/src/services/appUpdater.ts').then(({ updaterState }) => Object.assign(updaterState, {
  status: 'available',
  currentVersion: '1.0.12',
  latestVersion: '1.0.13',
  installerSize: 17825792,
  releaseNotes: '# Long编辑 v1.0.13\\n- 更新提示更紧凑清晰\\n- 设置分类切换保持稳定\\n- 完成格式事实与界面术语收口',
  releaseUrl: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.13',
  error: '',
}))`)
await waitFor(`document.querySelector('.update-heading strong')?.textContent?.trim() === '发现新版本'`, 'update modal')
await delay(180)
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false })
await delay(120)
const updateWide = await modalMetrics()
await capture('update-modal-1000x700.png')
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await delay(120)
const updateNarrow = await modalMetrics()
await capture('update-modal-480x700.png')

const navigationPositions = [appearance, formats, system].map(item => item.navigation?.y)
const navigationStable = navigationPositions.every(position => Math.abs(position - navigationPositions[0]) <= 1)
const modalFits = state => state.modal
  && state.modal.width <= 462
  && state.modal.x >= 0
  && state.modal.right <= state.viewport[0]
  && state.modal.y >= 0
  && state.modal.bottom <= state.viewport[1]
  && state.pageOverflow <= 2
const passed = navigationStable
  && appearance.panelScrollTop >= 500
  && formats.panelScrollTop === 0
  && system.panelScrollTop === 0
  && modalFits(updateWide)
  && modalFits(updateNarrow)
  && updateWide.title === '发现新版本'
  && updateWide.version === 'v1.0.12v1.0.13'
  && runtimeErrors.length === 0
if (!passed) throw new Error(`Update/settings UI audit failed: ${JSON.stringify({ appearance, formats, system, updateWide, updateNarrow, runtimeErrors })}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  status: 'accepted',
  expected: {
    settingsNavigationMaximumShiftPx: 1,
    categorySwitchPanelScrollTop: 0,
    updateModalMaximumWidthPx: 462,
    testedViewports: [[1280, 800], [1000, 700], [480, 700]],
  },
  actual: { appearance, formats, system, updateWide, updateNarrow, navigationPositions, runtimeErrorCount: runtimeErrors.length },
  passed,
}, null, 2)}\n`)
socket.close()
console.log('Update modal and settings navigation desktop audit passed.')
