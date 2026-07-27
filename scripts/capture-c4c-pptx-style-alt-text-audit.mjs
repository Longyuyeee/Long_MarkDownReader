import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_C4C_AUDIT_OUTPUT || 'docs/evidence/c4c-pptx-style-alt-text')
const fixture = path.resolve(process.env.LONGEDIT_C4C_WPS || '')
if (!fixture) throw new Error('C4C WPS fixture path is required')

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
const setValue = async (selector, value) => {
  const updated = await evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)})
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) return false
    const prototype = control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, ${JSON.stringify(value)})
    control.dispatchEvent(new Event('input', { bubbles: true }))
    control.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!updated) throw new Error(`Unable to set ${selector}`)
}
const click = async selector => {
  const clicked = await evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)})
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to click ${selector}`)
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
    && document.querySelector('.pptx-status')?.textContent?.includes('3 张幻灯片') === true`,
  'WPS PPTX workspace',
)
await waitFor(`document.querySelector('.page-loader') === null`, 'route overlay dismissal')
await click('button[title="验证隔离编辑基线"]')
await waitFor(
  `document.querySelector('.edit-baseline .verified-badge') !== null
    && document.querySelectorAll('[data-testid="c4c-style-target"] option').length >= 2
    && document.querySelectorAll('[data-testid="c4c-alt-target"] option').length >= 1`,
  'C4C safe style and alt-text target enumeration',
)

const shapeTarget = await evaluate(`(() => {
  const select = document.querySelector('[data-testid="c4c-style-target"]')
  if (!(select instanceof HTMLSelectElement)) return ''
  return [...select.options].find(option => option.textContent?.includes('形状'))?.value || ''
})()`)
if (!shapeTarget) throw new Error('C4C shape-text style target was not exposed')
await setValue('[data-testid="c4c-style-target"]', shapeTarget)
await setValue('[data-testid="c4c-font-size"]', '24')
await setValue('[data-testid="c4c-font-family"]', 'Aptos')
await setValue('[data-testid="c4c-color"]', '#2f6fed')
await setValue('[data-testid="c4c-alignment"]', 'center')
await click('[data-testid="c4c-style-preview"]')
await waitFor(
  `document.querySelector('.style-patch-report')?.textContent?.includes('变化部件1') === true
    && document.querySelector('.style-patch-report')?.textContent?.includes('语义复读通过') === true
    && document.querySelector('.style-patch-report')?.textContent?.includes('源文件写入否') === true
    && document.querySelector('.baseline-status')?.textContent?.includes('C4C') === true`,
  'C4C isolated character-style patch',
)
await evaluate(`document.querySelector('[data-testid="c4c-patch-panel"]')?.scrollIntoView({ block: 'start' })`)
await delay(200)
await capture('c4c-shape-style-preview-1280.jpg')

await setValue('[data-testid="c4c-alt-text"]', 'LongEdit C4C WPS accessible picture description')
await click('[data-testid="c4c-alt-preview"]')
await waitFor(
  `document.querySelector('.alt-patch-report')?.textContent?.includes('变化部件1') === true
    && document.querySelector('.alt-patch-report')?.textContent?.includes('语义复读通过') === true
    && document.querySelector('.alt-patch-report')?.textContent?.includes('源文件写入否') === true`,
  'C4C isolated picture alt-text patch',
)
await resize(960, 720)
await evaluate(`document.querySelector('.c4c-block:last-child')?.scrollIntoView({ block: 'start' })`)
await delay(250)
const responsive = await evaluate(`(() => {
  const panel = document.querySelector('.pptx-details')
  const workspace = document.querySelector('.pptx-workspace')
  if (!(panel instanceof HTMLElement) || !(workspace instanceof HTMLElement)) return false
  const rect = panel.getBoundingClientRect()
  return rect.width >= 240 && rect.left >= 0 && rect.right <= innerWidth
    && workspace.scrollWidth <= workspace.clientWidth + 1
})()`)
if (!responsive) throw new Error('C4C preview panel overflowed the 960px workspace')
await capture('c4c-alt-text-preview-960.jpg')

const sourceUnchanged = Buffer.compare(original, await fs.readFile(fixture)) === 0
if (!sourceUnchanged) throw new Error('Source WPS PPTX changed during C4C desktop audit')
const checks = [
  { id: 'safe-style-and-alt-text-targets-visible', status: 'passed' },
  { id: 'shape-text-target-explicitly-classified', status: 'passed' },
  { id: 'single-run-style-single-part-preview-verified', status: 'passed' },
  { id: 'picture-alt-text-single-part-preview-verified', status: 'passed' },
  { id: 'preview-reports-no-source-write', status: 'passed' },
  { id: 'compact-library-panel-without-overflow', status: 'passed' },
  { id: 'wps-source-bytes-unchanged', status: 'passed', sourceUnchanged },
]
const evidenceFiles = ['c4c-shape-style-preview-1280.jpg', 'c4c-alt-text-preview-960.jpg']
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
console.log(`C4C desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
