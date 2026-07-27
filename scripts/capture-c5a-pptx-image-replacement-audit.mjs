import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_C5A_AUDIT_OUTPUT || 'docs/evidence/c5a-pptx-image-replacement')
const fixture = path.resolve(process.env.LONGEDIT_C5A_WPS || '')
const pngReplacement = path.resolve(process.env.LONGEDIT_C5A_PNG || '')
const jpegReplacement = path.resolve(process.env.LONGEDIT_C5A_JPEG || '')
if (!fixture || !pngReplacement || !jpegReplacement) throw new Error('C5A fixture and replacement images are required')
const targetCopy = path.join(path.dirname(fixture), 'wps-c5a-image-copy.pptx')

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
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return false
    const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
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
    && document.querySelectorAll('.slide-strip > button').length === 3`,
  'WPS PPTX workspace',
)
await waitFor(`document.querySelector('.page-loader') === null`, 'route overlay dismissal')
await click('button[title="验证隔离编辑基线"]')
await waitFor(
  `document.querySelector('.edit-baseline .verified-badge') !== null
    && document.querySelectorAll('[data-testid="c5a-image-target"] option').length >= 1`,
  'C5A unshared image target enumeration',
)

const targetMime = await evaluate(`(() => {
  const select = document.querySelector('[data-testid="c5a-image-target"]')
  if (!(select instanceof HTMLSelectElement)) return ''
  return select.selectedOptions[0]?.textContent?.includes('JPEG') ? 'image/jpeg' : 'image/png'
})()`)
const replacementPath = targetMime === 'image/jpeg' ? jpegReplacement : pngReplacement
const replacementBytes = await fs.readFile(replacementPath)
const replacementBase64 = replacementBytes.toString('base64')
const replacementName = path.basename(replacementPath)
const injected = await evaluate(`(() => {
  const input = document.querySelector('[data-testid="c5a-image-file"]')
  if (!(input instanceof HTMLInputElement)) return false
  const binary = atob(${JSON.stringify(replacementBase64)})
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const file = new File([bytes], ${JSON.stringify(replacementName)}, { type: ${JSON.stringify(targetMime)} })
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})()`)
if (!injected) throw new Error('Unable to inject the C5A replacement image')
await waitFor(
  `document.querySelector('.image-replacement-preview')?.textContent?.includes(${JSON.stringify(replacementName)}) === true`,
  'replacement image preview',
)
await click('[data-testid="c5a-image-preview"]')
await waitFor(
  `document.querySelector('.image-patch-report')?.textContent?.includes('变化部件1') === true
    && document.querySelector('.image-patch-report')?.textContent?.includes('语义复读通过') === true
    && document.querySelector('.image-patch-report')?.textContent?.includes('源文件写入否') === true
    && document.querySelector('[data-testid="c4d-save-panel"]') !== null`,
  'C5A isolated image patch',
)
await evaluate(`document.querySelector('[data-testid="c5a-image-panel"]')?.scrollIntoView({ block: 'start' })`)
await delay(250)
await capture('c5a-image-preview-1280.jpg')

await setValue('[data-testid="c4d-copy-file-name"]', path.basename(targetCopy))
await click('[data-testid="c4d-save-copy"]')
await waitFor(
  `document.querySelector('.c4d-save-report')?.textContent?.includes('结构复开通过') === true
    && document.querySelector('.c4d-save-report')?.textContent?.includes('语义复开通过') === true
    && document.querySelector('.c4d-save-report')?.textContent?.includes('源文件不变是') === true`,
  'C5A reliable save-copy report',
)
await click('[data-testid="c4d-open-copy"]')
await waitFor(
  `document.querySelector('.document-identity')?.textContent?.includes('wps-c5a-image-copy.pptx') === true
    && document.querySelectorAll('.slide-strip > button').length === 3`,
  'C5A saved copy reopen',
)
await waitFor(`document.querySelector('.page-loader') === null`, 'saved-copy route overlay dismissal')
await resize(960, 720)
const responsive = await evaluate(`(() => {
  const workspace = document.querySelector('.pptx-workspace')
  return workspace instanceof HTMLElement && workspace.scrollWidth <= workspace.clientWidth + 1
})()`)
if (!responsive) throw new Error('C5A reopened copy overflowed the 960px Library workspace')
await capture('c5a-reopened-copy-960.jpg')

const copy = await fs.readFile(targetCopy)
const sourceUnchanged = Buffer.compare(original, await fs.readFile(fixture)) === 0
if (!sourceUnchanged) throw new Error('Source WPS PPTX changed during C5A desktop audit')
const checks = [
  { id: 'unshared-png-jpeg-targets-only', status: 'passed' },
  { id: 'same-format-bounded-file-selection', status: 'passed' },
  { id: 'single-media-part-preview-verified', status: 'passed' },
  { id: 'preview-reports-no-source-write', status: 'passed' },
  { id: 'atomic-create-new-copy-succeeds', status: 'passed' },
  { id: 'structural-and-semantic-reopen-verified', status: 'passed' },
  { id: 'saved-copy-reopens-in-library-workspace', status: 'passed' },
  { id: 'compact-library-workspace-without-overflow', status: 'passed' },
  { id: 'wps-source-bytes-unchanged', status: 'passed', sourceUnchanged },
]
const evidenceFiles = ['c5a-image-preview-1280.jpg', 'c5a-reopened-copy-960.jpg']
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
  replacementMimeType: targetMime,
  replacementBytes: replacementBytes.length,
  outputBytes: copy.length,
  outputSha256: createHash('sha256').update(copy).digest('hex'),
  externalProducerReopenRequired: true,
  checks,
  evidenceFiles,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`C5A desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
