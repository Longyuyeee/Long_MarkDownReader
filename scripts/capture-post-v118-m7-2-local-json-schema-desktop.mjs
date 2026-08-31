import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14733'
const library = process.env.LONGEDIT_M7_2_LIBRARY
const output = process.env.LONGEDIT_M7_2_OUTPUT
if (!library || !output) throw new Error('M7-2 audit paths are missing')
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const documentPath = path.join(library, 'service-settings.jsonc')
const schemaPath = path.join(library, 'service-settings.schema.json')
const documentSource = '{\n  // M7-2 source must remain unchanged\n  "port": "secret-port",\n  "enabled": "secret-enabled",\n}\n'
const rejectingSchema = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { port: { type: 'integer' }, enabled: { type: 'boolean' } },
  required: ['port', 'enabled'],
}, null, 2)}\n`
const acceptingSchema = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { port: { type: 'string' }, enabled: { type: 'string' } },
  required: ['port', 'enabled'],
}, null, 2)}\n`
await fs.mkdir(output, { recursive: true })
await fs.writeFile(documentPath, documentSource)
const documentBefore = await sha256(documentPath)

const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'WebView log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  clearTimeout(request.timer)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 30_000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const waitFor = async (expression, description, attempts = 160) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({ text: document.body?.innerText?.slice(0, 1800), errors: ${JSON.stringify(runtimeErrors)} })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const resize = async (width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await delay(300)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const schemaState = () => evaluate(`(() => ({
  label: document.querySelector('[data-testid="json-schema-panel"] .diagnostic-heading span')?.textContent?.trim(),
  source: document.querySelector('[data-testid="json-schema-panel"] .schema-source')?.textContent?.trim(),
  diagnostics: [...document.querySelectorAll('[data-testid="json-schema-panel"] .schema-diagnostic')].map(item => item.textContent?.trim()),
  message: document.querySelector('[data-testid="json-schema-panel"] .schema-state')?.textContent?.trim(),
  overflow: document.documentElement.scrollWidth - innerWidth,
}))()`)

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await resize(1280, 800)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'app bootstrap')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(documentPath)})`)
await waitFor(`document.querySelector('[data-testid="json-workspace"]') && document.querySelector('.loading-state') === null`, 'JSONC workspace')
await waitFor(`document.querySelector('[data-testid="json-schema-panel"] .diagnostic-heading span')?.textContent?.trim() === '未配置'`, 'no-schema state')
const noSchema = await schemaState()

await fs.writeFile(schemaPath, rejectingSchema)
const rejectingHash = await sha256(schemaPath)
await waitFor(`document.querySelectorAll('[data-testid="json-schema-panel"] .schema-diagnostic').length === 2`, 'sidecar invalid diagnostics')
const invalid = await schemaState()
await evaluate(`([...document.querySelectorAll('[data-testid="json-schema-panel"] .schema-diagnostic')].find(item => item.textContent?.includes('$.port')))?.click()`)
await waitFor(`document.querySelector('.json-statusbar')?.textContent?.includes('行 3，列')`, 'schema diagnostic source reveal')
const revealStatus = await evaluate(`document.querySelector('.json-statusbar')?.textContent?.trim()`)
await capture('m7-2-schema-invalid-wide.jpg')

await fs.writeFile(schemaPath, acceptingSchema)
await waitFor(`document.querySelector('[data-testid="json-schema-panel"] .diagnostic-heading span')?.textContent?.trim() === '通过'`, 'sidecar hot refresh valid state')
await resize(720, 680)
await evaluate(`([...document.querySelectorAll('.editor-actions button[aria-pressed]')].at(-1))?.click()`)
await waitFor(`document.querySelector('[data-testid="json-schema-panel"]')?.getBoundingClientRect().width > 100`, 'narrow schema inspector visibility')
await evaluate(`document.querySelector('[data-testid="json-schema-panel"]')?.scrollIntoView({ block: 'start' })`)
await waitFor(`(() => {
  const panel = document.querySelector('[data-testid="json-schema-panel"]')
  if (!panel) return false
  const rect = panel.getBoundingClientRect()
  return rect.top >= 0 && rect.top < window.innerHeight - 120
})()`, 'narrow schema panel in viewport')
const validNarrow = await schemaState()
await capture('m7-2-schema-valid-narrow.jpg')

await fs.writeFile(schemaPath, '{')
await waitFor(`document.querySelector('[data-testid="json-schema-panel"] .diagnostic-heading span')?.textContent?.trim() === 'Schema 不可用'`, 'damaged schema state')
const damaged = await schemaState()
await fs.writeFile(schemaPath, rejectingSchema)
await waitFor(`document.querySelectorAll('[data-testid="json-schema-panel"] .schema-diagnostic').length === 2`, 'restored schema state')

const actual = {
  noSchema,
  invalid,
  revealStatus,
  validNarrow,
  damaged,
  documentUnchanged: documentBefore === await sha256(documentPath),
  restoredSchemaUnchanged: rejectingHash === await sha256(schemaPath),
  runtimeErrorCount: runtimeErrors.length,
  viewportMatrix: ['1280x800', '720x680'],
}
const passed = noSchema.label === '未配置'
  && noSchema.diagnostics.length === 0
  && invalid.label === '2 个错误'
  && invalid.diagnostics.length === 2
  && invalid.diagnostics.every(item => !item.includes('secret-port') && !item.includes('secret-enabled'))
  && revealStatus.includes('行 3，列')
  && validNarrow.label === '通过'
  && validNarrow.overflow <= 0
  && damaged.label === 'Schema 不可用'
  && damaged.message.includes('不是有效的严格 JSON')
  && actual.documentUnchanged
  && actual.restoredSchemaUnchanged
  && actual.runtimeErrorCount === 0
if (!passed) throw new Error(`M7-2 desktop gate failed: ${JSON.stringify(actual)}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'M7-2-bounded-local-json-schema-product-implementation-and-real-desktop-audit',
  status: 'passed',
  expected: {
    optionalSidecarZeroDiagnostics: true,
    sidecarHotRefresh: true,
    diagnosticSourceReveal: true,
    maskedDocumentValues: true,
    damagedSchemaFailsClosed: true,
    sourceAndSchemaBytesUnchangedAfterRestore: true,
    responsiveViewports: [1280, 720],
    runtimeErrors: 0
  },
  actual,
  screenshots: ['m7-2-schema-invalid-wide.jpg', 'm7-2-schema-valid-narrow.jpg'],
  sourceUserContentIncluded: false,
  passed,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log('M7-2 real Tauri local JSON Schema desktop audit passed.')
