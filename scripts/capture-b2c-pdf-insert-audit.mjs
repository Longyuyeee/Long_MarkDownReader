import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_B2C_AUDIT_OUTPUT || 'docs/evidence/b2c-pdf-insert')
const base = path.resolve(process.env.LONGEDIT_B2C_BASE_PDF || '')
const source = path.resolve(process.env.LONGEDIT_B2C_SOURCE_PDF || '')
if (!base || !source) throw new Error('B2C base and source PDF fixtures are required')
const targetName = 'B2C Inserted Pages.pdf'
const targetPath = path.join(path.dirname(base), targetName)
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
const waitFor = async (expression, description, attempts = 500) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
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
const setInput = async (selector, value) => {
  const updated = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!(input instanceof HTMLInputElement)) return false
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!updated) throw new Error(`Unable to set ${selector}`)
}
const resize = async (width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await delay(250)
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
const assertNoOverflow = async description => {
  const state = await evaluate(`(() => ({
    viewport: document.documentElement.scrollWidth <= innerWidth + 1,
    view: (() => {
      const node = document.querySelector('.pdf-view')
      return node instanceof HTMLElement && node.scrollWidth <= node.clientWidth + 1
    })(),
    sidebar: (() => {
      const node = document.querySelector('.pdf-sidebar')
      return !(node instanceof HTMLElement) || node.scrollWidth <= node.clientWidth + 1
    })(),
    verticalActionLabel: [...document.querySelectorAll('.toolbar-actions .fit-btn .action-label')]
      .some(label => {
        const rect = label.getBoundingClientRect()
        return rect.height > rect.width * 1.5
      }),
  }))()`)
  if (!state.viewport || !state.view || !state.sidebar || state.verticalActionLabel) {
    throw new Error(`${description} overflowed: ${JSON.stringify(state)}`)
  }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await resize(1280, 820)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
for (let attempt = 0; attempt < 500; attempt += 1) {
  const ready = await evaluate(`document.querySelector('.pdf-view') !== null
    && document.querySelector('.document-title')?.textContent?.includes('B2C Base') === true
    && document.querySelectorAll('.page-shell canvas').length === 2`)
  if (ready) break
  const hash = await evaluate('location.hash')
  if (!hash.startsWith('#/pdf?') || !hash.includes(encodeURIComponent(base))) {
    await evaluate(`location.hash = '#/pdf?path=' + encodeURIComponent(${JSON.stringify(base)})`)
  }
  await delay(100)
  if (attempt === 499) throw new Error('Timed out waiting for B2C base PDF')
}
await waitFor(`document.querySelector('.page-loader') === null`, 'route overlay dismissal')
const baseBefore = await fs.readFile(base)
const sourceBefore = await fs.readFile(source)
await click('.toolbar-actions .fit-btn[title="非破坏式页面整理预览"]')
await waitFor(`document.querySelector('[data-testid="b2c-pdf-insert"]') !== null`, 'B2C insert controls')
await setInput('[data-testid="b2c-pdf-insert-path"]', source)
await click('[data-testid="b2c-pdf-insert-add"]')
await waitFor(
  `document.querySelector('.pdf-insert-source')?.textContent?.includes('B2C Source') === true`,
  'B2C insert source',
)
await setInput('[data-testid="b2c-pdf-insert-range"]', '1')
await setInput('[data-testid="b2c-pdf-insert-anchor"]', '1')
await waitFor(
  `document.querySelector('.pdf-insert-segments button:nth-child(2)')?.classList.contains('active') === true`,
  'B2C insert-after position',
)
await assertNoOverflow('B2C configured insert plan')
await capture('b2c-insert-plan-1280.jpg')
await click('[data-testid="b2c-pdf-insert-verify"]')
await waitFor(
  `document.querySelector('.pdf-insert-panel .pdf-merge-verification')?.textContent?.includes('插页副本验证通过') === true
    && document.querySelector('.pdf-insert-panel .pdf-merge-verification')?.textContent?.includes('插入 1 页') === true
    && document.querySelector('.pdf-insert-panel .pdf-merge-verification')?.textContent?.includes('输出 3 页') === true
    && document.querySelector('.pdf-insert-panel .pdf-merge-verification')?.textContent?.includes('两份源文件未修改') === true`,
  'B2C isolated insert verification',
)
await capture('b2c-isolated-insert-1280.jpg')
await setInput('.pdf-insert-panel .pdf-merge-save input[aria-label="PDF 插页文件名"]', targetName)
await click('.pdf-insert-panel .pdf-merge-save button')
await waitFor(
  `document.querySelector('.document-title')?.textContent?.includes('B2C Inserted Pages') === true
    && document.querySelectorAll('.page-shell').length === 3
    && document.querySelectorAll('.page-shell canvas').length === 3
    && document.querySelector('.page-plan-saved')?.textContent?.includes('可靠副本已落盘并重开') === true
    && document.querySelector('.page-plan-saved')?.textContent?.includes('3 页') === true`,
  'B2C inserted output reopen',
)
await waitFor(
  `document.querySelector('.page-loader') === null
    && document.querySelector('.pdf-state') === null`,
  'B2C reopened output loading dismissal',
)
await delay(400)
await fs.stat(targetPath)
await resize(960, 720)
await assertNoOverflow('B2C compact reopened output')
await capture('b2c-saved-reopen-960.jpg')

const baseAfter = await fs.readFile(base)
const sourceAfter = await fs.readFile(source)
const saved = await fs.readFile(targetPath)
const baseUnchanged = Buffer.compare(baseBefore, baseAfter) === 0
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
if (!baseUnchanged || !sourceUnchanged) throw new Error('B2C insert changed a source PDF')
if (saved.length < 500 || !saved.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
  throw new Error('B2C insert did not create a valid-looking PDF')
}
const checks = [
  { id: 'library-source-selected', status: 'passed' },
  { id: 'source-page-range-and-boundary-applied', status: 'passed' },
  { id: 'isolated-insert-verified', status: 'passed' },
  { id: 'atomic-create-new-save', status: 'passed' },
  { id: 'three-page-output-reopened', status: 'passed' },
  { id: 'normal-and-compact-layouts-without-overflow', status: 'passed' },
  { id: 'both-source-pdf-bytes-unchanged', status: 'passed', baseUnchanged, sourceUnchanged },
]
const evidenceFiles = [
  'b2c-insert-plan-1280.jpg',
  'b2c-isolated-insert-1280.jpg',
  'b2c-saved-reopen-960.jpg',
]
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  fixtureLocation: 'isolated temporary workspace',
  baseFile: 'B2C Base.pdf',
  sourceFile: 'B2C Source.pdf',
  basePages: 2,
  sourcePages: [1],
  insertAfterPage: 1,
  outputPages: 3,
  sourceOverwriteAllowed: false,
  baseSha256: createHash('sha256').update(baseAfter).digest('hex'),
  sourceSha256: createHash('sha256').update(sourceAfter).digest('hex'),
  outputSha256: createHash('sha256').update(saved).digest('hex'),
  outputBytes: saved.length,
  viewportMatrix: ['1280x820', '960x720'],
  checks,
  evidenceFiles,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`B2C desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
