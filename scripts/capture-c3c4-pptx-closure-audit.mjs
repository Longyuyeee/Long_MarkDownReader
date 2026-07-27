import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const pptx = path.resolve(process.env.LONGEDIT_C3C4_AUDIT_PPTX || '')
const output = path.resolve(process.env.LONGEDIT_C3C4_AUDIT_OUTPUT || 'docs/evidence/c3c4-pptx-closure')
if (!pptx) throw new Error('C3C4 audit PPTX path is required')

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
const setInput = async value => {
  const selector = '.search-area input'
  const changed = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!(input instanceof HTMLInputElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error('Unable to set Library search input')
}
const clickTitle = async title => {
  const clicked = await evaluate(`(() => {
    const button = document.querySelector('button[title=${JSON.stringify(title)}]')
    if (!(button instanceof HTMLElement)) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to click ${title}`)
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
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 820,
  deviceScaleFactor: 1,
  mobile: false,
})
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
await waitFor(`document.querySelector('.page-loader') === null`, 'initial route')
const original = await fs.readFile(pptx)
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(pptx)})`)
await waitFor(`document.querySelector('.pptx-workspace') !== null`, 'PPTX Library workspace')
await waitFor(`document.querySelector('.knowledge-index-strip.state-missing') !== null`, 'missing index state')

await setInput('structured slide reading')
await waitFor(
  `document.querySelector('.knowledge-search-result')?.textContent?.toLowerCase().includes('structured slide reading') === true`,
  'live fallback before index build',
)
await clickTitle('重建知识索引')
await waitFor(
  `document.querySelector('.knowledge-index-strip.state-ready')?.textContent?.includes('4 对象') === true
    && document.querySelector('.knowledge-index-strip.state-ready')?.textContent?.includes('3 关系') === true`,
  'ready PPTX index with object and relation counts',
)
await capture('pptx-index-ready-search.jpg')

const opened = await evaluate(`(() => {
  const result = [...document.querySelectorAll('.knowledge-search-result')]
    .find(item => item.querySelector('.knowledge-result-head i')?.textContent?.includes('对象'))
  const button = result?.querySelector('.knowledge-result-open')
  if (!(button instanceof HTMLElement)) return false
  button.click()
  return true
})()`)
if (!opened) throw new Error('Unable to open PPTX object result')
await waitFor(
  `document.querySelector('.pptx-workspace') !== null
    && document.querySelector('.slide-object.route-target-object') !== null`,
  'precise PPTX object locator',
)
await evaluate(`document.querySelector('.relation-context-trigger')?.click()`)
await waitFor(
  `document.querySelector('.relation-context-panel header small')?.textContent?.includes('幻灯片上下文') === true
    && document.querySelector('.relation-card')?.textContent?.includes('包含') === true`,
  'PPTX relation context',
)
await evaluate(`document.querySelector('.context-actions button')?.click()`)
await waitFor(
  `document.querySelector('.graph-container') !== null
    && document.querySelector('.node-details h3')?.textContent?.includes('PowerPoint Producer Fixture') === true
    && document.querySelector('.details-relations') !== null`,
  'slide-centered graph',
)
await delay(400)
await capture('pptx-slide-centered-graph.jpg')

await evaluate(`document.querySelector('.node-details .primary-action')?.click()`)
await waitFor(
  `document.querySelector('.pptx-workspace') !== null
    && document.querySelector('.slide-strip > button.active')?.getAttribute('data-slide-index') === '0'`,
  'graph return to PPTX slide',
)

const changedTime = new Date(Date.now() + 60_000)
await fs.utimes(pptx, changedTime, changedTime)
await setInput('speaker note evidence')
await waitFor(
  `document.querySelector('.knowledge-index-strip.state-stale') !== null
    && document.querySelector('.knowledge-search-result')?.textContent?.toLowerCase().includes('speaker note evidence') === true`,
  'stale state with live fallback',
)
await capture('pptx-index-stale-live-fallback.jpg')

await clickTitle('重建知识索引')
await waitFor(`document.querySelector('.knowledge-index-strip.state-ready') !== null`, 'rebuilt ready index')
await evaluate(`window.confirm = () => true`)
await clickTitle('删除本地索引')
await waitFor(`document.querySelector('.knowledge-index-strip.state-missing') !== null`, 'deleted index state')
await setInput('')
await setInput('structured slide reading')
await waitFor(
  `document.querySelector('.knowledge-index-strip.state-missing') !== null
    && document.querySelector('.knowledge-search-result')?.textContent?.toLowerCase().includes('structured slide reading') === true`,
  'missing index live fallback',
)
await capture('pptx-index-deleted-live-fallback.jpg')

const sourceUnchanged = Buffer.compare(original, await fs.readFile(pptx)) === 0
if (!sourceUnchanged) throw new Error('C3C4 audit modified the source PPTX bytes')
const evidenceFiles = [
  'pptx-index-ready-search.jpg',
  'pptx-slide-centered-graph.jpg',
  'pptx-index-stale-live-fallback.jpg',
  'pptx-index-deleted-live-fallback.jpg',
]
const checks = [
  { id: 'missing-index-uses-live-pptx-fallback', status: 'passed' },
  { id: 'rebuild-persists-pptx-objects-and-relations', status: 'passed' },
  { id: 'search-locator-relation-graph-return-closes', status: 'passed' },
  { id: 'stale-index-is-visible-and-falls-back-live', status: 'passed' },
  { id: 'deleted-index-falls-back-with-source-bytes-unchanged', status: 'passed', sourceUnchanged },
]
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  sourceUrl: target.url,
  fixtureLocation: 'isolated temporary workspace',
  checks,
  evidenceFiles,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`C3C4 desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
