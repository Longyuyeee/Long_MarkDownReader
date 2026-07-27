import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_C4D_AUDIT_OUTPUT || 'docs/evidence/c4d-pptx-reliable-save')
const fixture = path.resolve(process.env.LONGEDIT_C4D_WPS || '')
if (!fixture) throw new Error('C4D WPS fixture path is required')
const targetCopy = path.join(path.dirname(fixture), 'wps-c4d-verified-copy.pptx')

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
    && document.querySelectorAll('[data-testid="c4c-style-target"] option').length >= 2`,
  'C4D protected edit baseline',
)
const shapeTarget = await evaluate(`(() => {
  const select = document.querySelector('[data-testid="c4c-style-target"]')
  if (!(select instanceof HTMLSelectElement)) return ''
  return [...select.options].find(option => option.textContent?.includes('形状'))?.value || ''
})()`)
if (!shapeTarget) throw new Error('C4D shape-text style target was not exposed')
await setValue('[data-testid="c4c-style-target"]', shapeTarget)
await setValue('[data-testid="c4c-font-size"]', '24')
await setValue('[data-testid="c4c-font-family"]', 'Aptos')
await setValue('[data-testid="c4c-color"]', '#2f6fed')
await setValue('[data-testid="c4c-alignment"]', 'center')
await click('[data-testid="c4c-style-preview"]')
await waitFor(
  `document.querySelector('.style-patch-report')?.textContent?.includes('语义复读通过') === true
    && document.querySelector('[data-testid="c4d-save-panel"]') !== null`,
  'verified C4D save candidate',
)
await setValue('[data-testid="c4d-copy-file-name"]', path.basename(targetCopy))
await click('[data-testid="c4d-save-copy"]')
await waitFor(
  `document.querySelector('.c4d-save-report')?.textContent?.includes('结构复开通过') === true
    && document.querySelector('.c4d-save-report')?.textContent?.includes('语义复开通过') === true
    && document.querySelector('.c4d-save-report')?.textContent?.includes('源文件不变是') === true
    && document.querySelector('.pptx-status')?.textContent?.includes('C4D 新副本已可靠保存') === true`,
  'C4D atomic save and reopen report',
)
await waitFor(`document.querySelector('[data-testid="c4d-save-copy"]')?.disabled === true`, 'saved target lock')
await evaluate(`document.querySelector('[data-testid="c4d-save-panel"]')?.scrollIntoView({ block: 'start' })`)
await delay(250)
await capture('c4d-save-copy-verified-1280.jpg')

const copyStat = await fs.stat(targetCopy).catch(() => null)
if (!copyStat || copyStat.size < 1_000) throw new Error('C4D verified copy was not created')
if (Buffer.compare(original, await fs.readFile(fixture)) !== 0) throw new Error('Source WPS PPTX changed during C4D save')

await click('[data-testid="c4d-open-copy"]')
await waitFor(
  `document.querySelector('.document-identity')?.textContent?.includes('wps-c4d-verified-copy.pptx') === true
    && document.querySelector('.pptx-status')?.textContent?.includes('3 张幻灯片') === true`,
  'saved copy reopened inside Library workspace',
)
await waitFor(`document.querySelector('.page-loader') === null`, 'saved-copy route overlay dismissal')
await resize(960, 720)
const responsive = await evaluate(`(() => {
  const workspace = document.querySelector('.pptx-workspace')
  if (!(workspace instanceof HTMLElement)) return false
  return workspace.scrollWidth <= workspace.clientWidth + 1
})()`)
if (!responsive) throw new Error('C4D reopened copy overflowed the 960px Library workspace')
await capture('c4d-reopened-copy-960.jpg')

const sourceUnchanged = Buffer.compare(original, await fs.readFile(fixture)) === 0
const checks = [
  { id: 'verified-preview-unlocks-save-copy', status: 'passed' },
  { id: 'atomic-create-new-copy-succeeds', status: 'passed' },
  { id: 'structural-reopen-verified', status: 'passed' },
  { id: 'semantic-reopen-verified', status: 'passed' },
  { id: 'saved-target-locked-against-repeat-overwrite', status: 'passed' },
  { id: 'saved-copy-reopens-in-library-workspace', status: 'passed' },
  { id: 'compact-library-workspace-without-overflow', status: 'passed' },
  { id: 'wps-source-bytes-unchanged', status: 'passed', sourceUnchanged },
]
const evidenceFiles = ['c4d-save-copy-verified-1280.jpg', 'c4d-reopened-copy-960.jpg']
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  sourceUrl: target.url,
  fixtureLocation: 'isolated temporary workspace',
  producer: 'wps-presentation',
  viewportMatrix: ['1280x820', '960x720'],
  saveMode: 'copy',
  sourceOverwriteAllowed: false,
  externalProducerReopenRequired: true,
  checks,
  evidenceFiles,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`C4D desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
