import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_A5_AUDIT_OUTPUT || 'docs/evidence/a5-stage-a')
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.includes('127.0.0.1:9000'))
if (!target?.webSocketDebuggerUrl) throw new Error('Restarted LongEdit Tauri WebView CDP target was not found')

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

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})

const evaluate = async expression => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Restart verification failed')
  return result.result.value
}

const waitFor = async (expression, description, attempts = 150) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 820,
  deviceScaleFactor: 1,
  mobile: false,
})

await waitFor(`document.querySelector('#app')?.children.length > 0`, 'restarted app bootstrap')
await waitFor(`document.querySelector('.page-loader') === null`, 'restarted app initial route')
await delay(1500)
await evaluate(`location.hash = '#/library'`)
await waitFor(`document.querySelector('.library-mode') !== null`, 'library after process restart')
await waitFor(
  `localStorage.getItem('longedit_tabs_state')?.includes('runtime.log') === true`,
  'persisted recent log state',
)
const historyTabClicked = await evaluate(`(() => {
  const tab = document.querySelector('.icon-tab[aria-label="历史"]')
  if (!tab) return false
  tab.click()
  return true
})()`)
if (!historyTabClicked) throw new Error('Recent-file history tab could not be opened')
await waitFor(
  `[...document.querySelectorAll('.recent-item')].some(item => item.textContent?.includes('runtime.log'))`,
  'persisted recent log file in history panel',
)
const clicked = await evaluate(`(() => {
  const item = [...document.querySelectorAll('.recent-item')]
    .find(element => element.textContent?.includes('runtime.log'))
  if (!item) return false
  item.click()
  return true
})()`)
if (!clicked) throw new Error('Persisted recent file could not be opened')
await waitFor(
  `location.hash.startsWith('#/library?path=')
    && document.querySelector('.library-embedded-editor .log-workspace') !== null
    && document.querySelector('.sidebar')?.getBoundingClientRect().width > 180
    && document.body.innerText.includes('A5_ROTATED_LOG_MARKER')`,
  'recent log reopened after process restart',
)
await waitFor(`document.querySelector('.page-loader') === null`, 'restart route loading overlay')
await delay(350)

const screenshotName = 'restart-recent-file-restored.jpg'
const screenshot = await send('Page.captureScreenshot', {
  format: 'jpeg',
  quality: 90,
  fromSurface: true,
  captureBeyondViewport: false,
})
await fs.writeFile(path.join(output, screenshotName), Buffer.from(screenshot.data, 'base64'))

const manifestPath = path.join(output, 'audit-manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
manifest.checks.push({ id: 'restart-recent-file-reopen', status: 'passed' })
manifest.evidenceFiles.push(screenshotName)
manifest.restartVerifiedAt = new Date().toISOString()
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log('A5 process restart restored and reopened the recent log file')
