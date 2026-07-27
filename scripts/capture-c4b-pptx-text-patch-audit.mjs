import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_C4B_AUDIT_OUTPUT || 'docs/evidence/c4b-pptx-text-patch')
const fixture = path.resolve(process.env.LONGEDIT_C4B_WPS || '')
if (!fixture) throw new Error('C4B WPS fixture path is required')

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
const runPatch = async replacement => {
  await setValue('.isolated-text-patch textarea', replacement)
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.isolated-text-patch button')]
      .find(node => node.textContent?.includes('验证隔离补丁'))
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error('Unable to run the C4B isolated patch')
  await waitFor(
    `document.querySelector('.isolated-text-patch .verified-badge')?.textContent?.includes('已通过') === true
      && document.querySelector('.baseline-status')?.textContent?.includes('C4B') === true
      && document.querySelector('.patch-report')?.textContent?.includes('变化部件1') === true
      && document.querySelector('.patch-report')?.textContent?.includes('源文件写入否') === true`,
    'C4B isolated patch verification',
  )
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
await evaluate(`document.querySelector('button[title="验证隔离编辑基线"]')?.click()`)
await waitFor(
  `document.querySelector('.edit-baseline .verified-badge') !== null
    && document.querySelectorAll('.isolated-text-patch select option').length >= 4`,
  'C4B safe target enumeration',
)

await runPatch('LongEdit C4B isolated slide preview')
await capture('c4b-slide-text-preview-1280.jpg')

const notesTarget = await evaluate(`(() => {
  const select = document.querySelector('.isolated-text-patch select')
  if (!(select instanceof HTMLSelectElement)) return ''
  return [...select.options].find(option => option.textContent?.includes('备注'))?.value || ''
})()`)
if (!notesTarget) throw new Error('C4B speaker-notes target was not exposed')
await setValue('.isolated-text-patch select', notesTarget)
await waitFor(
  `document.querySelector('.isolated-text-patch textarea')?.value?.includes('WPS speaker note evidence') === true`,
  'speaker-notes target selection',
)
await runPatch('LongEdit C4B isolated notes preview')
await resize(960, 720)
await delay(250)
const responsive = await evaluate(`(() => {
  const panel = document.querySelector('.pptx-details')
  const workspace = document.querySelector('.pptx-workspace')
  if (!(panel instanceof HTMLElement) || !(workspace instanceof HTMLElement)) return false
  const rect = panel.getBoundingClientRect()
  return rect.width >= 240 && rect.left >= 0 && rect.right <= innerWidth
    && workspace.scrollWidth <= workspace.clientWidth + 1
})()`)
if (!responsive) throw new Error('C4B preview panel overflowed the 960px workspace')
await capture('c4b-notes-preview-960.jpg')

const sourceUnchanged = Buffer.compare(original, await fs.readFile(fixture)) === 0
if (!sourceUnchanged) throw new Error('Source WPS PPTX changed during C4B desktop audit')
const checks = [
  { id: 'safe-slide-and-notes-targets-visible', status: 'passed' },
  { id: 'slide-text-single-part-preview-verified', status: 'passed' },
  { id: 'speaker-notes-single-part-preview-verified', status: 'passed' },
  { id: 'preview-reports-no-source-write', status: 'passed' },
  { id: 'compact-library-panel-without-overflow', status: 'passed' },
  { id: 'wps-source-bytes-unchanged', status: 'passed', sourceUnchanged },
]
const evidenceFiles = ['c4b-slide-text-preview-1280.jpg', 'c4b-notes-preview-960.jpg']
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
console.log(`C4B desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
