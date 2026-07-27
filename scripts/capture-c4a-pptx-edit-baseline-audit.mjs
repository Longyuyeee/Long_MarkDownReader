import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_C4A_AUDIT_OUTPUT || 'docs/evidence/c4a-pptx-edit-baseline')
const fixture = path.resolve(process.env.LONGEDIT_C4A_WPS || '')
if (!fixture) throw new Error('C4A WPS fixture path is required')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.includes('127.0.0.1:9000'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView CDP target was not found')
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
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 400) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const resize = async (width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await delay(200)
}
const capture = async fileName => {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 90,
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(output, fileName), Buffer.from(screenshot.data, 'base64'))
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await resize(1280, 820)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
const original = await fs.readFile(fixture)
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(fixture)})`)
await waitFor(
  `document.querySelector('.pptx-workspace') !== null
    && document.querySelector('.pptx-status')?.textContent?.includes('3 张幻灯片') === true
    && document.querySelector('.slide-canvas')?.textContent?.includes('WPS Presentation Producer Fixture') === true`,
  'WPS PPTX workspace',
)
await waitFor(`document.querySelector('.page-loader') === null`, 'route overlay dismissal')

const started = await evaluate(`(() => {
  const button = document.querySelector('button[title="验证隔离编辑基线"]')
  if (!(button instanceof HTMLButtonElement)) return false
  button.click()
  return true
})()`)
if (!started) throw new Error('Unable to start the C4A edit baseline')
await waitFor(
  `document.querySelector('.edit-baseline .verified-badge')?.textContent?.includes('已验证') === true
    && document.querySelector('.baseline-status')?.textContent?.includes('原文件未修改') === true
    && document.querySelector('.edit-baseline')?.textContent?.includes('内存 + 临时副本') === true
    && document.querySelector('.edit-baseline')?.textContent?.includes('源文件写入否') === true`,
  'C4A verified edit baseline',
)
await delay(250)
await capture('c4a-edit-baseline-1280.jpg')

await resize(960, 720)
await delay(250)
const responsivePanel = await evaluate(`(() => {
  const panel = document.querySelector('.pptx-details')
  const workspace = document.querySelector('.pptx-workspace')
  if (!(panel instanceof HTMLElement) || !(workspace instanceof HTMLElement)) return false
  const rect = panel.getBoundingClientRect()
  return rect.width >= 240
    && rect.left >= 0
    && rect.right <= innerWidth
    && workspace.scrollWidth <= workspace.clientWidth + 1
    && getComputedStyle(panel).display !== 'none'
})()`)
if (!responsivePanel) throw new Error('C4A edit baseline panel overflowed the 960px workspace')
await capture('c4a-edit-baseline-960.jpg')

const sourceUnchanged = Buffer.compare(original, await fs.readFile(fixture)) === 0
if (!sourceUnchanged) throw new Error('Source WPS PPTX changed during C4A desktop audit')
const checks = [
  { id: 'edit-preparation-remains-in-library-reader', status: 'passed' },
  { id: 'isolated-baseline-visible-and-verified', status: 'passed' },
  { id: 'responsive-details-panel-without-overflow', status: 'passed' },
  { id: 'wps-source-bytes-unchanged', status: 'passed', sourceUnchanged },
]
const evidenceFiles = ['c4a-edit-baseline-1280.jpg', 'c4a-edit-baseline-960.jpg']
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  sourceUrl: target.url,
  fixtureLocation: 'isolated temporary workspace',
  producer: 'wps-presentation',
  viewportMatrix: ['1280x820', '960x720'],
  checks,
  evidenceFiles,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`C4A desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
