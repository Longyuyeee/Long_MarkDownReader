import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14387'
const output = path.resolve(process.env.LONGEDIT_M8_5_OUTPUT || 'docs/evidence/post-v119-m8-5-graph-visual-performance')
const sourceCommit = process.env.LONGEDIT_M8_5_SOURCE_COMMIT || ''
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M8-5 desktop environment is incomplete')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let id = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id
  pending.set(requestId, { resolve, reject })
  socket.send(JSON.stringify({ id: requestId, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const waitFor = async (expression, label, attempts = 600) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}
const capture = async name => {
  const image = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, name), Buffer.from(image.data, 'base64'))
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.25, mobile: false })
await waitFor(`document.querySelector('.library-file-tree .n-tree-node')`, 'library')
await evaluate(`window.__m3c2Profiler={enabled:true,phases:{},workerPhases:{}};location.hash='#/graph'`)
await waitFor(`document.querySelector('[data-testid="graph-canvas"]') && document.querySelector('.graph-stats')?.textContent?.includes('180')`, '180-node graph')
await waitFor(`(() => { const canvas=document.querySelector('[data-testid="graph-canvas"]'); return canvas?.dataset.layoutSettled==='true' && Number(canvas?.dataset.autoFitCompletionCount)>=1 })()`, 'settled automatically fitted graph')
await evaluate(`window.__m3c2Profiler.phases={};window.__m3c2Profiler.workerPhases={}`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 52 })
await delay(350)

const overview = await evaluate(`(() => {
  const canvas=document.querySelector('[data-testid="graph-canvas"]')
  const rect=canvas.getBoundingClientRect()
  const diagnostics=JSON.parse(canvas.dataset.pathCameraDiagnostics||'{}')
  const points=diagnostics.screenPoints||[]
  const profiler=window.__m3c2Profiler||{}
  return {
    canvas:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},
    semanticLevel:canvas.dataset.semanticZoomLevel,
    cameraPose:JSON.parse(canvas.dataset.cameraPose||'{}'),
    autoFitCompletionCount:Number(canvas.dataset.autoFitCompletionCount||0),
    fitPointCount:points.length,
    fitPointsInBounds:points.length===180&&points.every(point=>point.x>=0&&point.x<=rect.width&&point.y>=0&&point.y<=rect.height),
    denseEdgeArrowPolicy:canvas.dataset.denseEdgeArrowPolicy,
    statusRingCount:Number(canvas.dataset.nodeStatusRingCount||0),
    selectedCount:Number(canvas.dataset.selectedCount||0),
    loopContinuous:canvas.dataset.loopContinuous,
    probe:JSON.parse(canvas.dataset.nodeStatusDiagnostics||'{}').hoverProbe||null,
  }
})()`)
await capture('settled-overview.png')

if (!overview.probe) throw new Error('M8-5 selection probe is missing')
const probeX = overview.canvas.left + overview.probe.x * overview.cameraPose.zoom + overview.cameraPose.x
const probeY = overview.canvas.top + overview.probe.y * overview.cameraPose.zoom + overview.cameraPose.y
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: probeX, y: probeY })
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: probeX, y: probeY, button: 'left', buttons: 1, clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: probeX, y: probeY, button: 'left', buttons: 0, clickCount: 1 })
await delay(110)
const activeSelection = await evaluate(`(() => ({
  selectedCount:Number(document.querySelector('[data-testid="graph-canvas"]')?.dataset.selectedCount||0),
  selectionEffect:document.querySelector('[data-testid="graph-canvas"]')?.dataset.selectionEffect,
  detailsVisible:Boolean(document.querySelector('[data-testid="graph-selected-node"]')),
  tooltipVisible:(() => { const tooltip=document.querySelector('.node-tooltip'); return Boolean(tooltip && Number(getComputedStyle(tooltip).opacity) > .05) })(),
}))()`)
await capture('selected-feedback.png')
await delay(520)
const settledSelection = await evaluate(`(() => ({
  selectionEffect:document.querySelector('[data-testid="graph-canvas"]')?.dataset.selectionEffect,
  loopContinuous:document.querySelector('[data-testid="graph-canvas"]')?.dataset.loopContinuous,
  tooltipVisible:Boolean(document.querySelector('.node-tooltip')),
  phases:window.__m3c2Profiler?.phases||{},
}))()`)

const drawSamples = settledSelection.phases?.['canvas-draw']?.samples || []
delete settledSelection.phases
const evidence = {
  schemaVersion: 1,
  stage: 'M8-5',
  sourceCommit,
  nodeCount: 180,
  edgeCount: 540,
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1.25 },
  ...overview,
  probe: undefined,
  activeSelection,
  settledSelection,
  canvasDrawMaximumMs: drawSamples.length ? Math.max(...drawSamples) : null,
  runtimeErrors,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'desktop-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log(JSON.stringify(evidence, null, 2))
