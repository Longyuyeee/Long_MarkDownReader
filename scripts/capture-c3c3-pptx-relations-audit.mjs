import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const pptx = path.resolve(process.env.LONGEDIT_C3C3_AUDIT_PPTX || '')
const output = path.resolve(process.env.LONGEDIT_C3C3_AUDIT_OUTPUT || 'docs/evidence/c3c3-pptx-relations')
if (!pptx) throw new Error('C3C3 audit PPTX path is required')

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
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
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
await waitFor(
  `document.querySelector('.pptx-workspace') !== null
    && document.querySelector('.slide-strip > button.active')?.getAttribute('data-slide-index') === '0'`,
  'first PPTX slide in shared Library workspace',
)
await evaluate(`document.querySelector('.relation-context-trigger')?.click()`)
await waitFor(
  `document.querySelector('.relation-context-panel header small')?.textContent?.includes('幻灯片上下文') === true
    && document.querySelector('.relation-context-panel header strong')?.textContent?.includes('PowerPoint Producer Fixture') === true
    && document.querySelector('.relation-card')?.textContent?.includes('包含') === true`,
  'first slide object relation context',
)
await delay(350)
await capture('pptx-slide-1-relation-context.jpg')

await evaluate(`document.querySelector('.slide-strip > button[data-slide-index="1"]')?.click()`)
try {
  await waitFor(
    `document.querySelector('.slide-strip > button.active')?.getAttribute('data-slide-index') === '1'
      && document.querySelector('.relation-context-panel header strong')?.textContent?.includes('Images and relationships') === true
      && document.querySelector('.relation-card')?.textContent?.includes('包含') === true`,
    'second slide object relation context',
  )
} catch (error) {
  const state = await evaluate(`({
    activeSlide: document.querySelector('.slide-strip > button.active')?.getAttribute('data-slide-index'),
    contextLabel: document.querySelector('.relation-context-panel header small')?.textContent,
    contextTitle: document.querySelector('.relation-context-panel header strong')?.textContent,
    relation: document.querySelector('.relation-card')?.textContent,
    alert: document.querySelector('[role="alert"]')?.textContent,
  })`)
  throw new Error(`${error.message}: ${JSON.stringify(state)}`)
}
await delay(350)
await capture('pptx-slide-2-relation-context.jpg')

const centered = await evaluate(`document.querySelector('.context-actions button')?.textContent?.includes('以当前幻灯片为中心') === true`)
if (!centered) throw new Error('PPTX slide context did not expose object-centered graph navigation')
const sourceUnchanged = Buffer.compare(original, await fs.readFile(pptx)) === 0
if (!sourceUnchanged) throw new Error('C3C3 audit modified the source PPTX')
const evidenceFiles = [
  'pptx-slide-1-relation-context.jpg',
  'pptx-slide-2-relation-context.jpg',
]
const checks = [
  { id: 'pptx-slide-is-a-knowledge-object', status: 'passed' },
  { id: 'slide-selection-updates-shared-relation-context', status: 'passed' },
  { id: 'slide-centered-graph-action-and-source-unchanged', status: 'passed', sourceUnchanged },
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
console.log(`C3C3 desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
