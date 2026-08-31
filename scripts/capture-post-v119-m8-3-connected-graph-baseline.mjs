import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14383'
const output = path.resolve(process.env.LONGEDIT_M8_BASELINE_OUTPUT || 'docs/evidence/post-v119-m8-3-connected-graph-baseline')
const sourceCommit = process.env.LONGEDIT_M8_BASELINE_SOURCE_COMMIT || ''
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M8-3 baseline environment is incomplete')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let id = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, label, attempts = 600) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${label}`) }
const capture = async name => { const image = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(image.data, 'base64')) }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.25, mobile: false })
await waitFor(`document.querySelector('.library-file-tree .n-tree-node')`, 'library')
await evaluate(`window.__m3c2Profiler={enabled:true,phases:{},workerPhases:{}};location.hash='#/graph'`)
await waitFor(`document.querySelector('[data-testid="graph-canvas"]') && document.querySelector('.graph-stats')?.textContent?.includes('180')`, '180-node graph')
// Avoid accepting the initial pre-layout `settled` marker before the worker
// starts, while allowing the worker's final state label to vary by runtime.
await delay(3500)
await waitFor(`(() => { const canvas=document.querySelector('[data-testid="graph-canvas"]'); return canvas?.dataset.layoutSettled==='true' || (Number(canvas?.dataset.layoutFrame)>=20 && canvas?.dataset.layoutWorkerState==='idle' && canvas?.dataset.layoutWorkerPending==='false') })()`, 'stable connected graph')
await evaluate(`document.querySelector('[data-testid="graph-tools-entry"]')?.click()`)
await waitFor(`document.querySelector('[data-testid="graph-tools-menu"]')`, 'canvas tools menu')
await evaluate(`document.querySelector('[data-testid="graph-fit-all"]')?.click()`)
await delay(400)
await capture('after-overview.png')

const geometry = await evaluate(`(() => { const toolbar=document.querySelector('.graph-controls'); const canvas=document.querySelector('[data-testid="graph-canvas"]'); const rect=canvas.getBoundingClientRect(); return {toolbarClientWidth:toolbar.clientWidth,toolbarScrollWidth:toolbar.scrollWidth,canvas:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},level:canvas.dataset.semanticZoomLevel}})()`)
await evaluate(`window.__m3c2Profiler.phases={};window.__m3c2Profiler.workerPhases={}`)
const point = { x: geometry.canvas.left + geometry.canvas.width * 0.55, y: geometry.canvas.top + geometry.canvas.height * 0.55 }
const drawSamples = []
for (let index = 0; index < 12; index += 1) {
  const started = performance.now()
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY: -100 })
  await delay(60)
  drawSamples.push(performance.now() - started)
}
await waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.semanticZoomLevel !== 'far'`, 'middle or near view')
await delay(250)
await capture('after-near.png')
await evaluate(`document.querySelector('[data-testid="graph-tools-entry"]')?.click()`)
await waitFor(`document.querySelector('[data-testid="graph-tools-menu"]')`, 'canvas tools menu')
await delay(150)
await capture('after-tools.png')
const tools = await evaluate(`(() => { const menu=document.querySelector('[data-testid="graph-tools-menu"]'); const rect=menu.getBoundingClientRect(); const controls=[...menu.querySelectorAll('button')]; return {buttonCount:controls.length,width:rect.width,height:rect.height,maximumButtonHeight:Math.max(...controls.map(button=>button.getBoundingClientRect().height)),singleLineLabels:controls.every(button=>button.getBoundingClientRect().width>button.getBoundingClientRect().height*1.5)}})()`)
const result = await evaluate(`(() => { const canvas=document.querySelector('[data-testid="graph-canvas"]'); const profiler=window.__m3c2Profiler||{}; return {level:canvas.dataset.semanticZoomLevel,pose:canvas.dataset.cameraPose,layoutFrame:Number(canvas.dataset.layoutFrame),layoutWorkerComputeMaximumMs:Number(canvas.dataset.layoutWorkerComputeMaximumMs),layoutWorkerApplyMaximumMs:Number(canvas.dataset.layoutWorkerApplyMaximumMs),phases:profiler.phases||{},workerPhases:profiler.workerPhases||{},selectedCount:Number(canvas.dataset.selectedCount||0)}})()`)
const evidence = {schemaVersion:1,stage:'M8-3-connected-graph',sourceCommit,nodeCount:180,edgeExpectation:'at-least-360',initialLevel:geometry.level,finalLevel:result.level,toolbarClientWidth:geometry.toolbarClientWidth,toolbarScrollWidth:geometry.toolbarScrollWidth,toolbarOverflowPixels:Math.max(0,geometry.toolbarScrollWidth-geometry.toolbarClientWidth),wheelRoundTripMaximumMs:Math.max(...drawSamples),wheelRoundTripAverageMs:drawSamples.reduce((sum,value)=>sum+value,0)/drawSamples.length,tools,...result,runtimeErrors,sourceUserContentIncluded:false,releaseCandidate:false}
await fs.writeFile(path.join(output,'baseline.json'),`${JSON.stringify(evidence,null,2)}\n`)
socket.close()
console.log(JSON.stringify(evidence,null,2))
