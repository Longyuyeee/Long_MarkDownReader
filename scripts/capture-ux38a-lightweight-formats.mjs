import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14390'
const output = path.resolve(process.env.LONGEDIT_UX38A_AUDIT_OUTPUT || 'docs/evidence/ux38a-lightweight-formats')
const sourceCommit = process.env.LONGEDIT_UX38A_SOURCE_COMMIT || ''
const samples = JSON.parse(process.env.LONGEDIT_UX38A_SAMPLES || '[]')
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || samples.length !== 24) throw new Error('UX-38A environment is incomplete')

const surfaces = {
  markdown: { root: '.library-mode', ready: '#vditor-lib .vditor-content' },
  'plain-text': { root: '.text-workspace', ready: '.text-workspace .cm-editor' },
  env: { root: '.text-workspace', ready: '.text-workspace .cm-editor' }, ini: { root: '.text-workspace', ready: '.text-workspace .cm-editor' },
  properties: { root: '.text-workspace', ready: '.text-workspace .cm-editor' }, editorconfig: { root: '.text-workspace', ready: '.text-workspace .cm-editor' },
  gitignore: { root: '.text-workspace', ready: '.text-workspace .cm-editor' }, javascript: { root: '.text-workspace', ready: '.text-workspace .cm-editor' },
  typescript: { root: '.text-workspace', ready: '.text-workspace .cm-editor' }, python: { root: '.text-workspace', ready: '.text-workspace .cm-editor' },
  rust: { root: '.text-workspace', ready: '.text-workspace .cm-editor' }, go: { root: '.text-workspace', ready: '.text-workspace .cm-editor' },
  'jvm-code': { root: '.text-workspace', ready: '.text-workspace .cm-editor' }, 'c-family': { root: '.text-workspace', ready: '.text-workspace .cm-editor' },
  shell: { root: '.text-workspace', ready: '.text-workspace .cm-editor' }, sql: { root: '.text-workspace', ready: '.text-workspace .cm-editor' },
  'web-source': { root: '.text-workspace', ready: '.text-workspace .cm-editor' }, json: { root: '.json-workspace', ready: '.json-workspace .cm-editor' },
  log: { root: '.log-workspace', ready: '.log-workspace .log-stage' }, jsonc: { root: '.json-workspace', ready: '.json-workspace .cm-editor' },
  yaml: { root: '.yaml-workspace', ready: '.yaml-workspace .cm-editor' }, xml: { root: '.xml-workspace', ready: '.xml-workspace .cm-editor' },
  svg: { root: '.xml-workspace', ready: '.xml-workspace .cm-editor' }, toml: { root: '.toml-workspace', ready: '.toml-workspace .cm-editor' },
}
const screenshotIds = new Set(['plain-text', 'javascript', 'json', 'yaml', 'log'])
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })

let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async name => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64'))
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')

const results = []
for (const sample of samples) {
  const surface = surfaces[sample.id]
  if (!surface) throw new Error(`No surface contract for ${sample.id}`)
  const started = performance.now()
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(sample.path)})`)
  const identityExpression = sample.id === 'markdown'
    ? `document.querySelector('.workspace-tab.active')?.textContent?.includes('UX38A-markdown') === true`
    : `document.querySelector(${JSON.stringify(surface.root)})?.textContent?.includes(${JSON.stringify(sample.file)}) === true`
  await waitFor(`document.querySelector(${JSON.stringify(surface.root)})
    && document.querySelector(${JSON.stringify(surface.ready)})
    && ${identityExpression}
    && !document.querySelector('.page-loader')
    && !document.querySelector(${JSON.stringify(`${surface.root} .editor-state.error, ${surface.root} .state.error`)})`, `${sample.id} editor`)
  await delay(450)
  const inspected = await evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(surface.root)})
    const rect = root.getBoundingClientRect()
    const activeTab = document.querySelector('.workspace-tab.active')
    const requestedPath = new URLSearchParams(location.hash.split('?')[1] || '').get('path')
    return {
      rootVisible: rect.width > 0 && rect.height > 0,
      rootWithinViewport: rect.left >= -2 && rect.top >= -2 && rect.right <= innerWidth + 2 && rect.bottom <= innerHeight + 2,
      pageOverflowX: document.documentElement.scrollWidth > innerWidth + 2,
      identityVisible: ${identityExpression},
      activeTabVisible: Boolean(activeTab),
      theme: document.body.dataset.theme,
      blockingError: Boolean(document.querySelector('.n-modal-mask, .error-boundary')),
      loadingOverlayVisible: Boolean(document.querySelector('.page-loader')),
      route: location.hash.split('?')[0],
      managedPathMatched: requestedPath === ${JSON.stringify(sample.path)},
    }
  })()`)
  const loadMilliseconds = Math.round(performance.now() - started)
  if (!inspected.rootVisible || !inspected.rootWithinViewport || inspected.pageOverflowX || !inspected.identityVisible || !inspected.activeTabVisible || inspected.theme !== 'white' || inspected.blockingError || inspected.loadingOverlayVisible || !inspected.managedPathMatched || loadMilliseconds > 5000) {
    throw new Error(`UX-38A gate failed for ${sample.id}: ${JSON.stringify({ loadMilliseconds, ...inspected })}`)
  }
  results.push({ id: sample.id, file: sample.file, loadMilliseconds, ...inspected })
  if (screenshotIds.has(sample.id)) await capture(`${sample.id}-workspace.jpg`)
}

const evidence = {
  schemaVersion: 1, stage: 'UX-38A', sourceCommit, formatCount: samples.length, passedFormatCount: results.length,
  maxLoadMilliseconds: Math.max(...results.map(result => result.loadMilliseconds)), results,
  runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved: results.some(result => result.blockingError),
  sourceUserContentIncluded: false, releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = [...screenshotIds].map(id => `${id}-workspace.jpg`)
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1, stage: 'UX-38A', status: 'captured-pending-visual-review', sourceCommit,
  evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots,
  sourceUserContentIncluded: false, releaseCandidate: false,
}, null, 2)}\n`)
socket.close()
console.log(`UX-38A captured ${results.length} lightweight format routes with ${runtimeErrors.length} runtime errors.`)
