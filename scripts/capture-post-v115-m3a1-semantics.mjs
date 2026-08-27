import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M3A1_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M3A1_LIBRARY)
const stage = process.env.LONGEDIT_M3_STAGE || 'M3A1'
if (!endpoint) throw new Error('M3A-1 capture environment is incomplete')
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
if (!target?.webSocketDebuggerUrl) throw new Error('M3A-1 WebView target missing')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'log error')
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'evaluation failed')
  return response.result.value
}
const waitFor = async (expression, description, attempts = 600) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(50) }
  throw new Error(`Timeout waiting for ${description}`)
}
const capture = async file => {
  const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(image.data, 'base64'))
}
const snapshot = () => evaluate(`(()=>{const legend=document.querySelector('[data-testid="graph-semantic-legend"]');const ids=testid=>[...document.querySelectorAll('[data-testid="'+testid+'"] [data-semantic-id]')].map(el=>el.dataset.semanticId);return {legendVisible:Boolean(legend&&getComputedStyle(legend).visibility!=='hidden'),graphStats:document.querySelector('.graph-stats')?.textContent?.replace(/\\s+/g,' ').trim()||'',objectTypeIds:ids('graph-object-legend'),relationTypeIds:ids('graph-relation-legend'),directed:[...document.querySelectorAll('[data-testid="graph-relation-legend"] [data-semantic-id]')].map(el=>({id:el.dataset.semanticId,directed:el.dataset.directed})),documentFits:document.documentElement.scrollWidth<=innerWidth+1}})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null`, 'library initialization')
await evaluate(`location.hash='#/graph'`)
await waitFor(`document.querySelector('[data-testid="graph-object-legend"] [data-semantic-id="pptx_slide"]')!==null`, 'cross-format object legend')
await waitFor(`document.querySelector('[data-testid="graph-relation-legend"] [data-semantic-id="supports"]')!==null`, 'cross-format relation legend')
const wide = await snapshot()
await capture('semantic-legend-wide.jpg')

await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 800, deviceScaleFactor: 1, mobile: false })
await delay(300)
const narrow = await snapshot()
await capture('semantic-legend-narrow.jpg')

let neighborFocus = null
if (stage === 'M3A2') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  const focusClicked = await evaluate(`(()=>{const element=document.querySelector('[data-testid="graph-neighbor-focus-action"]');if(!(element instanceof HTMLButtonElement)||element.disabled)return false;element.click();return true})()`)
  if (!focusClicked) throw new Error('M3A-2 neighbor focus action missing')
  await waitFor(`document.querySelector('[data-testid="graph-neighbor-focus"]')!==null`, 'neighbor focus banner')
  await delay(150)
  const focused = await snapshot()
  const depthSnapshots = [{ depth: 1, graphStats: focused.graphStats }]
  for (const depth of [2, 3]) {
    await evaluate(`(()=>{const select=document.querySelector('[data-testid="graph-neighbor-focus-depth"]');if(!(select instanceof HTMLSelectElement))return false;select.value=${JSON.stringify(String(depth))};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await delay(120)
    depthSnapshots.push({ depth, graphStats: (await snapshot()).graphStats })
  }
  await capture('neighbor-focus.jpg')
  const returnClicked = await evaluate(`(()=>{const element=document.querySelector('[data-testid="graph-neighbor-focus-return"]');if(!(element instanceof HTMLElement))return false;element.click();return true})()`)
  if (!returnClicked) throw new Error('M3A-2 return-to-full-graph action missing')
  await waitFor(`document.querySelector('[data-testid="graph-neighbor-focus"]')===null`, 'full graph return')
  await delay(150)
  const restored = await snapshot()
  const graphShape = value => value.graphStats.match(/^\d+ \/ \d+ 节点 \d+ 连接/)?.[0] || ''
  neighborFocus = { focusRootVisible: true, focused, depthSnapshots, restored, nodeCountReduced: graphShape(focused) !== graphShape(wide), fullGraphRestored: graphShape(restored) === graphShape(wide) }
}

let shortestPath = null
if (stage === 'M3A3') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await evaluate(`document.querySelector('[data-testid="graph-path-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-path-panel"]')!==null`, 'shortest-path panel')
  const choose = async (selector, prefix) => {
    const chosen = await evaluate(`(()=>{const select=document.querySelector(${JSON.stringify(selector)});if(!(select instanceof HTMLSelectElement))return false;const option=[...select.options].find(item=>item.textContent?.startsWith(${JSON.stringify(prefix)}));if(!option)return false;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    if (!chosen) throw new Error(`M3A-3 option missing: ${prefix}`)
  }
  await choose('[data-testid="graph-path-start"]', 'NorthStar · Markdown')
  await choose('[data-testid="graph-path-end"]', 'Evidence · PDF')
  await evaluate(`document.querySelector('[data-testid="graph-path-run"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-path-found"]')!==null`, 'connected shortest path')
  await delay(150)
  const foundText = await evaluate(`document.querySelector('[data-testid="graph-path-found"]')?.textContent?.replace(/\\s+/g,' ').trim()||''`)
  const focused = await snapshot()
  await capture('shortest-path-found.jpg')
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(200)
  const narrowFocused = await snapshot()
  await capture('shortest-path-narrow.jpg')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(100)
  await evaluate(`document.querySelector('[data-testid="graph-path-return"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-path-found"]')===null`, 'shortest-path return')
  const restored = await snapshot()
  await choose('[data-testid="graph-path-end"]', 'Review · PowerPoint 演示')
  await evaluate(`document.querySelector('[data-testid="graph-path-run"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-path-unreachable"]')!==null`, 'unreachable path state')
  const unreachableText = await evaluate(`document.querySelector('[data-testid="graph-path-unreachable"]')?.textContent?.replace(/\\s+/g,' ').trim()||''`)
  shortestPath = { foundText, focused, narrowFocused, restored, fullGraphRestored: restored.graphStats.startsWith('17 / 17 节点 17 连接'), unreachableText }
}

const clicked = await evaluate(`(()=>{const element=document.querySelector('.management-back');if(!(element instanceof HTMLElement))return false;element.click();return true})()`)
if (!clicked) throw new Error('M3A-1 return control missing')
await waitFor(`document.querySelector('.library-mode')!==null`, 'return to library')
const afterSha256 = await hashDirectory(library)
const evidence = {
  schemaVersion: 1,
  stage: stage === 'M3A3' ? 'M3A-3' : stage === 'M3A2' ? 'M3A-2' : 'M3A-1',
  actual: { wide, narrow, neighborFocus, shortestPath, returnedToLibrary: true, runtimeErrors: runtimeErrors.length, sourceFilesUnchanged: beforeSha256 === afterSha256, beforeSha256, afterSha256 },
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'desktop.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log(`${stage} desktop: ${wide.objectTypeIds.length} object types, ${wide.relationTypeIds.length} relation types, runtime errors ${runtimeErrors.length}`)
