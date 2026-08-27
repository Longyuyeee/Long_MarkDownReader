import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M3_BASELINE_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M3_BASELINE_LIBRARY)
const tier = Number(process.env.LONGEDIT_M3_BASELINE_TIER)
const lifecycleCycles = Number(process.env.LONGEDIT_M3_BASELINE_CYCLES || 0)
if (!endpoint || !Number.isInteger(tier) || tier < 1) throw new Error('M3-0 capture environment is incomplete')

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
  for (const file of files.sort()) {
    hash.update(path.relative(root, file).replaceAll('\\', '/'))
    hash.update(await fs.readFile(file))
  }
  return hash.digest('hex')
}
const beforeSha256 = await hashDirectory(library)

let target
for (let attempt = 0; attempt < 240 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
  if (!target) await delay(100)
}
if (!target?.webSocketDebuggerUrl) throw new Error('M3-0 WebView target missing')
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
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'evaluation failed')
  return response.result.value
}
const waitFor = async (expression, description, attempts = 1200) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(50) }
  throw new Error(`Timeout waiting for ${description}`)
}
const click = async selector => {
  const clicked = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!(element instanceof HTMLElement))return false;element.click();return true})()`)
  if (!clicked) throw new Error(`Cannot click ${selector}`)
}
const capture = async file => {
  const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(image.data, 'base64'))
}
const canvasDigest = () => evaluate(`document.querySelector('canvas[data-layout-mode]')?.toDataURL() || ''`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Performance.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null`, 'library initialization')
await evaluate(`window.__m3LongTasks=[];window.__m3Observer=new PerformanceObserver(list=>window.__m3LongTasks.push(...list.getEntries().map(entry=>({startTime:entry.startTime,duration:entry.duration}))));window.__m3Observer.observe({type:'longtask',buffered:true})`)

const centeredPath = path.join(library, 'node-000001.md')
const startedAt = Date.now()
await evaluate(`location.hash='#/graph?root='+encodeURIComponent(${JSON.stringify(centeredPath)})`)
await waitFor(`document.querySelector('.graph-stats')?.textContent?.includes(${JSON.stringify(`${tier} / ${tier}`)})`, `${tier}-node graph visible`)
const firstVisibleMs = Date.now() - startedAt
await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')!==null`, 'centered node selection')
const centeredNodeSelected = true

let previousDigest = ''
let stableMatches = 0
let layoutStableMs = firstVisibleMs
for (let attempt = 0; attempt < 160 && stableMatches < 3; attempt += 1) {
  await delay(100)
  const digest = await canvasDigest()
  stableMatches = digest && digest === previousDigest ? stableMatches + 1 : 0
  previousDigest = digest
  layoutStableMs = Date.now() - startedAt
}
if (stableMatches < 3) throw new Error(`Graph layout did not settle at tier ${tier}`)

const zoomBefore = await evaluate(`document.querySelector('.graph-stats')?.textContent || ''`)
const rect = await evaluate(`(()=>{const rect=document.querySelector('canvas').getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`)
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY: -120 })
await delay(150)
const zoomAfter = await evaluate(`document.querySelector('.graph-stats')?.textContent || ''`)
const zoomChanged = zoomBefore !== zoomAfter
await capture(`tier-${tier}.jpg`)

await click('.management-back')
await waitFor(`document.querySelector('.library-mode')!==null`, 'return to library')
const returnedToLibrary = true

let lifecycleCompleted = lifecycleCycles === 0
if (lifecycleCycles > 0) {
  lifecycleCompleted = true
  for (let cycle = 0; cycle < lifecycleCycles; cycle += 1) {
    await evaluate(`location.hash='#/graph'`)
    await waitFor(`document.querySelector('.graph-stats')?.textContent?.includes(${JSON.stringify(`${tier} / ${tier}`)})`, `lifecycle graph ${cycle + 1}`)
    await click('.management-back')
    await waitFor(`document.querySelector('.library-mode')!==null`, `lifecycle library ${cycle + 1}`)
  }
}

const longTasks = await evaluate(`window.__m3LongTasks || []`)
const metrics = (await send('Performance.getMetrics')).metrics || []
const metric = name => metrics.find(item => item.name === name)?.value ?? null
const afterSha256 = await hashDirectory(library)
const evidence = {
  schemaVersion: 1,
  stage: 'M3-0',
  tier,
  actual: {
    nodeCount: tier,
    edgeCount: tier - 1,
    firstVisibleMs,
    layoutStableMs,
    zoomChanged,
    centeredNodeSelected,
    returnedToLibrary,
    lifecycleCycles,
    lifecycleCompleted,
    longTaskCount: longTasks.length,
    longestTaskMs: Math.round(Math.max(0, ...longTasks.map(item => item.duration))),
    jsHeapUsedBytes: metric('JSHeapUsedSize'),
    runtimeErrors: runtimeErrors.length,
    sourceFilesUnchanged: beforeSha256 === afterSha256,
    beforeSha256,
    afterSha256,
    semanticRegistryVisible: Boolean(await evaluate(`document.querySelector('[data-testid="graph-semantic-legend"]')`)),
  },
  expectedBeforeImplementation: {
    semanticRegistryVisible: false,
    shortestPathWorkflowVisible: false,
    communityWorkflowVisible: false,
  },
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, `tier-${tier}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log(`M3-0 tier ${tier}: visible ${firstVisibleMs}ms, stable ${layoutStableMs}ms, long tasks ${longTasks.length}`)
