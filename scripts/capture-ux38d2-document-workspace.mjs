import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14422'
const output = path.resolve(process.env.LONGEDIT_UX38D2_AUDIT_OUTPUT || 'docs/evidence/ux38d2-document-workspace')
const sourceCommit = process.env.LONGEDIT_UX38D2_SOURCE_COMMIT || ''
const docxPath = process.env.LONGEDIT_UX38D2_DOCX || ''
const odtPath = process.env.LONGEDIT_UX38D2_ODT || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !docxPath || !odtPath) throw new Error('UX-38D2 environment is incomplete')

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
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description, attempts = 300) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }
const graphRoundTrip = async (rootSelector, stageSelector, before) => {
  await evaluate(`location.hash = '#/graph'`)
  await waitFor(`document.querySelector('.graph-container .management-back')`, 'knowledge graph')
  await evaluate(`document.querySelector('.graph-container .management-back').click()`)
  await waitFor(`document.querySelector(${JSON.stringify(rootSelector)}) && document.querySelector(${JSON.stringify(stageSelector)})`, `returned ${rootSelector}`)
  await delay(800)
  const after = await evaluate(`(() => { const stage = document.querySelector(${JSON.stringify(stageSelector)}); return { top: stage.scrollTop, left: stage.scrollLeft } })()`)
  return { before, after, restored: Math.abs(after.top - before.top) <= 3 && Math.abs(after.left - before.left) <= 3 }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')

await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(docxPath)})`)
await waitFor(`document.querySelector('.docx-workspace .docx-stage') && document.querySelector('.docx-page') && document.querySelector('.document-title')?.textContent?.includes('UX38D2 LibreOffice Document')`, 'DOCX workspace')
await delay(600)
const docxLoaded = true
await evaluate(`[...document.querySelectorAll('.docx-workspace .toolbar-actions button')].find(node => (node.getAttribute('aria-label') || node.getAttribute('data-app-tooltip') || node.title) === '打开 DOCX 页面编辑')?.click()`)
await waitFor(`document.querySelector('.docx-editor')`, 'DOCX editor panel')
await evaluate(`(() => { const stage = document.querySelector('.docx-stage'); stage.scrollTo({ top: Math.min(260, stage.scrollHeight - stage.clientHeight), left: 0 }); stage.dispatchEvent(new Event('scroll')) })()`)
await delay(350)
const docxBefore = await evaluate(`(() => { const stage = document.querySelector('.docx-stage'); return { top: stage.scrollTop, left: stage.scrollLeft, editorOpen: Boolean(document.querySelector('.docx-editor')), explicitSave: document.querySelector('.document-title')?.textContent?.includes('点击保存才写入') === true } })()`)
if (docxBefore.top < 20 || !docxBefore.editorOpen || !docxBefore.explicitSave) throw new Error(`DOCX setup gate failed: ${JSON.stringify(docxBefore)}`)
await capture('docx-editor-before-graph.jpg')
const docxTrip = await graphRoundTrip('.docx-workspace', '.docx-stage', docxBefore)
const docxContextRestored = docxTrip.restored && await evaluate(`Boolean(document.querySelector('.docx-editor'))`)
if (!docxContextRestored) throw new Error(`DOCX context restore failed: ${JSON.stringify(docxTrip)}`)

await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(600)
const docxNarrow = await evaluate(`(() => { const root = document.querySelector('.docx-workspace').getBoundingClientRect(); const toolbar = document.querySelector('.docx-toolbar').getBoundingClientRect(); const editor = document.querySelector('.docx-editor').getBoundingClientRect(); return { stable: root.right <= innerWidth + 1 && toolbar.right <= root.right + 1 && editor.right <= root.right + 1 && editor.left >= root.left - 1 && document.documentElement.scrollWidth <= innerWidth + 2, toolbarHeight: toolbar.height } })()`)
if (!docxNarrow.stable || docxNarrow.toolbarHeight < 80) throw new Error(`DOCX narrow gate failed: ${JSON.stringify(docxNarrow)}`)
await capture('docx-narrow-editor.jpg')

await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 800, deviceScaleFactor: 1, mobile: false })
await evaluate(`location.hash = '#/odt?path=' + encodeURIComponent(${JSON.stringify(odtPath)})`)
await waitFor(`document.querySelector('.odt-workspace .odt-stage') && document.querySelector('.odt-page') && document.querySelector('.document-identity')?.textContent?.includes('UX38D2 LibreOffice Document')`, 'ODT workspace')
await delay(500)
const odtLoaded = true
await evaluate(`(() => { const stage = document.querySelector('.odt-stage'); stage.scrollTo({ top: Math.min(260, stage.scrollHeight - stage.clientHeight), left: 0 }); stage.dispatchEvent(new Event('scroll')) })()`)
await delay(300)
const odtBefore = await evaluate(`(() => { const stage = document.querySelector('.odt-stage'); return { top: stage.scrollTop, left: stage.scrollLeft, readonly: document.querySelector('.document-identity')?.textContent?.includes('只读') === true } })()`)
if (odtBefore.top < 20 || !odtBefore.readonly) throw new Error(`ODT setup gate failed: ${JSON.stringify(odtBefore)}`)
await evaluate(`location.hash = '#/graph'`)
await waitFor(`document.querySelector('.graph-container')`, 'knowledge graph from ODT preview route')
await evaluate(`history.back()`)
await waitFor(`document.querySelector('.odt-workspace .odt-stage')`, 'returned ODT preview route')
await delay(800)
const odtAfter = await evaluate(`(() => { const stage = document.querySelector('.odt-stage'); return { top: stage.scrollTop, left: stage.scrollLeft } })()`)
const odtDirectRouteContextRestored = Math.abs(odtAfter.top - odtBefore.top) <= 3 && Math.abs(odtAfter.left - odtBefore.left) <= 3
if (!odtDirectRouteContextRestored) throw new Error(`ODT direct-route context restore failed: ${JSON.stringify({ odtBefore, odtAfter })}`)

await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(600)
const odtNarrow = await evaluate(`(() => { const root = document.querySelector('.odt-workspace').getBoundingClientRect(); const toolbar = document.querySelector('.odt-toolbar').getBoundingClientRect(); return { stable: root.right <= innerWidth + 1 && toolbar.right <= root.right + 1 && !document.querySelector('.odt-outline')?.checkVisibility() && document.documentElement.scrollWidth <= innerWidth + 2, toolbarHeight: toolbar.height } })()`)
if (!odtNarrow.stable) throw new Error(`ODT narrow gate failed: ${JSON.stringify(odtNarrow)}`)
await capture('odt-narrow-return.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = {
  schemaVersion: 1, stage: 'UX-38D2', sourceCommit, docxLoaded, odtLoaded, docxContextRestored, odtDirectRouteContextRestored,
  docxExplicitSaveBoundary: docxBefore.explicitSave, odtReadonlyBoundary: odtBefore.readonly,
  odtManagedRegistration: false, odtProducerGate: '2/3',
  docxNarrowStable: docxNarrow.stable, odtNarrowStable: odtNarrow.stable,
  runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved, sourceUserContentIncluded: false, releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['docx-editor-before-graph.jpg', 'docx-narrow-editor.jpg', 'odt-narrow-return.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-38D2', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`UX-38D2 document workspace captured with ${runtimeErrors.length} runtime errors.`)
