import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14421'
const output = path.resolve(process.env.LONGEDIT_UX38D1_AUDIT_OUTPUT || 'docs/evidence/ux38d1-pdf-workspace')
const sourceCommit = process.env.LONGEDIT_UX38D1_SOURCE_COMMIT || ''
const pdfPath = process.env.LONGEDIT_UX38D1_PDF || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !pdfPath) throw new Error('UX-38D1 environment is incomplete')

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

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(pdfPath)})`)
await waitFor(`document.querySelector('.pdf-view .pdf-scroll') && document.querySelectorAll('.pdf-view .page-shell').length === 2 && document.querySelector('.document-title')?.textContent?.includes('UX38D1 PDF Workspace')`, 'PDF workspace')
await delay(700)
const pdfLoaded = true

await evaluate(`(() => { const zoom = [...document.querySelectorAll('.pdf-view button')].find(node => node.title === '放大'); for (let i = 0; i < 12; i += 1) zoom.click(); document.querySelector('.sidebar-switch button:nth-child(2)').click() })()`)
await delay(650)
await evaluate(`(() => { const scroller = document.querySelector('.pdf-scroll'); scroller.scrollTo({ top: 420, left: 110 }); scroller.dispatchEvent(new Event('scroll')) })()`)
await delay(500)
const before = await evaluate(`(() => { const scroller = document.querySelector('.pdf-scroll'); return { top: scroller.scrollTop, left: scroller.scrollLeft, zoom: document.querySelector('.scale-label')?.textContent?.trim(), page: document.querySelector('.page-jump input')?.value, sidebarOpen: Boolean(document.querySelector('.pdf-sidebar')), sidebarTab: document.querySelector('.sidebar-switch button.active')?.textContent?.trim() } })()`)
if (before.top < 150 || before.zoom !== '220%' || !before.sidebarOpen || before.sidebarTab !== '目录') throw new Error(`PDF setup gate failed: ${JSON.stringify(before)}`)
await capture('pdf-workspace-before-graph.jpg')

await evaluate(`location.hash = '#/graph'`)
await waitFor(`document.querySelector('.graph-container .management-back')`, 'knowledge graph')
await evaluate(`document.querySelector('.graph-container .management-back').click()`)
await waitFor(`document.querySelector('.pdf-view .pdf-scroll') && document.querySelectorAll('.pdf-view .page-shell').length === 2`, 'returned PDF workspace')
await delay(900)
const after = await evaluate(`(() => { const scroller = document.querySelector('.pdf-scroll'); return { top: scroller.scrollTop, left: scroller.scrollLeft, zoom: document.querySelector('.scale-label')?.textContent?.trim(), page: document.querySelector('.page-jump input')?.value, sidebarOpen: Boolean(document.querySelector('.pdf-sidebar')), sidebarTab: document.querySelector('.sidebar-switch button.active')?.textContent?.trim(), error: document.querySelector('.pdf-state.error')?.textContent || '' } })()`)
const pdfContextRestored = Math.abs(after.top - before.top) <= 3 && Math.abs(after.left - before.left) <= 3 && after.zoom === before.zoom && after.page === before.page && after.sidebarOpen === before.sidebarOpen && after.sidebarTab === before.sidebarTab && !after.error
if (!pdfContextRestored) throw new Error(`PDF graph return context failed: ${JSON.stringify({ before, after })}`)
await capture('pdf-workspace-after-graph.jpg')

await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(650)
const narrow = await evaluate(`(() => { const root = document.querySelector('.pdf-view').getBoundingClientRect(); const toolbar = document.querySelector('.pdf-toolbar').getBoundingClientRect(); const center = document.querySelector('.toolbar-center').getBoundingClientRect(); return { stable: root.right <= innerWidth + 1 && toolbar.right <= root.right + 1 && center.bottom <= toolbar.bottom + 1 && document.documentElement.scrollWidth <= innerWidth + 2, rootWidth: root.width, toolbarHeight: toolbar.height } })()`)
if (!narrow.stable || narrow.toolbarHeight < 80) throw new Error(`PDF narrow workspace gate failed: ${JSON.stringify(narrow)}`)
await capture('pdf-workspace-narrow.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = {
  schemaVersion: 1, stage: 'UX-38D1', sourceCommit, pdfLoaded, pdfContextRestored,
  narrowWorkspaceStable: narrow.stable, narrowToolbarWrapped: narrow.toolbarHeight >= 80,
  beforeContext: before, afterContext: after,
  runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved,
  sourceUserContentIncluded: false, releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['pdf-workspace-before-graph.jpg', 'pdf-workspace-after-graph.jpg', 'pdf-workspace-narrow.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-38D1', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`UX-38D1 PDF workspace captured with ${runtimeErrors.length} runtime errors.`)
