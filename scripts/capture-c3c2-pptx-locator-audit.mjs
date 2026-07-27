import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const library = path.resolve(process.env.LONGEDIT_C3C2_AUDIT_LIBRARY || '')
const pptx = path.resolve(process.env.LONGEDIT_C3C2_AUDIT_PPTX || '')
const output = path.resolve(process.env.LONGEDIT_C3C2_AUDIT_OUTPUT || 'docs/evidence/c3c2-pptx-locator')
if (!library || !pptx) throw new Error('C3C2 audit paths are required')

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
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const setInput = async (selector, value) => {
  const changed = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!(input instanceof HTMLInputElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error(`Unable to set ${selector}`)
}
const clickResultKind = async kind => {
  const clicked = await evaluate(`(() => {
    const result = [...document.querySelectorAll('.knowledge-search-result')]
      .find(item => item.querySelector('.knowledge-result-head i')?.textContent?.includes(${JSON.stringify(kind)}))
    const button = result?.querySelector('.knowledge-result-open')
    if (!(button instanceof HTMLElement)) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to click the ${kind} knowledge search result`)
}
const locatorToken = () => evaluate(`new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1)).get('locatorToken')`)
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
await evaluate(`location.hash = ${JSON.stringify('#/library')}`)
await waitFor(`document.querySelector('.library-mode') !== null`, 'Library workspace')

const searchInput = '.search-area input[placeholder="搜索文档..."]'
await setInput(searchInput, 'structured slide reading')
await waitFor(
  `document.querySelector('.knowledge-search-result')?.textContent?.toLowerCase().includes('structured slide reading') === true
    && document.querySelector('.knowledge-search-result')?.textContent?.includes('幻灯片 1') === true`,
  'PPTX object search result',
)
await clickResultKind('对象')
try {
  await waitFor(
    `document.querySelector('.library-mode .pptx-workspace') !== null
      && document.querySelector('.slide-object.route-target-object[data-object-id="3"]') !== null
      && document.querySelector('.route-target-status')?.textContent?.includes('幻灯片 1') === true`,
    'embedded PPTX object locator',
  )
} catch (error) {
  await capture('pptx-object-search-location-failure.jpg')
  const state = await evaluate(`({
    hash: location.hash,
    workspace: document.querySelector('.pptx-workspace') !== null,
    activeSlide: document.querySelector('.slide-strip > button.active')?.getAttribute('data-slide-index'),
    targetSlide: document.querySelector('.slide-strip > button.route-target')?.getAttribute('data-slide-index'),
    targetObjects: [...document.querySelectorAll('.route-target-object')].map(item => item.getAttribute('data-object-id')),
    status: document.querySelector('.route-target-status')?.textContent,
    error: document.querySelector('[role="alert"]')?.textContent,
  })`)
  throw new Error(`${error.message}: ${JSON.stringify(state)}`)
}
const firstToken = await locatorToken()
await waitFor(`document.querySelector('.page-loader') === null`, 'object locator route overlay dismissal')
await delay(400)
await capture('pptx-object-search-location.jpg')

await clickResultKind('对象')
try {
  await waitFor(
    `(new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1)).get('locatorToken')) !== ${JSON.stringify(firstToken)}
      && document.querySelector('.slide-object.route-target-object[data-object-id="3"]') !== null`,
    'repeated PPTX locator token and highlight',
  )
} catch (error) {
  const state = await evaluate(`({
    hash: location.hash,
    token: new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1)).get('locatorToken'),
    targetObjects: [...document.querySelectorAll('.route-target-object')].map(item => item.getAttribute('data-object-id')),
    objectResults: [...document.querySelectorAll('.knowledge-search-result')].filter(item =>
      item.querySelector('.knowledge-result-head i')?.textContent?.includes('对象')
    ).length,
  })`)
  throw new Error(`${error.message}: ${JSON.stringify(state)}`)
}
const secondToken = await locatorToken()
await waitFor(`document.querySelector('.page-loader') === null`, 'repeated locator route overlay dismissal')

await setInput(searchInput, 'speaker note evidence')
await waitFor(
  `document.querySelector('.knowledge-search-result')?.textContent?.toLowerCase().includes('speaker note evidence') === true`,
  'PPTX notes search result',
)
await clickResultKind('备注')
await waitFor(
  `document.querySelector('.pptx-details .notes')?.textContent?.toLowerCase().includes('speaker note evidence') === true
    && document.querySelector('.route-target-status')?.textContent?.includes('备注') === true`,
  'PPTX notes locator and details panel',
)
await waitFor(`document.querySelector('.page-loader') === null`, 'notes locator route overlay dismissal')
await delay(400)
await capture('pptx-notes-search-location.jpg')

const sourceUnchanged = Buffer.compare(original, await fs.readFile(pptx)) === 0
if (!sourceUnchanged) throw new Error('C3C2 audit modified the source PPTX')
const evidenceFiles = [
  'pptx-object-search-location.jpg',
  'pptx-notes-search-location.jpg',
]
const checks = [
  { id: 'pptx-search-opens-in-library-workspace', status: 'passed' },
  { id: 'pptx-object-location-and-repeat-token', status: 'passed', firstToken, secondToken },
  { id: 'pptx-notes-location-and-source-unchanged', status: 'passed', sourceUnchanged },
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
console.log(`C3C2 desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
