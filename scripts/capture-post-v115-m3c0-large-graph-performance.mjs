import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const stage = process.env.LONGEDIT_M3C_STAGE || 'M3C-0'
const output = path.resolve(process.env.LONGEDIT_M3C_OUTPUT || process.env.LONGEDIT_M3C0_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M3C_LIBRARY || process.env.LONGEDIT_M3C0_LIBRARY)
const tier = Number(process.env.LONGEDIT_M3C_TIER || process.env.LONGEDIT_M3C0_TIER)
const lifecycleCycles = Number(process.env.LONGEDIT_M3C_CYCLES || process.env.LONGEDIT_M3C0_CYCLES || 0)
if (!endpoint || !Number.isInteger(tier) || tier < 1) throw new Error(`${stage} capture environment is incomplete`)
const boundedSchedulerStage = stage !== 'M3C-0'
const profilingStage = stage === 'M3C-2'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const hashDirectory = async root => {
  const files = []
  const walk = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      entry.isDirectory() ? await walk(full) : files.push(full)
    }
  }
  await walk(root)
  const hash = crypto.createHash('sha256')
  for (const file of files.sort()) { hash.update(path.relative(root, file).replaceAll('\\', '/')); hash.update(await fs.readFile(file)) }
  return hash.digest('hex')
}
const beforeSha256 = await hashDirectory(library)

let target
for (let attempt = 0; attempt < 240 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
  if (!target) await delay(100)
}
if (!target?.webSocketDebuggerUrl) throw new Error(`${stage} WebView target missing`)
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'log error')
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP request timed out: ${method}`)) }, 45000)
  pending.set(id, {
    resolve: value => { clearTimeout(timeout); resolve(value) },
    reject: error => { clearTimeout(timeout); reject(error) },
  })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'evaluation failed')
  return response.result.value
}
const waitFor = async (expression, description, timeoutMs = 180000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(50) }
  throw new Error(`Timeout waiting for ${description}`)
}
const click = async selector => {
  const clicked = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!(element instanceof HTMLElement))return false;element.click();return true})()`)
  if (!clicked) throw new Error(`Cannot click ${selector}`)
}
const capture = async file => {
  const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 84, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(image.data, 'base64'))
}
const readPose = () => evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraPose||''`)
const readDraws = () => evaluate(profilingStage
  ? `Number(window.__m3c2Profiler?.phases?.['canvas-draw']?.count||0)`
  : `Number(window.__m3cProbe?.draws||0)`)
const restoreFullGraphIfNeeded = async () => {
  const active = Boolean(await evaluate(`document.querySelector('[data-testid="graph-community-focus"]')`))
  if (!active) return false
  await click('[data-testid="graph-community-focus-return"]')
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')===null`, 'full graph after accidental community entry')
  await evaluate(`document.querySelector('[data-testid="graph-fit-all"]')?.click()`)
  await delay(160)
  return true
}
const metric = async name => ((await send('Performance.getMetrics')).metrics || []).find(item => item.name === name)?.value ?? null
const collectHeap = async () => { await send('HeapProfiler.collectGarbage'); return metric('JSHeapUsedSize') }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Performance.enable'); await send('HeapProfiler.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null`, 'library initialization')
await evaluate(profilingStage
  ? `(()=>{window.__m3cLongTasks=[];window.__m3cLongTaskObserver=new PerformanceObserver(list=>window.__m3cLongTasks.push(...list.getEntries().map(entry=>({startTime:entry.startTime,duration:entry.duration}))));window.__m3cLongTaskObserver.observe({type:'longtask',buffered:true});window.__m3c2Profiler={enabled:true,phases:{}}})()`
  : `(()=>{window.__m3cLongTasks=[];window.__m3cLongTaskObserver=new PerformanceObserver(list=>window.__m3cLongTasks.push(...list.getEntries().map(entry=>({startTime:entry.startTime,duration:entry.duration}))));window.__m3cLongTaskObserver.observe({type:'longtask',buffered:true});const probe=window.__m3cProbe={draws:0,current:[],frames:[]};const proto=CanvasRenderingContext2D.prototype;const clearRect=proto.clearRect,arc=proto.arc,roundRect=proto.roundRect;const isGraph=context=>context.canvas?.getAttribute?.('data-testid')==='graph-canvas';const add=(context,values)=>{if(probe.current.length>=64||!isGraph(context))return;probe.current.push(values.map(value=>Math.round(Number(value)*10)/10).join(','))};proto.clearRect=function(...args){if(isGraph(this)){if(probe.current.length){probe.frames.push({signature:probe.current.join('|'),at:performance.now()});if(probe.frames.length>40)probe.frames.shift()}probe.current=[];probe.draws+=1}return Reflect.apply(clearRect,this,args)};proto.arc=function(x,y,r,...rest){add(this,[x,y,r]);return Reflect.apply(arc,this,[x,y,r,...rest])};proto.roundRect=function(x,y,w,h,r){add(this,[x,y,w,h]);return Reflect.apply(roundRect,this,[x,y,w,h,r])}})()`)
const profilingCalibration = profilingStage ? await evaluate(`(()=>{const count=100000;let sink=0;const baselineStarted=performance.now();for(let index=0;index<count;index+=1)sink+=index&1;const baselineMs=performance.now()-baselineStarted;const phase={count:0,totalMs:0,maximumMs:0,over50Ms:0,over1000Ms:0,samples:[]};const instrumentedStarted=performance.now();for(let index=0;index<count;index+=1){const started=performance.now();sink+=index&1;const duration=performance.now()-started;phase.count+=1;phase.totalMs+=duration;phase.maximumMs=Math.max(phase.maximumMs,duration);if(duration>=50)phase.over50Ms+=1;if(duration>=1000)phase.over1000Ms+=1;if(phase.samples.length<512)phase.samples.push(duration)}const instrumentedMs=performance.now()-instrumentedStarted;let seed=${tier}>>>0;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};return {iterations:count,baselineMs,instrumentedMs,bookkeepingMicrosecondsPerCall:Math.max(0,(instrumentedMs-baselineMs)*1000/count),sink,deterministicSeed:${tier}}})()`) : null

const centeredPath = path.join(library, 'node-000001.md')
const startedAt = Date.now()
await evaluate(`location.hash='#/graph?mode=network&root='+encodeURIComponent(${JSON.stringify(centeredPath)})`)
await waitFor(`document.querySelector('.graph-stats')?.textContent?.includes(${JSON.stringify(`${tier} / ${tier}`)})`, `${tier}-node graph visible`)
const firstVisibleMs = Date.now() - startedAt
await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')!==null`, 'centered node selection')
let stabilityFailure = ''
try {
  const stabilityExpression = boundedSchedulerStage
    ? `(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return canvas?.dataset.layoutSettled==='true'&&canvas?.dataset.loopContinuous==='false'})()`
    : `(()=>{const frames=window.__m3cProbe?.frames||[];if(frames.length<12)return false;const recent=frames.slice(-12);return recent.every(frame=>frame.signature===recent[0].signature)})()`
  const stabilityTimeoutMs = profilingStage && tier === 5000 ? Math.max(1000, 120000 - firstVisibleMs) : profilingStage ? 180000 : 240000
  await waitFor(stabilityExpression, `${tier}-node geometry stable`, stabilityTimeoutMs)
} catch (error) {
  stabilityFailure = String(error)
}
const layoutStableMs = Date.now() - startedAt
if (stabilityFailure) {
  const phaseProfile = profilingStage ? await evaluate(`JSON.parse(JSON.stringify(window.__m3c2Profiler?.phases||{}))`) : null
  const drawsBeforeBudgetFailure = await readDraws()
  const longTasks = await evaluate(`window.__m3cLongTasks||[]`)
  if (profilingStage) await capture(`tier-${tier}.jpg`)
  let returnedToLibrary = false
  if (profilingStage) {
    await click('.management-back')
    await waitFor(`document.querySelector('.library-mode')!==null`, 'return after bounded profiling failure')
    returnedToLibrary = true
  }
  const afterSha256 = await hashDirectory(library)
  const evidence = {
    schemaVersion: 1,
    stage,
    tier,
    expected: { firstVisibleMaximumMs: 30000, layoutStableMaximumMs: 120000, interactionMaximumMs: 5000, settledDrawsPerSecondMaximum: 2, inactiveDrawsMaximum: 2, runtimeErrors: 0 },
    actual: {
      completed: false,
      failureStage: 'layout-stable',
      failureMessage: stabilityFailure,
      nodeCount: tier,
      edgeCount: tier - 1,
      firstVisibleMs,
      layoutStableMs,
      interactions: null,
      frameActivity: { drawsBeforeBudgetFailure },
      phaseProfile,
      profilingCalibration,
      lifecycle: { cycles: lifecycleCycles, completed: false },
      longTaskCount: longTasks.length,
      longestTaskMs: Math.round(Math.max(0, ...longTasks.map(item => item.duration))),
      runtimeErrors: runtimeErrors.length,
      runtimeErrorMessages: runtimeErrors,
      returnedToLibrary,
      sourceFilesUnchanged: beforeSha256 === afterSha256,
      beforeSha256,
      afterSha256,
    },
    comparison: {
      firstVisibleWithinExpectation: firstVisibleMs <= 30000,
      layoutStableWithinExpectation: false,
      interactionsWithinExpectation: false,
      settledFrameActivityWithinExpectation: false,
      inactiveFrameActivityWithinExpectation: false,
    },
    sourceUserContentIncluded: false,
    releaseCandidate: false,
  }
  await fs.writeFile(path.join(output, `tier-${tier}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
  socket.close()
  console.log(`${stage} tier ${tier}: visible ${firstVisibleMs}ms, layout stability failed after ${layoutStableMs}ms; bounded failure recorded`)
  process.exit(0)
}

const settledDrawStart = await readDraws()
await delay(1000)
const settledDrawsPerSecond = (await readDraws()) - settledDrawStart

if (profilingStage && tier === 100) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const level = await evaluate(`document.querySelector('[data-testid="graph-container"]')?.dataset.semanticZoomLevel||''`)
    if (level === 'middle') break
    const deltaY = level === 'near' ? 120 : -120
    await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');if(!(canvas instanceof HTMLCanvasElement))return;const rect=canvas.getBoundingClientRect();canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:${deltaY},clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,bubbles:true,cancelable:true}))})()`)
    await delay(40)
  }
  await waitFor(`document.querySelector('[data-testid="graph-container"]')?.dataset.semanticZoomLevel==='middle'`, '100-node middle semantic profiling')
  await delay(120)
}

const resumeLayoutBefore = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {frame:Number(canvas?.dataset.layoutFrame||-1),settled:canvas?.dataset.layoutSettled==='true'}})()`)
const blurDrawStart = await readDraws()
await evaluate(`window.dispatchEvent(new Event('blur'))`)
await delay(800)
const inactiveDraws = (await readDraws()) - blurDrawStart
await evaluate(`window.dispatchEvent(new Event('focus'))`)
if (boundedSchedulerStage) {
  await waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true'`, `${tier}-node focus resume stability`)
  await delay(300)
} else {
  await waitFor(`(()=>{const frames=window.__m3cProbe?.frames||[];if(frames.length<12)return false;const recent=frames.slice(-12);return recent.every(frame=>frame.signature===recent[0].signature)})()`, `${tier}-node focus resume stability`)
}
const resumeLayoutAfter = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {frame:Number(canvas?.dataset.layoutFrame||-1),settled:canvas?.dataset.layoutSettled==='true',continuous:canvas?.dataset.loopContinuous==='true'}})()`)
const focusResumeLayoutRestarts = resumeLayoutBefore.settled && resumeLayoutAfter.settled && resumeLayoutAfter.frame === resumeLayoutBefore.frame ? 0 : 1

const canvasCenter = await evaluate(`(()=>{const value=document.querySelector('[data-testid="graph-canvas"]')?.getBoundingClientRect();return value?{left:value.left,top:value.top,width:value.width,height:value.height,x:value.left+value.width/2,y:value.top+value.height/2}:null})()`)
if (!canvasCenter) throw new Error(`${stage} graph canvas missing`)
const zoomPoseBefore = await readPose()
const zoomStartedAt = Date.now()
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: canvasCenter.x, y: canvasCenter.y, deltaX: 0, deltaY: -120 })
await waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraPose!==${JSON.stringify(zoomPoseBefore)}`, `${tier}-node zoom`)
const zoomLatencyMs = Date.now() - zoomStartedAt

let panChanged = false
let panLatencyMs = 0
for (const [xRatio, yRatio] of [[0.92, 0.9], [0.08, 0.9], [0.92, 0.18]]) {
  const before = await readPose()
  const startX = canvasCenter.left + canvasCenter.width * xRatio
  const startY = canvasCenter.top + canvasCenter.height * yRatio
  const panStartedAt = Date.now()
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX - 80, y: startY - 45, button: 'left', buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: startX - 80, y: startY - 45, button: 'left', clickCount: 1 })
  await delay(80)
  const enteredCommunity = await restoreFullGraphIfNeeded()
  panChanged = !enteredCommunity && (await readPose()) !== before
  if (panChanged) { panLatencyMs = Date.now() - panStartedAt; break }
}

await evaluate(`document.querySelector('[data-testid="graph-fit-all"]')?.click();document.querySelector('.details-close')?.click()`)
await delay(160)
let selectedCount = 0
let selectionLatencyMs = 0
let selectionKind = 'box'
for (const ratio of [0.28, 0.46, 0.64, 0.82]) {
  const selectionStartedAt = Date.now()
  await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');if(!(canvas instanceof HTMLCanvasElement))return;canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const rect=canvas.getBoundingClientRect();const startX=rect.left+8,startY=rect.top+8;const endX=rect.left+rect.width*${ratio},endY=rect.top+rect.height*${ratio};canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:startX,clientY:startY,shiftKey:true,bubbles:true}));canvas.dispatchEvent(new MouseEvent('mousemove',{button:0,clientX:endX,clientY:endY,shiftKey:true,bubbles:true}));canvas.dispatchEvent(new MouseEvent('mouseup',{button:0,clientX:endX,clientY:endY,shiftKey:true,bubbles:true}))})()`)
  await delay(80)
  selectedCount = Number(await evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.selectedCount||0`))
  if (selectedCount > 0 && selectedCount < tier) { selectionLatencyMs = Date.now() - selectionStartedAt; break }
}
if (!(selectedCount > 0 && selectedCount < tier)) {
  selectionKind = 'select-all-fallback'
  const selectionStartedAt = Date.now()
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await waitFor(`Number(document.querySelector('[data-testid="graph-canvas"]')?.dataset.selectedCount||0)===${tier}`, `${tier}-node select all`)
  selectionLatencyMs = Date.now() - selectionStartedAt
  selectedCount = tier
}
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })

const focusStartedAt = Date.now()
await evaluate(`(()=>{const input=document.querySelector('.graph-search input');if(!(input instanceof HTMLInputElement))return;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(input,${JSON.stringify(`Node ${tier}`)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()`)
let focusFailure = ''
try {
  await waitFor(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return canvas?.dataset.selectedCount==='1'&&canvas?.dataset.cameraMotionReason==='node-focus'&&['completed','reduced'].includes(canvas.dataset.cameraMotionState||'')})()`, `${tier}-node bounded focus`, tier === 5000 && !profilingStage ? 30000 : 180000)
} catch (error) {
  focusFailure = String(error)
}
const focusLatencyMs = Date.now() - focusStartedAt
if (focusFailure) {
  const afterSha256 = await hashDirectory(library)
  const evidence = {
    schemaVersion: 1,
    stage,
    tier,
    expected: { firstVisibleMaximumMs: 30000, layoutStableMaximumMs: 120000, interactionMaximumMs: 5000, settledDrawsPerSecondMaximum: 2, inactiveDrawsMaximum: 2, runtimeErrors: 0 },
    actual: {
      completed: false,
      failureStage: 'bounded-node-focus',
      failureMessage: focusFailure,
      nodeCount: tier,
      edgeCount: tier - 1,
      firstVisibleMs,
      layoutStableMs,
      interactions: { zoomChanged: true, zoomLatencyMs, panChanged, panLatencyMs, selectionKind, selectedCount, selectionLatencyMs, focusLatencyMs, focus: null },
      frameActivity: { settledDrawsPerSecond, inactiveDraws, libraryDraws: null, focusResumeLayoutRestarts, resumeLayoutBefore, resumeLayoutAfter },
      lifecycle: { cycles: lifecycleCycles, completed: false },
      runtimeErrors: runtimeErrors.length,
      runtimeErrorMessages: runtimeErrors,
      returnedToLibrary: false,
      sourceFilesUnchanged: beforeSha256 === afterSha256,
      beforeSha256,
      afterSha256,
    },
    comparison: {
      firstVisibleWithinExpectation: firstVisibleMs <= 30000,
      layoutStableWithinExpectation: layoutStableMs <= 120000,
      interactionsWithinExpectation: false,
      settledFrameActivityWithinExpectation: settledDrawsPerSecond <= 2,
      inactiveFrameActivityWithinExpectation: inactiveDraws <= 2,
    },
    sourceUserContentIncluded: false,
    releaseCandidate: false,
  }
  await fs.writeFile(path.join(output, `tier-${tier}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
  socket.close()
  console.log(`${stage} tier ${tier}: visible ${firstVisibleMs}ms, stable ${layoutStableMs}ms, focus failed after ${focusLatencyMs}ms; bounded failure recorded`)
  process.exit(0)
}
const focusState = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {state:canvas?.dataset.cameraMotionState||'',reason:canvas?.dataset.cameraMotionReason||'',selectedCount:Number(canvas?.dataset.selectedCount||0)}})()`)
await evaluate(`(()=>{const input=document.querySelector('.graph-search input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(input instanceof HTMLInputElement){setter?.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}))}document.querySelector('.details-close')?.click()})()`)
await delay(160)
if (!panChanged) {
  for (const [xRatio, yRatio] of [[0.08, 0.9], [0.92, 0.9], [0.08, 0.2], [0.92, 0.2]]) {
    const fallback = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');if(!(canvas instanceof HTMLCanvasElement))return null;const before=canvas.dataset.cameraPose||'';const rect=canvas.getBoundingClientRect();const startX=rect.left+rect.width*${xRatio},startY=rect.top+rect.height*${yRatio};canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,buttons:1,clientX:startX,clientY:startY,bubbles:true}));canvas.dispatchEvent(new MouseEvent('mousemove',{button:0,buttons:1,clientX:startX-80,clientY:startY-45,bubbles:true}));canvas.dispatchEvent(new MouseEvent('mouseup',{button:0,buttons:0,clientX:startX-80,clientY:startY-45,bubbles:true}));return before})()`)
    const fallbackStartedAt = Date.now()
    await delay(120)
    const enteredCommunity = await restoreFullGraphIfNeeded()
    panChanged = !enteredCommunity && fallback !== null && (await readPose()) !== fallback
    if (panChanged) { panLatencyMs = Date.now() - fallbackStartedAt; break }
  }
}
await restoreFullGraphIfNeeded()
const panFullGraph = await evaluate(`document.querySelector('.graph-stats')?.textContent?.includes(${JSON.stringify(`${tier} / ${tier}`)})===true`)
await capture(`tier-${tier}.jpg`)
const phaseProfile = profilingStage ? await evaluate(`JSON.parse(JSON.stringify(window.__m3c2Profiler?.phases||{}))`) : null

await click('.management-back')
await waitFor(`document.querySelector('.library-mode')!==null`, 'return to library')
const libraryDrawStart = await readDraws()
await delay(600)
const libraryDraws = (await readDraws()) - libraryDrawStart

let lifecycle = { cycles: lifecycleCycles, completed: lifecycleCycles === 0, totalMs: 0, maximumVisibleMs: 0, heapBeforeBytes: null, heapAfterBytes: null, heapDeltaBytes: null }
if (lifecycleCycles > 0) {
  const heapBeforeBytes = await collectHeap()
  const lifecycleStartedAt = Date.now()
  let maximumVisibleMs = 0
  for (let cycle = 0; cycle < lifecycleCycles; cycle += 1) {
    const cycleStartedAt = Date.now()
    await evaluate(`location.hash='#/graph'`)
    await waitFor(`document.querySelector('.graph-stats')?.textContent?.includes(${JSON.stringify(`${tier} / ${tier}`)})`, `lifecycle graph ${cycle + 1}`)
    maximumVisibleMs = Math.max(maximumVisibleMs, Date.now() - cycleStartedAt)
    await click('.management-back')
    await waitFor(`document.querySelector('.library-mode')!==null`, `lifecycle library ${cycle + 1}`)
  }
  const totalMs = Date.now() - lifecycleStartedAt
  const heapAfterBytes = await collectHeap()
  lifecycle = { cycles: lifecycleCycles, completed: true, totalMs, maximumVisibleMs, heapBeforeBytes, heapAfterBytes, heapDeltaBytes: heapAfterBytes - heapBeforeBytes }
}

const longTasks = await evaluate(`window.__m3cLongTasks||[]`)
const afterSha256 = await hashDirectory(library)
const expectations = tier === 100
  ? { firstVisibleMaximumMs: 2000, layoutStableMaximumMs: 5000, interactionMaximumMs: 250 }
  : tier === 1000
    ? { firstVisibleMaximumMs: 5000, layoutStableMaximumMs: 20000, interactionMaximumMs: 1000 }
    : { firstVisibleMaximumMs: 30000, layoutStableMaximumMs: 120000, interactionMaximumMs: 5000 }
const evidence = {
  schemaVersion: 1,
  stage,
  tier,
  expected: { ...expectations, settledDrawsPerSecondMaximum: 2, inactiveDrawsMaximum: 2, runtimeErrors: 0 },
  actual: {
    nodeCount: tier,
    edgeCount: tier - 1,
    firstVisibleMs,
    layoutStableMs,
    interactions: { zoomChanged: true, zoomLatencyMs, panChanged, panLatencyMs, panFullGraph, selectionKind, selectedCount, selectionLatencyMs, focusLatencyMs, focus: focusState },
    frameActivity: { settledDrawsPerSecond, inactiveDraws, libraryDraws, focusResumeLayoutRestarts, resumeLayoutBefore, resumeLayoutAfter },
    phaseProfile,
    profilingCalibration,
    lifecycle,
    longTaskCount: longTasks.length,
    longestTaskMs: Math.round(Math.max(0, ...longTasks.map(item => item.duration))),
    jsHeapUsedBytes: await metric('JSHeapUsedSize'),
    runtimeErrors: runtimeErrors.length,
    runtimeErrorMessages: runtimeErrors,
    returnedToLibrary: true,
    sourceFilesUnchanged: beforeSha256 === afterSha256,
    beforeSha256,
    afterSha256,
  },
  comparison: {
    firstVisibleWithinExpectation: firstVisibleMs <= expectations.firstVisibleMaximumMs,
    layoutStableWithinExpectation: layoutStableMs <= expectations.layoutStableMaximumMs,
    interactionsWithinExpectation: Math.max(zoomLatencyMs, panLatencyMs, selectionLatencyMs, focusLatencyMs) <= expectations.interactionMaximumMs,
    settledFrameActivityWithinExpectation: settledDrawsPerSecond <= 2,
    inactiveFrameActivityWithinExpectation: inactiveDraws <= 2 && libraryDraws <= (boundedSchedulerStage ? 0 : 2),
    focusResumeWithoutLayoutRestart: focusResumeLayoutRestarts === 0,
  },
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, `tier-${tier}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log(`${stage} tier ${tier}: visible ${firstVisibleMs}ms, stable ${layoutStableMs}ms, idle draws ${settledDrawsPerSecond}/s, longest task ${evidence.actual.longestTaskMs}ms`)
