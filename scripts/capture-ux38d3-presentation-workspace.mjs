import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14423'
const output = path.resolve(process.env.LONGEDIT_UX38D3_AUDIT_OUTPUT || 'docs/evidence/ux38d3-presentation-workspace')
const sourceCommit = process.env.LONGEDIT_UX38D3_SOURCE_COMMIT || ''
const pptxPath = process.env.LONGEDIT_UX38D3_PPTX || ''
const odpPath = process.env.LONGEDIT_UX38D3_ODP || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !pptxPath || !odpPath) throw new Error('UX-38D3 environment is incomplete')

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
const graphRoundTrip = async rootSelector => {
  await evaluate(`location.hash = '#/graph'`)
  await waitFor(`document.querySelector('.graph-container .management-back')`, 'knowledge graph')
  await evaluate(`document.querySelector('.graph-container .management-back').click()`)
  await waitFor(`document.querySelector(${JSON.stringify(rootSelector)})`, `returned ${rootSelector}`)
  await delay(700)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')

await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(pptxPath)})`)
await waitFor(`document.querySelector('.pptx-workspace .slide-canvas') && document.querySelectorAll('.slide-strip > button').length >= 2`, 'PPTX workspace')
await delay(500)
await evaluate(`document.querySelectorAll('.slide-strip > button')[1].click()`)
await delay(250)
const pptxBefore = await evaluate(`(() => ({ slide: document.querySelector('.slide-strip > button.active')?.dataset.slideIndex, details: Boolean(document.querySelector('.pptx-details')), copyOnly: document.querySelector('.document-identity')?.textContent?.includes('原文件不写回') === true }))()`)
if (pptxBefore.slide !== '1' || !pptxBefore.details || !pptxBefore.copyOnly) throw new Error(`PPTX setup gate failed: ${JSON.stringify(pptxBefore)}`)
await capture('pptx-context-before-graph.jpg')
await graphRoundTrip('.pptx-workspace')
const pptxAfter = await evaluate(`(() => ({ slide: document.querySelector('.slide-strip > button.active')?.dataset.slideIndex, details: Boolean(document.querySelector('.pptx-details')) }))()`)
const pptxContextRestored = pptxAfter.slide === pptxBefore.slide && pptxAfter.details === pptxBefore.details
if (!pptxContextRestored) throw new Error(`PPTX context restore failed: ${JSON.stringify({ pptxBefore, pptxAfter })}`)

await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(600)
const pptxNarrow = await evaluate(`(() => { const root = document.querySelector('.pptx-workspace').getBoundingClientRect(); const toolbar = document.querySelector('.pptx-toolbar').getBoundingClientRect(); const stage = document.querySelector('.pptx-stage').getBoundingClientRect(); const details = document.querySelector('.pptx-details')?.getBoundingClientRect(); return { stable: root.right <= innerWidth + 1 && toolbar.right <= root.right + 1 && stage.right <= root.right + 1 && (!details || details.right <= root.right + 1) && document.documentElement.scrollWidth <= innerWidth + 2, toolbarHeight: toolbar.height } })()`)
if (!pptxNarrow.stable || pptxNarrow.toolbarHeight < 70) throw new Error(`PPTX narrow gate failed: ${JSON.stringify(pptxNarrow)}`)
await capture('pptx-narrow-context.jpg')

await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 800, deviceScaleFactor: 1, mobile: false })
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(odpPath)})`)
await waitFor(`document.querySelector('.odf-workspace .odp-layout') && document.querySelectorAll('.odp-layout aside button').length >= 2`, 'ODP workspace')
await delay(400)
await evaluate(`document.querySelectorAll('.odp-layout aside button')[1].click()`)
await delay(250)
const odpBefore = await evaluate(`(() => ({ slide: document.querySelector('.odp-layout aside button.active')?.textContent?.trim(), readonly: document.querySelector('.identity')?.textContent?.includes('只读') === true }))()`)
if (!odpBefore.slide || !odpBefore.readonly) throw new Error(`ODP setup gate failed: ${JSON.stringify(odpBefore)}`)
const odpStateBefore = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(odpPath)}))`)
await graphRoundTrip('.odf-workspace')
const odpAfter = await evaluate(`document.querySelector('.odp-layout aside button.active')?.textContent?.trim()`)
const odpStateAfter = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(odpPath)}))`)
const odpContextRestored = odpAfter === odpBefore.slide
if (!odpContextRestored) throw new Error(`ODP context restore failed: ${JSON.stringify({ odpBefore, odpAfter, odpStateBefore, odpStateAfter, hash: await evaluate('location.hash') })}`)

await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(600)
const odpNarrow = await evaluate(`(() => { const root = document.querySelector('.odf-workspace').getBoundingClientRect(); const toolbar = document.querySelector('.toolbar').getBoundingClientRect(); const stage = document.querySelector('.slide-stage').getBoundingClientRect(); return { stable: root.right <= innerWidth + 1 && toolbar.right <= root.right + 1 && stage.right <= root.right + 1 && document.documentElement.scrollWidth <= innerWidth + 2, toolbarHeight: toolbar.height } })()`)
if (!odpNarrow.stable) throw new Error(`ODP narrow gate failed: ${JSON.stringify(odpNarrow)}`)
await capture('odp-narrow-return.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = {
  schemaVersion: 1, stage: 'UX-38D3', sourceCommit, pptxLoaded: true, odpLoaded: true,
  pptxContextRestored, odpContextRestored, pptxCopyOnlyBoundary: pptxBefore.copyOnly, odpReadonlyBoundary: odpBefore.readonly,
  pptxNarrowStable: pptxNarrow.stable, odpNarrowStable: odpNarrow.stable,
  runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved, sourceUserContentIncluded: false, releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['pptx-context-before-graph.jpg', 'pptx-narrow-context.jpg', 'odp-narrow-return.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-38D3', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`UX-38D3 presentation workspace captured with ${runtimeErrors.length} runtime errors.`)
