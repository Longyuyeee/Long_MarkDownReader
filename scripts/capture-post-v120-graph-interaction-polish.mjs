import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14388'
const output = path.resolve(process.env.LONGEDIT_GRAPH_POLISH_OUTPUT || '.release-secrets/post-v120-graph-interaction-polish')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const pages = Array.isArray(targets) ? targets : [targets]
const target = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('Graph interaction desktop target is unavailable')

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
const waitFor = async (expression, label, attempts = 300) => {
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
await evaluate(`location.hash='#/library'`)
await waitFor(`document.querySelector('.library-file-tree .n-tree-node')`, 'real library')
await evaluate(`location.hash='#/graph'`)
await waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true'`, 'settled graph')
await delay(500)

const before = await evaluate(`(() => {
  const canvas=document.querySelector('[data-testid="graph-canvas"]')
  const stats=document.querySelector('.graph-stats')?.textContent||''
  return {
    stats,
    zoom:Number(canvas?.dataset.cameraPose ? JSON.parse(canvas.dataset.cameraPose).zoom : 0),
    semanticLevel:canvas?.dataset.semanticZoomLevel||'',
    communityOverview:Boolean(document.querySelector('[data-testid="graph-community-overview"]')),
    layoutFrame:Number(canvas?.dataset.layoutFrame||0),
    loopContinuous:canvas?.dataset.loopContinuous||'',
  }
})()`)

await evaluate(`(() => {
  const canvas=document.querySelector('[data-testid="graph-canvas"]')
  const rect=canvas.getBoundingClientRect()
  for(let index=0;index<48;index+=1) canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:120,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,bubbles:true,cancelable:true}))
})()`)
await delay(700)
const zoomFloor = await evaluate(`(() => {
  const canvas=document.querySelector('[data-testid="graph-canvas"]')
  return {
    zoom:Number(JSON.parse(canvas.dataset.cameraPose||'{}').zoom||0),
    semanticLevel:canvas.dataset.semanticZoomLevel,
    communityOverview:Boolean(document.querySelector('[data-testid="graph-community-overview"]')),
    layoutFrame:Number(canvas.dataset.layoutFrame||0),
    loopContinuous:canvas.dataset.loopContinuous,
    selectedCount:Number(canvas.dataset.selectedCount||0),
    probe:JSON.parse(canvas.dataset.nodeStatusDiagnostics||'{}').hoverProbe||null,
  }
})()`)
await delay(550)
const stableFloor = await evaluate(`(() => { const canvas=document.querySelector('[data-testid="graph-canvas"]'); return {layoutFrame:Number(canvas.dataset.layoutFrame||0),loopContinuous:canvas.dataset.loopContinuous} })()`)
await capture('zoom-floor.png')

if (!zoomFloor.probe?.id) throw new Error('Graph selection probe is unavailable')
await evaluate(`location.hash='#/library'`)
await waitFor(`document.querySelector('.library-file-tree .n-tree-node')`, 'library before rooted graph selection')
await evaluate(`location.hash='#/graph?mode=network&root=${encodeURIComponent(zoomFloor.probe.id)}'`)
await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')`, 'selected node details card')
await delay(350)
const details = await evaluate(`(() => {
  const panel=document.querySelector('[data-testid="graph-selected-node"]')
  const rect=panel.getBoundingClientRect()
  return {
    width:rect.width,height:rect.height,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,
    viewportWidth:innerWidth,viewportHeight:innerHeight,
    areaRatio:(rect.width*rect.height)/(innerWidth*innerHeight),
    title:panel.querySelector('h3')?.textContent||'',
  }
})()`)
await capture('details-card.png')

await evaluate(`document.querySelector('.graph-layout-select .n-base-selection')?.click()`)
await waitFor(`document.querySelector('.n-base-select-menu')`, 'layout popup')
const popup = await evaluate(`(() => {
  const menu=document.querySelector('.n-base-select-menu')
  const rect=menu.getBoundingClientRect()
  return {width:rect.width,height:rect.height,options:[...menu.querySelectorAll('.n-base-select-option')].map(item=>item.textContent?.trim()).filter(Boolean),background:getComputedStyle(menu).backgroundColor,borderRadius:getComputedStyle(menu).borderRadius}
})()`)
await capture('layout-popup.png')
await evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)

const themeVisuals = {}
for (const [value, label] of [['professional', '专业 · 克制网格'], ['colorful', '多彩 · 语义光域'], ['focus', '专注 · 纯净画布']]) {
  await evaluate(`document.querySelector('.graph-theme-select .n-base-selection')?.click()`)
  await waitFor(`[...document.querySelectorAll('.n-base-select-option')].some(item=>item.textContent?.includes(${JSON.stringify(label)}))`, `${value} theme option`)
  await evaluate(`([...document.querySelectorAll('.n-base-select-option')].find(item=>item.textContent?.includes(${JSON.stringify(label)})))?.click()`)
  await delay(180)
  themeVisuals[value] = await evaluate(`(() => { const canvas=document.querySelector('[data-testid="graph-canvas"]'); const style=getComputedStyle(canvas); return {backgroundColor:style.backgroundColor,backgroundImage:style.backgroundImage,backgroundSize:style.backgroundSize} })()`)
}
await capture('focus-theme.png')

const evidence = {
  schemaVersion: 1,
  stage: 'post-v1.0.20-graph-interaction-polish',
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1.25 },
  before,
  zoomFloor: { ...zoomFloor, probe: undefined },
  stableFloor,
  details,
  popup,
  themeVisuals,
  runtimeErrors,
  sourceUserContentIncluded: true,
  evidenceStorage: 'ignored-local-only',
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'desktop-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log(JSON.stringify(evidence, null, 2))
