import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_B2A_AUDIT_OUTPUT || 'docs/evidence/b2a-pdf-page-extraction')
const source = path.resolve(process.env.LONGEDIT_B2A_PDF || '')
if (!source) throw new Error('B2A PDF fixture is required')
const targetName = 'B2A Extracted Page 2.pdf'
const targetPath = path.join(path.dirname(source), targetName)
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
    verticalActionLabel: [...document.querySelectorAll('.toolbar-actions .fit-btn .action-label')]
      .some(label => {
        const rect = label.getBoundingClientRect()
        return rect.height > rect.width * 1.5
      }),
  }))()`)
  if (!state.viewport || !state.view || state.verticalActionLabel) throw new Error(`${description} overflowed: ${JSON.stringify(state)}`)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await resize(1280, 820)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
for (let attempt = 0; attempt < 500; attempt += 1) {
  const ready = await evaluate(`document.querySelector('.pdf-view') !== null
    && document.querySelector('.document-title')?.textContent?.includes(${JSON.stringify(path.basename(source, '.pdf'))}) === true
    && document.querySelectorAll('.page-shell canvas').length === 2`)
  if (ready) break
  const hash = await evaluate('location.hash')
  if (!hash.startsWith('#/pdf?') || !hash.includes(encodeURIComponent(source))) {
    await evaluate(`location.hash = '#/pdf?path=' + encodeURIComponent(${JSON.stringify(source)})`)
  }
  await delay(100)
  if (attempt === 499) throw new Error('Timed out waiting for B2A source PDF')
}
await waitFor(`document.querySelector('.page-loader') === null`, 'route overlay dismissal')
const sourceBefore = await fs.readFile(source)
await click('.toolbar-actions .fit-btn[title="非破坏式页面整理预览"]')
await waitFor(`document.querySelector('[data-testid="b2a-page-range"]') !== null`, 'B2A extraction controls')
await setInput('[data-testid="b2a-page-range-input"]', '2')
await click('[data-testid="b2a-page-range-apply"]')
await waitFor(
  `document.querySelector('.page-plan-heading')?.textContent?.includes('提取 1/2 页') === true
    && document.querySelector('.page-plan-list article:first-child')?.dataset.sourcePage === '2'
    && document.querySelector('.page-plan-list article[data-source-page="1"]')?.classList.contains('removed') === true`,
  'B2A extraction page plan',
)
await assertNoOverflow('B2A extraction plan')
await capture('b2a-range-plan-1280.jpg')
await click('.page-plan-verify')
await waitFor(
  `document.querySelector('.page-plan-verification')?.textContent?.includes('提取副本验证通过') === true
    && document.querySelector('.page-plan-verification')?.textContent?.includes('1 页') === true
    && document.querySelector('.page-plan-verification')?.textContent?.includes('源文件未修改') === true`,
  'B2A isolated extraction preview',
)
await capture('b2a-isolated-preview-1280.jpg')
await setInput('.page-plan-save input[aria-label="PDF 新副本文件名"]', targetName)
await click('.page-plan-save button')
await waitFor(
  `document.querySelector('.document-title')?.textContent?.includes('B2A Extracted Page 2') === true
    && document.querySelectorAll('.page-shell').length === 1
    && document.querySelectorAll('.page-shell canvas').length === 1
    && document.querySelector('.page-plan-saved')?.textContent?.includes('可靠副本已落盘并重开') === true
    && document.querySelector('.page-plan-saved')?.textContent?.includes('源文件未修改') === true`,
  'B2A saved copy reopen',
)
await waitFor(
  `document.querySelector('.page-loader') === null
    && document.querySelector('.pdf-state') === null`,
  'B2A reopened output loading dismissal',
)
await delay(400)
await fs.stat(targetPath)
await resize(960, 720)
await assertNoOverflow('B2A compact reopened output')
await capture('b2a-saved-reopen-960.jpg')

const sourceAfter = await fs.readFile(source)
const saved = await fs.readFile(targetPath)
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
if (!sourceUnchanged) throw new Error('B2A extraction changed the source PDF')
if (saved.length < 500 || !saved.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
  throw new Error('B2A extraction did not create a valid-looking PDF')
}
const checks = [
  { id: 'range-expression-applies-one-page-plan', status: 'passed' },
  { id: 'dedicated-extraction-preview-verified', status: 'passed' },
  { id: 'atomic-create-new-save', status: 'passed' },
  { id: 'saved-output-reopens-with-one-page', status: 'passed' },
  { id: 'normal-and-compact-layouts-without-overflow', status: 'passed' },
  { id: 'source-pdf-bytes-unchanged', status: 'passed', sourceUnchanged },
]
const evidenceFiles = [
  'b2a-range-plan-1280.jpg',
  'b2a-isolated-preview-1280.jpg',
  'b2a-saved-reopen-960.jpg',
]
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  sourceUrl: target.url,
  fixtureLocation: 'isolated temporary workspace',
  sourcePages: 2,
  selectedPages: [2],
  outputPages: 1,
  sourceOverwriteAllowed: false,
  sourceSha256: createHash('sha256').update(sourceAfter).digest('hex'),
  outputSha256: createHash('sha256').update(saved).digest('hex'),
  outputBytes: saved.length,
  viewportMatrix: ['1280x820', '960x720'],
  checks,
  evidenceFiles,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`B2A desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
