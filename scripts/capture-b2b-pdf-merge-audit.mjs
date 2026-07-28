import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_B2B_AUDIT_OUTPUT || 'docs/evidence/b2b-pdf-merge')
const primary = path.resolve(process.env.LONGEDIT_B2B_PRIMARY_PDF || '')
const secondary = path.resolve(process.env.LONGEDIT_B2B_SECONDARY_PDF || '')
if (!primary || !secondary) throw new Error('B2B primary and secondary PDF fixtures are required')
const targetName = 'B2B Ordered Merge.pdf'
const targetPath = path.join(path.dirname(primary), targetName)
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
    && document.querySelector('.document-title')?.textContent?.includes('B2B Primary') === true
    && document.querySelectorAll('.page-shell canvas').length === 2`)
  if (ready) break
  const hash = await evaluate('location.hash')
  if (!hash.startsWith('#/pdf?') || !hash.includes(encodeURIComponent(primary))) {
    await evaluate(`location.hash = '#/pdf?path=' + encodeURIComponent(${JSON.stringify(primary)})`)
  }
  await delay(100)
  if (attempt === 499) throw new Error('Timed out waiting for B2B primary PDF')
}
await waitFor(`document.querySelector('.page-loader') === null`, 'route overlay dismissal')
const primaryBefore = await fs.readFile(primary)
const secondaryBefore = await fs.readFile(secondary)
await click('.toolbar-actions .fit-btn[title="非破坏式页面整理预览"]')
await waitFor(`document.querySelector('[data-testid="b2b-pdf-merge"]') !== null`, 'B2B merge controls')
await setInput('[data-testid="b2b-pdf-merge-path"]', secondary)
await click('[data-testid="b2b-pdf-merge-add"]')
await waitFor(
  `document.querySelectorAll('.pdf-merge-list article').length === 2
    && document.querySelector('.pdf-merge-list article:nth-child(2) .pdf-merge-name')?.textContent?.includes('B2B Secondary') === true`,
  'B2B second merge input',
)
await click('.pdf-merge-list article:nth-child(2) .pdf-merge-actions button[title="向前移动"]')
await waitFor(
  `document.querySelector('.pdf-merge-list article:first-child .pdf-merge-name')?.textContent?.includes('B2B Secondary') === true
    && document.querySelector('.pdf-merge-list article:nth-child(2) .pdf-merge-name')?.textContent?.includes('B2B Primary') === true`,
  'B2B explicit input order',
)
await assertNoOverflow('B2B ordered merge inputs')
await capture('b2b-ordered-inputs-1280.jpg')
await click('[data-testid="b2b-pdf-merge-verify"]')
await waitFor(
  `document.querySelector('.pdf-merge-verification')?.textContent?.includes('合并副本验证通过') === true
    && document.querySelector('.pdf-merge-verification')?.textContent?.includes('2 个文件') === true
    && document.querySelector('.pdf-merge-verification')?.textContent?.includes('4 页') === true
    && document.querySelector('.pdf-merge-verification')?.textContent?.includes('全部源文件未修改') === true`,
  'B2B isolated merge verification',
)
await capture('b2b-isolated-merge-1280.jpg')
await setInput('.pdf-merge-save input[aria-label="PDF 合并文件名"]', targetName)
await click('.pdf-merge-save button')
await waitFor(
  `document.querySelector('.document-title')?.textContent?.includes('B2B Ordered Merge') === true
    && document.querySelectorAll('.page-shell').length === 4
    && document.querySelectorAll('.page-shell canvas').length === 4
    && document.querySelector('.page-plan-saved')?.textContent?.includes('可靠副本已落盘并重开') === true
    && document.querySelector('.page-plan-saved')?.textContent?.includes('4 页') === true`,
  'B2B merged output reopen',
)
await waitFor(
  `document.querySelector('.page-loader') === null
    && document.querySelector('.pdf-state') === null`,
  'B2B reopened output loading dismissal',
)
await delay(400)
await fs.stat(targetPath)
await resize(960, 720)
await assertNoOverflow('B2B compact reopened output')
await capture('b2b-saved-reopen-960.jpg')

const primaryAfter = await fs.readFile(primary)
const secondaryAfter = await fs.readFile(secondary)
const saved = await fs.readFile(targetPath)
const primaryUnchanged = Buffer.compare(primaryBefore, primaryAfter) === 0
const secondaryUnchanged = Buffer.compare(secondaryBefore, secondaryAfter) === 0
if (!primaryUnchanged || !secondaryUnchanged) throw new Error('B2B merge changed a source PDF')
if (saved.length < 500 || !saved.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
  throw new Error('B2B merge did not create a valid-looking PDF')
}
const checks = [
  { id: 'multiple-library-inputs-added', status: 'passed' },
  { id: 'explicit-input-order-applied', status: 'passed' },
  { id: 'isolated-merge-verified', status: 'passed' },
  { id: 'atomic-create-new-save', status: 'passed' },
  { id: 'four-page-output-reopened', status: 'passed' },
  { id: 'normal-and-compact-layouts-without-overflow', status: 'passed' },
  { id: 'all-source-pdf-bytes-unchanged', status: 'passed', primaryUnchanged, secondaryUnchanged },
]
const evidenceFiles = [
  'b2b-ordered-inputs-1280.jpg',
  'b2b-isolated-merge-1280.jpg',
  'b2b-saved-reopen-960.jpg',
]
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  fixtureLocation: 'isolated temporary workspace',
  inputOrder: ['B2B Secondary.pdf', 'B2B Primary.pdf'],
  inputPages: [2, 2],
  outputPages: 4,
  sourceOverwriteAllowed: false,
  primarySha256: createHash('sha256').update(primaryAfter).digest('hex'),
  secondarySha256: createHash('sha256').update(secondaryAfter).digest('hex'),
  outputSha256: createHash('sha256').update(saved).digest('hex'),
  outputBytes: saved.length,
  viewportMatrix: ['1280x820', '960x720'],
  checks,
  evidenceFiles,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`B2B desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
