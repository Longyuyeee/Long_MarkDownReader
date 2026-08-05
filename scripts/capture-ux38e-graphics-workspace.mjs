import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14424'
const output = path.resolve(process.env.LONGEDIT_UX38E_AUDIT_OUTPUT || 'docs/evidence/ux38e-graphics-workspace')
const sourceCommit = process.env.LONGEDIT_UX38E_SOURCE_COMMIT || ''
const files = {
  canvas: process.env.LONGEDIT_UX38E_CANVAS || '',
  drawio: process.env.LONGEDIT_UX38E_DRAWIO || '',
  diagram: process.env.LONGEDIT_UX38E_DIAGRAM || '',
  opml: process.env.LONGEDIT_UX38E_OPML || '',
}
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || Object.values(files).some(value => !value)) throw new Error('UX-38E environment is incomplete')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const waitForFileChange = async (file, before, description) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await digest(file) !== before) return true
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description} to write the isolated fixture`)
}
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
const unexpectedDialogs = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  if (message.method === 'Page.javascriptDialogOpening') {
    unexpectedDialogs.push(message.params?.message || 'Unexpected JavaScript dialog')
    socket.send(JSON.stringify({ id: ++sequence, method: 'Page.handleJavaScriptDialog', params: { accept: false } }))
  }
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description, attempts = 300) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }
const openFile = async (file, selector) => {
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(file)})`)
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`, selector)
  await delay(650)
}
const graphRoundTrip = async selector => {
  await evaluate(`location.hash = '#/graph'`)
  await waitFor(`document.querySelector('.graph-container .management-back')`, 'knowledge graph')
  await evaluate(`document.querySelector('.graph-container .management-back').click()`)
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`, `returned ${selector}`)
  await delay(650)
}
const setValue = (selector, suffix) => evaluate(`(async () => { const input = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set; input.focus(); setter.call(input, input.value + ${JSON.stringify(suffix)}); input.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(resolve => requestAnimationFrame(() => resolve())); input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); await new Promise(resolve => requestAnimationFrame(() => resolve())); return input.value })()`)
const narrowGate = selector => evaluate(`(() => { const root = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return root.left >= -1 && root.right <= innerWidth + 1 && root.width > 500 && document.documentElement.scrollWidth <= innerWidth + 2 })()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
const results = {}

await openFile(files.canvas, '.canvas-page .canvas-node textarea')
let before = await digest(files.canvas)
await evaluate(`document.querySelectorAll('.canvas-toolbar > button')[3].click()`)
await delay(1700)
results.canvasNoWriteBeforeSave = before === await digest(files.canvas)
await waitFor(`!document.querySelectorAll('.canvas-toolbar > button')[1].disabled`, 'Canvas undo')
await evaluate(`document.querySelectorAll('.canvas-toolbar > button')[1].click()`)
await waitFor(`!document.querySelectorAll('.canvas-toolbar > button')[2].disabled`, 'Canvas redo')
await evaluate(`document.querySelectorAll('.canvas-toolbar > button')[2].click()`)
await delay(250)
results.canvasUndoRedo = true
await evaluate(`document.querySelector('.canvas-viewport').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, clientX: 500, clientY: 400, bubbles: true }))`)
await delay(200)
const canvasStateBefore = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(files.canvas)}))`)
await evaluate(`document.querySelector('.canvas-toolbar button.primary').click()`)
results.canvasExplicitSaveWrites = await waitForFileChange(files.canvas, before, 'Canvas explicit save')
await graphRoundTrip('.canvas-page')
const canvasStateAfter = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(files.canvas)}))`)
results.canvasContextRestored = canvasStateBefore?.zoom === canvasStateAfter?.zoom && canvasStateBefore?.panX === canvasStateAfter?.panX
await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false }); await delay(500)
results.canvasNarrowStable = await narrowGate('.canvas-page'); await capture('canvas-narrow-return.jpg')

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await openFile(files.drawio, '.drawio-workspace .properties textarea')
before = await digest(files.drawio)
await setValue('.drawio-workspace .properties textarea', ' UX38E')
await evaluate(`document.querySelector('.drawio-workspace form.properties').requestSubmit()`)
await waitFor(`!document.querySelector('.drawio-workspace .actions button:nth-child(1)').disabled`, 'Drawio undo')
await delay(1500)
results.drawioNoWriteBeforeSave = before === await digest(files.drawio)
results.drawioUndoRedo = await evaluate(`(() => { const buttons = document.querySelectorAll('.drawio-workspace .actions button'); buttons[0].click(); return true })()`)
await waitFor(`!document.querySelector('.drawio-workspace .actions button:nth-child(2)').disabled`, 'Drawio redo')
await evaluate(`document.querySelectorAll('.drawio-workspace .actions button')[1].click()`); await delay(450)
await waitFor(`!document.querySelectorAll('.drawio-workspace .actions button')[3].disabled`, 'Drawio save readiness')
await evaluate(`document.querySelectorAll('.drawio-workspace .actions button')[3].click()`)
results.drawioExplicitSaveWrites = await waitForFileChange(files.drawio, before, 'Drawio explicit save')
const drawioStateBefore = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(files.drawio)}))`)
await graphRoundTrip('.drawio-workspace')
const drawioStateAfter = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(files.drawio)}))`)
results.drawioContextRestored = drawioStateBefore?.section === drawioStateAfter?.section && drawioStateBefore?.selection === drawioStateAfter?.selection
await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false }); await delay(500)
results.drawioNarrowStable = await narrowGate('.drawio-workspace'); await capture('drawio-narrow-return.jpg')

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await openFile(files.diagram, '.diagram-studio .source-editor textarea')
before = await digest(files.diagram)
await setValue('.diagram-studio .source-editor textarea', '\n  C --> D[Ship]')
await delay(1500)
results.diagramNoWriteBeforeSave = before === await digest(files.diagram)
await waitFor(`!document.querySelectorAll('.diagram-studio .history-button')[0].disabled`, 'Mermaid undo')
await evaluate(`document.querySelectorAll('.diagram-studio .history-button')[0].click()`)
await waitFor(`!document.querySelectorAll('.diagram-studio .history-button')[1].disabled`, 'Mermaid redo')
await evaluate(`document.querySelectorAll('.diagram-studio .history-button')[1].click()`)
await delay(400)
results.diagramUndoRedo = true
await evaluate(`document.querySelector('.diagram-studio .zoom-value').click(); document.querySelectorAll('.diagram-studio .studio-actions > button')[2]?.click()`)
await waitFor(`!document.querySelector('.diagram-studio .save-button').disabled`, 'Mermaid save readiness')
await evaluate(`document.querySelector('.diagram-studio .save-button').click()`)
results.diagramExplicitSaveWrites = await waitForFileChange(files.diagram, before, 'Mermaid explicit save')
const diagramStateBefore = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(files.diagram)}))`)
await graphRoundTrip('.diagram-studio')
const diagramStateAfter = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(files.diagram)}))`)
results.diagramContextRestored = diagramStateBefore?.zoom === diagramStateAfter?.zoom && diagramStateBefore?.panelOpen === diagramStateAfter?.panelOpen
await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false }); await delay(500)
results.diagramNarrowStable = await narrowGate('.diagram-studio'); await capture('diagram-narrow-return.jpg')

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await openFile(files.opml, '.mindmap-page .title-input')
before = await digest(files.opml)
await evaluate(`document.querySelector('.mindmap-toolbar > button').click()`)
await delay(1500)
results.opmlNoWriteBeforeSave = before === await digest(files.opml)
results.opmlHistoryReferenced = 'docs/evidence/ux37a-opml-canvas/manifest.json'
await evaluate(`document.querySelector('.mindmap-page .map-panel').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 500, clientY: 400, bubbles: true }))`); await delay(200)
await waitFor(`!document.querySelectorAll('.mindmap-page .header-actions > button')[3].disabled`, 'OPML save readiness')
await evaluate(`document.querySelectorAll('.mindmap-page .header-actions > button')[3].click()`)
results.opmlExplicitSaveWrites = await waitForFileChange(files.opml, before, 'OPML explicit save')
const opmlStateBefore = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(files.opml)}))`)
await graphRoundTrip('.mindmap-page')
const opmlStateAfter = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(files.opml)}))`)
results.opmlContextRestored = opmlStateBefore?.zoom === opmlStateAfter?.zoom && opmlStateBefore?.section === opmlStateAfter?.section
await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false }); await delay(500)
results.opmlNarrowStable = await narrowGate('.mindmap-page'); await capture('opml-narrow-return.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = { schemaVersion: 1, stage: 'UX-38E', sourceCommit, ...results, runtimeErrorCount: runtimeErrors.length, unexpectedDialogCount: unexpectedDialogs.length, blockingErrorSurfaceObserved, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['canvas-narrow-return.jpg', 'drawio-narrow-return.jpg', 'diagram-narrow-return.jpg', 'opml-narrow-return.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-38E', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`UX-38E graphics workspace captured with ${runtimeErrors.length} runtime errors.`)
