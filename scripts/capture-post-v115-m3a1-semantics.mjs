import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M3A1_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M3A1_LIBRARY)
const stage = process.env.LONGEDIT_M3_STAGE || 'M3A1'
const theme = process.env.LONGEDIT_M3_THEME || 'dark'
const motion = process.env.LONGEDIT_M3_MOTION || 'reduced'
if (!endpoint) throw new Error(`${stage} capture environment is incomplete`)
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
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion === 'reduced' ? 'reduce' : 'no-preference' }] })
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null`, 'library initialization')
const initialGraphHash = ['M3A7', 'M3A8', 'M3B0', 'M3B1', 'M3B2', 'M3B4', 'M3B5', 'M3B6', 'M3B7', 'M3B8', 'M3B9', 'M3B10'].includes(stage) ? `#/graph?mode=network&root=${encodeURIComponent(path.join(library, 'NorthStar.md'))}` : '#/graph'
await evaluate(`location.hash=${JSON.stringify(initialGraphHash)}`)
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
let relationEvidence = null
if (stage === 'M3A3' || stage === 'M3A4') {
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
  if (stage === 'M3A4') {
    const evidenceSnapshot = await evaluate(`(()=>{const edges=[...document.querySelectorAll('[data-testid="graph-path-evidence-edge"]')];const mentions=[...document.querySelectorAll('[data-testid="graph-path-evidence-mention"]')];return {edgeCount:edges.length,mentionCount:mentions.length,edges:edges.map(edge=>({relationType:edge.dataset.relationType,directed:edge.dataset.directed,mentionCount:Number(edge.dataset.mentionCount||0),text:edge.textContent?.replace(/\\s+/g,' ').trim()||''})),allEdgesTypedAndDirected:edges.every(edge=>Boolean(edge.dataset.relationType)&&['true','false'].includes(edge.dataset.directed||'')),hasStructuralBoundary:Boolean(document.querySelector('[data-testid="graph-path-structural-evidence"]')),narrowFits:document.documentElement.scrollWidth<=innerWidth+1}})()`)
    await capture('relation-evidence-narrow.jpg')
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
    await delay(150)
    evidenceSnapshot.wideFits = await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`)
    await capture('relation-evidence-wide.jpg')
    const returned = await evaluate(`(()=>{const button=document.querySelector('[data-testid="graph-path-evidence-return"]');if(!(button instanceof HTMLButtonElement))return false;button.click();return true})()`)
    if (!returned) throw new Error('M3A-4 mention source return missing')
    await waitFor(`document.querySelector('.library-mode')!==null`, 'relation source library')
    await waitFor(`document.querySelector('.workspace-relation-evidence-target')?.dataset.relationEvidenceLine==='3'`, 'exact relation evidence line')
    const sourceReturn = await evaluate(`(()=>{const target=document.querySelector('.workspace-relation-evidence-target');return {line:target?.dataset.relationEvidenceLine||'',targetVisible:Boolean(target),targetText:target?.textContent?.replace(/\\s+/g,' ').trim()||'',hash:location.hash}})()`)
    await capture('relation-source-return.jpg')
    relationEvidence = { ...evidenceSnapshot, sourceReturn }
    shortestPath = { foundText, focused, narrowFocused }
    await evaluate(`location.hash='#/graph'`)
    await waitFor(`document.querySelector('[data-testid="graph-object-legend"] [data-semantic-id="pptx_slide"]')!==null`, 'graph return after evidence')
  } else {
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
}

let community = null
if (stage === 'M3A5') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await evaluate(`document.querySelector('[data-testid="graph-community-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-panel"]')!==null`, 'community panel')
  await delay(150)
  const readCommunityPanel = () => evaluate(`(()=>{const panel=document.querySelector('[data-testid="graph-community-panel"]');const cards=[...document.querySelectorAll('[data-testid="graph-community-card"]')];return {ids:cards.map(card=>card.dataset.communityId||''),counts:cards.map(card=>Number(card.dataset.nodeCount||0)),text:panel?.textContent?.replace(/\\s+/g,' ').trim()||'',fits:document.documentElement.scrollWidth<=innerWidth+1}})()`)
  const first = await readCommunityPanel()
  await capture('community-panel-wide.jpg')
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(150)
  const narrowPanel = await readCommunityPanel()
  await capture('community-panel-narrow.jpg')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(100)
  const selected = await evaluate(`(()=>{const cards=[...document.querySelectorAll('[data-testid="graph-community-card"]')];const card=cards.find(item=>Number(item.dataset.nodeCount||0)>1);if(!(card instanceof HTMLButtonElement))return null;const result={id:card.dataset.communityId||'',count:Number(card.dataset.nodeCount||0)};card.click();return result})()`)
  if (!selected) throw new Error('M3A-5 non-singleton community missing')
  await evaluate(`document.querySelector('[data-testid="graph-community-close"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')!==null`, 'community focus')
  await delay(120)
  const focused = await snapshot()
  const selectedNodeCount = Number(focused.graphStats.match(/^(\d+) \/ \d+ 节点/)?.[1] || 0)
  await capture('community-focus.jpg')
  await evaluate(`document.querySelector('[data-testid="graph-community-focus-return"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')===null`, 'community return')
  const restored = await snapshot()
  const restoredNodeCount = Number(restored.graphStats.match(/^(\d+) \/ \d+ 节点/)?.[1] || 0)
  await evaluate(`document.querySelector('.management-back')?.click()`)
  await waitFor(`document.querySelector('.library-mode')!==null`, 'library between community rebuilds')
  await evaluate(`location.hash='#/graph'`)
  await waitFor(`document.querySelector('[data-testid="graph-object-legend"] [data-semantic-id="pptx_slide"]')!==null`, 'community graph rebuild')
  await evaluate(`document.querySelector('[data-testid="graph-community-entry"]')?.click()`)
  await waitFor(`document.querySelectorAll('[data-testid="graph-community-card"]').length===${first.ids.length}`, 'rebuilt community panel')
  const rebuilt = await readCommunityPanel()
  community = {
    count: first.ids.length,
    ids: first.ids,
    nodeCounts: first.counts,
    panelText: first.text,
    wideFits: first.fits,
    narrowFits: narrowPanel.fits,
    selectedCommunityId: selected.id,
    expectedSelectedNodeCount: selected.count,
    selectedNodeCount,
    restoredNodeCount,
    rebuiltIds: rebuilt.ids,
    stableAcrossRebuild: JSON.stringify(first.ids) === JSON.stringify(rebuilt.ids),
  }
}

let nodeComparison = null
if (stage === 'M3A6') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await evaluate(`document.querySelector('[data-testid="graph-comparison-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-comparison-panel"]')!==null`, 'node comparison panel')
  const chooseComparison = async (selector, prefix) => {
    const chosen = await evaluate(`(()=>{const select=document.querySelector(${JSON.stringify(selector)});if(!(select instanceof HTMLSelectElement))return false;const option=[...select.options].find(item=>item.textContent?.startsWith(${JSON.stringify(prefix)}));if(!option)return false;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    if (!chosen) throw new Error(`M3A-6 option missing: ${prefix}`)
  }
  const readComparison = () => evaluate(`(()=>{const panel=document.querySelector('[data-testid="graph-comparison-panel"]');const common=document.querySelector('[data-testid="graph-comparison-common"]');const left=document.querySelector('[data-testid="graph-comparison-left-only"]');const right=document.querySelector('[data-testid="graph-comparison-right-only"]');const relations=[...document.querySelectorAll('[data-testid="graph-comparison-direct-relation"]')];return {commonCount:Number(common?.dataset.count||0),leftOnlyCount:Number(left?.dataset.count||0),rightOnlyCount:Number(right?.dataset.count||0),directRelationCount:relations.length,directRelationTypes:relations.map(item=>item.dataset.relationType||''),directRelationDirections:relations.map(item=>item.dataset.directed||''),mentionCount:relations.reduce((sum,item)=>sum+Number(item.dataset.mentionCount||0),0),text:panel?.textContent?.replace(/\\s+/g,' ').trim()||'',fits:document.documentElement.scrollWidth<=innerWidth+1}})()`)
  await chooseComparison('[data-testid="graph-comparison-left"]', 'NorthStar.md · Canvas 节点')
  await chooseComparison('[data-testid="graph-comparison-right"]', 'research/Roadmap.table.json · Canvas 节点')
  await evaluate(`document.querySelector('[data-testid="graph-comparison-run"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-comparison-common"]')?.dataset.count==='1'`, 'real common neighbor comparison')
  await delay(150)
  const wideComparison = await readComparison()
  await capture('node-comparison-wide.jpg')
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(200)
  const narrowComparison = await readComparison()
  await capture('node-comparison-narrow.jpg')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(100)
  await chooseComparison('[data-testid="graph-comparison-left"]', 'NorthStar · Markdown')
  await chooseComparison('[data-testid="graph-comparison-right"]', 'Brief · Markdown')
  await evaluate(`document.querySelector('[data-testid="graph-comparison-run"]')?.click()`)
  await waitFor(`document.querySelectorAll('[data-testid="graph-comparison-mention"]').length>=3`, 'direct relation mention evidence')
  await delay(120)
  const evidenceComparison = await readComparison()
  await capture('node-comparison-evidence.jpg')
  const returned = await evaluate(`(()=>{const button=document.querySelector('[data-testid="graph-comparison-mention"] [data-testid="graph-comparison-evidence-return"]');if(!(button instanceof HTMLButtonElement))return false;button.click();return true})()`)
  if (!returned) throw new Error('M3A-6 comparison evidence return missing')
  await waitFor(`document.querySelector('.library-mode')!==null`, 'comparison evidence source library')
  await waitFor(`document.querySelector('.workspace-relation-evidence-target')?.dataset.relationEvidenceLine==='3'`, 'comparison exact evidence line')
  const sourceReturn = await evaluate(`(()=>{const target=document.querySelector('.workspace-relation-evidence-target');return {line:target?.dataset.relationEvidenceLine||'',targetVisible:Boolean(target),targetText:target?.textContent?.replace(/\\s+/g,' ').trim()||'',hash:location.hash}})()`)
  await capture('node-comparison-source-return.jpg')
  nodeComparison = { ...wideComparison, wideFits: wideComparison.fits, narrowFits: narrowComparison.fits, evidencePair: evidenceComparison, sourceReturn }
  await evaluate(`location.hash='#/graph'`)
  await waitFor(`document.querySelector('[data-testid="graph-object-legend"] [data-semantic-id="pptx_slide"]')!==null`, 'graph return after comparison evidence')
}

let selectionHistory = null
let neighborPinning = null
if (stage === 'M3A7') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')!==null`, 'initial rooted graph selection')
  const selectedCount = () => evaluate(`Number(document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount||0)`)
  const initialSelectedCount = await selectedCount()
  await evaluate(`document.querySelector('canvas[data-selected-count]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}))`)
  await waitFor(`document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount==='17'`, 'select all graph nodes')
  const allSelectedCount = await selectedCount()
  await evaluate(`document.querySelector('canvas[data-selected-count]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
  await waitFor(`document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount==='0'`, 'clear graph selection')
  const clearedSelectedCount = await selectedCount()
  await delay(120)
  await evaluate(`document.querySelector('[data-testid="graph-selection-history-entry"]')?.click()`)
  await waitFor(`document.querySelectorAll('[data-testid="graph-selection-history-item"]').length>=3`, 'selection history entries')
  const readHistory = () => evaluate(`(()=>{const panel=document.querySelector('[data-testid="graph-selection-history-panel"]');return {entryCount:Number(panel?.dataset.count||0),cursor:Number(panel?.dataset.cursor||0),fits:document.documentElement.scrollWidth<=innerWidth+1,text:panel?.textContent?.replace(/\\s+/g,' ').trim()||''}})()`)
  const wideHistory = await readHistory()
  await capture('selection-history-wide.jpg')
  await evaluate(`document.querySelector('[data-testid="graph-selection-history-back"]')?.click()`)
  await waitFor(`document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount==='17'`, 'history back to all selection')
  const backToAllCount = await selectedCount()
  await evaluate(`document.querySelector('[data-testid="graph-selection-history-back"]')?.click()`)
  await waitFor(`document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount==='1'`, 'history back to initial selection')
  const backToInitialCount = await selectedCount()
  await evaluate(`document.querySelector('[data-testid="graph-selection-history-forward"]')?.click()`)
  await waitFor(`document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount==='17'`, 'history forward to all selection')
  const forwardToAllCount = await selectedCount()
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(180)
  const narrowHistory = await readHistory()
  await capture('selection-history-narrow.jpg')
  await evaluate(`document.querySelector('[data-testid="graph-selection-history-back"]')?.click()`)
  await waitFor(`document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount==='1'`, 'restore initial selection before pin')
  await evaluate(`document.querySelector('[data-testid="graph-selection-history-close"]')?.click()`)
  selectionHistory = { initialSelectedCount, allSelectedCount, clearedSelectedCount, backToAllCount, backToInitialCount, forwardToAllCount, entryCount: wideHistory.entryCount, wideFits: wideHistory.fits, narrowFits: narrowHistory.fits, panelText: wideHistory.text }

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await evaluate(`document.querySelector('[data-testid="graph-neighbor-pin-action"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="local-graph-rail"]')!==null`, 'pinned editor local graph rail')
  await waitFor(`Number(document.querySelector('[data-testid="local-graph-summary"]')?.dataset.nodeCount||0)>1`, 'pinned local graph data')
  await delay(160)
  const initialPin = await evaluate(`(()=>{const rail=document.querySelector('[data-testid="local-graph-rail"]');const summary=document.querySelector('[data-testid="local-graph-summary"]');return {path:rail?.dataset.activePath||'',nodeCount:Number(summary?.dataset.nodeCount||0),edgeCount:Number(summary?.dataset.edgeCount||0),fits:document.documentElement.scrollWidth<=innerWidth+1}})()`)
  await capture('neighbor-pinned-wide.jpg')
  const neighborClicked = await evaluate(`(()=>{const cards=[...document.querySelectorAll('[data-testid="local-graph-card"] .relation-card')];const button=cards.find(card=>card.querySelector('strong')?.textContent?.trim()==='Brief');if(!(button instanceof HTMLButtonElement))return false;button.click();return true})()`)
  if (!neighborClicked) throw new Error('M3A-7 pinned local graph Markdown neighbor missing')
  await waitFor(`document.querySelector('[data-testid="local-graph-rail"]')?.dataset.activePath?.endsWith('Brief.md')`, 'pinned local graph follows active tab')
  await waitFor(`document.querySelector('[data-testid="local-graph-card"]')?.dataset.currentPath?.endsWith('Brief.md')`, 'local graph center follows active tab')
  await delay(160)
  const followedPath = await evaluate(`document.querySelector('[data-testid="local-graph-rail"]')?.dataset.activePath||''`)
  await capture('neighbor-pinned-followed.jpg')
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(180)
  const narrowFits = await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`)
  await capture('neighbor-pinned-narrow.jpg')
  await evaluate(`document.querySelector('[data-testid="local-graph-unpin"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="local-graph-rail"]')===null`, 'local graph unpin')
  neighborPinning = { railVisible: true, initialPath: initialPin.path, initialNodeCount: initialPin.nodeCount, initialEdgeCount: initialPin.edgeCount, wideFits: initialPin.fits, followedPath, followedActiveTab: followedPath.endsWith('Brief.md') && followedPath !== initialPin.path, narrowFits, unpinned: true }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await evaluate(`location.hash='#/graph'`)
  await waitFor(`document.querySelector('[data-testid="graph-object-legend"] [data-semantic-id="pptx_slide"]')!==null`, 'graph return after neighbor pinning')
}

let combinedFlow = null
if (stage === 'M3A8') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')!==null`, 'M3A exit rooted selection')
  const readScope = () => evaluate(`document.querySelector('[data-testid="graph-container"]')?.dataset.activeExplorationScopes||'global'`)
  const graphShape = value => value.graphStats.match(/^\d+ \/ \d+ 节点 \d+ 连接/)?.[0] || ''
  const scopeSequence = []
  const chooseExit = async (selector, prefix) => {
    const chosen = await evaluate(`(()=>{const select=document.querySelector(${JSON.stringify(selector)});if(!(select instanceof HTMLSelectElement))return false;const option=[...select.options].find(item=>item.textContent?.startsWith(${JSON.stringify(prefix)}));if(!option)return false;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    if (!chosen) throw new Error(`M3A exit option missing: ${prefix}`)
  }

  await evaluate(`document.querySelector('[data-testid="graph-neighbor-focus-action"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-container"]')?.dataset.activeExplorationScopes==='neighbor'`, 'exclusive neighbor scope')
  scopeSequence.push(await readScope())
  const oneHop = graphShape(await snapshot())
  await evaluate(`(()=>{const select=document.querySelector('[data-testid="graph-neighbor-focus-depth"]');if(!(select instanceof HTMLSelectElement))return false;select.value='3';select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  await delay(150)
  const threeHop = graphShape(await snapshot())

  await evaluate(`document.querySelector('[data-testid="graph-path-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-container"]')?.dataset.activeExplorationScopes==='path'`, 'path replaces neighbor scope')
  scopeSequence.push(await readScope())
  await chooseExit('[data-testid="graph-path-start"]', 'NorthStar · Markdown')
  await chooseExit('[data-testid="graph-path-end"]', 'Evidence · PDF')
  await evaluate(`document.querySelector('[data-testid="graph-path-run"]')?.click()`)
  await waitFor(`document.querySelectorAll('[data-testid="graph-path-evidence-edge"]').length===3`, 'combined shortest-path evidence')
  const pathSnapshot = await snapshot()
  const path = {
    scope: await readScope(),
    graphShape: graphShape(pathSnapshot),
    edgeCount: Number((await evaluate(`document.querySelector('[data-testid="graph-path-found"]')?.querySelector('strong')?.textContent?.match(/\\d+/)?.[0]||0`))),
    evidenceEdgeCount: await evaluate(`document.querySelectorAll('[data-testid="graph-path-evidence-edge"]').length`),
  }
  await capture('combined-neighbor-path.jpg')

  await evaluate(`document.querySelector('[data-testid="graph-community-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-container"]')?.dataset.activeExplorationScopes==='community'`, 'community replaces path scope')
  scopeSequence.push(await readScope())
  const selectedCommunity = await evaluate(`(()=>{const cards=[...document.querySelectorAll('[data-testid="graph-community-card"]')];const card=cards.find(item=>Number(item.dataset.nodeCount||0)>1);if(!(card instanceof HTMLButtonElement))return null;const result={id:card.dataset.communityId||'',count:Number(card.dataset.nodeCount||0)};card.click();return result})()`)
  if (!selectedCommunity) throw new Error('M3A exit non-singleton community missing')
  await evaluate(`document.querySelector('[data-testid="graph-community-close"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')!==null`, 'combined community focus')
  const communitySnapshot = await snapshot()
  const community = { scope: await readScope(), expectedNodeCount: selectedCommunity.count, nodeCount: Number(communitySnapshot.graphStats.match(/^(\d+)/)?.[1] || 0), graphShape: graphShape(communitySnapshot) }
  await capture('combined-community.jpg')

  await evaluate(`document.querySelector('[data-testid="graph-comparison-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-container"]')?.dataset.activeExplorationScopes==='comparison'`, 'comparison replaces community scope')
  scopeSequence.push(await readScope())
  await chooseExit('[data-testid="graph-comparison-left"]', 'NorthStar.md · Canvas 节点')
  await chooseExit('[data-testid="graph-comparison-right"]', 'research/Roadmap.table.json · Canvas 节点')
  await evaluate(`document.querySelector('[data-testid="graph-comparison-run"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-comparison-common"]')?.dataset.count==='1'`, 'combined node comparison')
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(180)
  const comparison = { scope: await readScope(), commonCount: Number(await evaluate(`document.querySelector('[data-testid="graph-comparison-common"]')?.dataset.count||0`)) }
  const narrowFits = await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`)
  await capture('combined-comparison-narrow.jpg')

  await evaluate(`document.querySelector('.graph-comparison-close')?.click()`)
  await evaluate(`document.querySelector('[data-testid="graph-selection-history-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-container"]')?.dataset.activeExplorationScopes==='history'`, 'history replaces comparison scope')
  scopeSequence.push(await readScope())
  const restoredHistory = await evaluate(`(()=>{const item=[...document.querySelectorAll('[data-testid="graph-selection-history-item"]')].find(button=>button.dataset.selectedCount==='1');if(!(item instanceof HTMLButtonElement))return false;item.click();return true})()`)
  if (!restoredHistory) throw new Error('M3A exit initial selection history missing')
  await waitFor(`document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount==='1'`, 'combined history restore')
  const history = { scope: await readScope(), restoredSelectedCount: Number(await evaluate(`document.querySelector('canvas[data-selected-count]')?.dataset.selectedCount||0`)) }
  await capture('combined-history-narrow.jpg')
  await evaluate(`document.querySelector('[data-testid="graph-selection-history-close"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-container"]')?.dataset.activeExplorationScopes===''`, 'global scope after history')
  scopeSequence.push('global')

  await evaluate(`document.querySelector('[data-testid="graph-neighbor-pin-action"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="local-graph-rail"]')!==null`, 'combined pinned editor rail')
  await waitFor(`document.querySelector('[data-testid="local-graph-summary"]')?.dataset.nodeCount==='6'`, 'combined pinned graph nodes')
  const pinning = await evaluate(`(()=>{const summary=document.querySelector('[data-testid="local-graph-summary"]');return {railVisible:Boolean(document.querySelector('[data-testid="local-graph-rail"]')),nodeCount:Number(summary?.dataset.nodeCount||0),edgeCount:Number(summary?.dataset.edgeCount||0),unpinned:false}})()`)
  await capture('combined-pinned-narrow.jpg')
  await evaluate(`document.querySelector('[data-testid="local-graph-unpin"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="local-graph-rail"]')===null`, 'combined local graph unpin')
  pinning.unpinned = true
  combinedFlow = {
    objectTypeCount: wide.objectTypeIds.length,
    relationTypeCount: wide.relationTypeIds.length,
    neighbor: { oneHop, threeHop },
    path,
    community,
    comparison,
    history,
    pinning,
    scopeSequence,
    wideFits: wide.documentFits && pathSnapshot.documentFits && communitySnapshot.documentFits,
    narrowFits,
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await evaluate(`location.hash='#/graph'`)
  await waitFor(`document.querySelector('[data-testid="graph-object-legend"] [data-semantic-id="pptx_slide"]')!==null`, 'graph return after combined pinning')
}

let visualBaseline = null
if (stage === 'M3B0') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  const readZoom = () => evaluate(`Number(document.querySelector('.graph-stats')?.textContent?.match(/(\\d+)%/)?.[1]||0)`)
  const wheelZoom = async (deltaY, times) => {
    const rect = await evaluate(`(()=>{const rect=document.querySelector('[data-testid="graph-container"] canvas')?.getBoundingClientRect();return rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`)
    if (!rect) throw new Error('M3B-0 graph canvas missing')
    for (let index = 0; index < times; index += 1) {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY })
      await delay(60)
    }
  }
  await capture('visual-baseline-default.jpg')
  const defaultZoomPercent = await readZoom()
  await wheelZoom(120, 12)
  const farZoomPercent = await readZoom()
  await capture('visual-baseline-far.jpg')
  await wheelZoom(-120, 18)
  const nearZoomPercent = await readZoom()
  await capture('visual-baseline-near.jpg')

  await evaluate(`document.querySelector('[data-testid="graph-community-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-panel"]')!==null`, 'M3B-0 community panel')
  const selectedCommunity = await evaluate(`(()=>{const card=[...document.querySelectorAll('[data-testid="graph-community-card"]')].find(item=>Number(item.dataset.nodeCount||0)>1);if(!(card instanceof HTMLButtonElement))return null;const result={id:card.dataset.communityId||'',count:Number(card.dataset.nodeCount||0)};card.click();return result})()`)
  if (!selectedCommunity) throw new Error('M3B-0 community fixture missing')
  await evaluate(`document.querySelector('[data-testid="graph-community-close"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')!==null`, 'M3B-0 community focus')
  await delay(120)
  await capture('visual-baseline-community.jpg')
  await evaluate(`document.querySelector('[data-testid="graph-community-focus-return"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')===null`, 'M3B-0 full community return')

  await evaluate(`document.querySelector('[data-testid="graph-path-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-path-panel"]')!==null`, 'M3B-0 path panel')
  const chooseBaseline = async (selector, prefix) => {
    const chosen = await evaluate(`(()=>{const select=document.querySelector(${JSON.stringify(selector)});if(!(select instanceof HTMLSelectElement))return false;const option=[...select.options].find(item=>item.textContent?.startsWith(${JSON.stringify(prefix)}));if(!option)return false;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    if (!chosen) throw new Error(`M3B-0 option missing: ${prefix}`)
  }
  await chooseBaseline('[data-testid="graph-path-start"]', 'NorthStar · Markdown')
  await chooseBaseline('[data-testid="graph-path-end"]', 'Evidence · PDF')
  await evaluate(`document.querySelector('[data-testid="graph-path-run"]')?.click()`)
  await waitFor(`document.querySelectorAll('[data-testid="graph-path-evidence-edge"]').length===3`, 'M3B-0 path evidence')
  await delay(120)
  await capture('visual-baseline-path.jpg')

  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
  await delay(180)
  const narrowFits = await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`)
  await capture('visual-baseline-narrow.jpg')
  visualBaseline = {
    defaultZoomPercent,
    farZoomPercent,
    nearZoomPercent,
    farEdgesExpectedByCurrentThreshold: farZoomPercent > 30,
    farLabelsExpectedByCurrentThreshold: farZoomPercent > 40,
    selectedCommunity,
    pathEdgeCount: await evaluate(`document.querySelectorAll('[data-testid="graph-path-evidence-edge"]').length`),
    relationLabelsVisible: Boolean(await evaluate(`document.querySelector('[data-testid="graph-relation-label"]')`)),
    minimapVisible: Boolean(await evaluate(`document.querySelector('[data-testid="graph-minimap"]')`)),
    narrowFits,
    motionPreference: 'reduced',
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
}

let semanticZoom = null
let semanticHierarchy = null
let pathVisual = null
let pathMotion = null
let navigationBaseline = null
let cameraNavigation = null
let remainingNavigationSelection = null
let remainingVisualSelection = null
let minimapNavigation = null
if (stage === 'M3B1' || stage === 'M3B2') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  const readLevel = () => evaluate(`document.querySelector('[data-testid="graph-semantic-zoom-status"]')?.dataset.level||''`)
  const wheel = async deltaY => {
    const rect = await evaluate(`(()=>{const rect=document.querySelector('[data-testid="graph-container"] canvas')?.getBoundingClientRect();return rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`)
    if (!rect) throw new Error(`${stage} graph canvas missing`)
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY })
    await delay(80)
  }
  const reachLevel = async targetLevel => {
    const rank = { far: 0, middle: 1, near: 2 }
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const current = await readLevel()
      if (current === targetLevel) return
      await wheel(rank[current] < rank[targetLevel] ? -120 : 120)
    }
    throw new Error(`${stage} could not reach ${targetLevel}`)
  }
  const viewportSnapshot = async (width, height, file) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await delay(180)
    await reachLevel('far')
    await waitFor(`document.querySelector('[data-testid="graph-community-overview"]')!==null`, `${width}x${height} far overview`)
    await waitFor(`document.querySelector('[data-testid="graph-container"] canvas')?.dataset.communityOverviewInBounds==='true'`, `${width}x${height} overview bounds`)
    const result = await evaluate(`(()=>({width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth+1,overviewVisible:Boolean(document.querySelector('[data-testid="graph-community-overview"]')),overviewInBounds:document.querySelector('[data-testid="graph-container"] canvas')?.dataset.communityOverviewInBounds==='true',level:document.querySelector('[data-testid="graph-semantic-zoom-status"]')?.dataset.level||''}))()`)
    await capture(file)
    return result
  }

  await waitFor(`document.querySelector('[data-testid="graph-semantic-zoom-status"]')?.dataset.level==='near'`, 'M3B-1 near level')
  const readContours = () => evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-container"] canvas');return {count:Number(canvas?.dataset.communityContourCount||0),coversMembers:canvas?.dataset.communityContoursCoverMembers==='true'}})()`)
  const near = { level: await readLevel(), zoomPercent: await evaluate(`Number(document.querySelector('.graph-stats')?.textContent?.match(/(\\d+)%/)?.[1]||0)`), contours: await readContours() }
  await capture(`${theme}-near-1280.jpg`)
  await reachLevel('middle')
  const middle = { level: await readLevel(), zoomPercent: await evaluate(`Number(document.querySelector('.graph-stats')?.textContent?.match(/(\\d+)%/)?.[1]||0)`), contours: await readContours() }
  await capture(`${theme}-middle-1280.jpg`)
  await reachLevel('far')
  await waitFor(`document.querySelectorAll('[data-testid="graph-community-overview-entry"]').length===5`, 'M3B-1 five community overview entries')
  const far = { level: await readLevel(), zoomPercent: await evaluate(`Number(document.querySelector('.graph-stats')?.textContent?.match(/(\\d+)%/)?.[1]||0)`), contours: await readContours() }
  const overviewEntryCount = await evaluate(`document.querySelectorAll('[data-testid="graph-community-overview-entry"]').length`)
  await capture(`${theme}-far-1280.jpg`)

  const enteredCommunityNodeCount = await evaluate(`(()=>{const entry=document.querySelector('[data-testid="graph-community-overview-entry"]');if(!(entry instanceof HTMLButtonElement))return 0;const count=Number(entry.dataset.nodeCount||0);entry.click();return count})()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')!==null`, 'M3B-1 entered community')
  await waitFor(`document.querySelector('[data-testid="graph-semantic-zoom-status"]')?.dataset.level==='near'`, 'M3B-1 entered community near level')
  await capture(`${theme}-community-entered-1280.jpg`)
  await evaluate(`document.querySelector('[data-testid="graph-community-focus-return"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')===null`, 'M3B-1 community return')
  await reachLevel('far')
  await waitFor(`document.querySelector('[data-testid="graph-community-overview"]')!==null`, 'M3B-1 overview return')
  const returnedToOverview = true
  const viewports = [
    await viewportSnapshot(1280, 800, `${theme}-far-returned-1280.jpg`),
    await viewportSnapshot(1000, 700, `${theme}-far-1000.jpg`),
    await viewportSnapshot(720, 680, `${theme}-far-720.jpg`),
  ]
  const contourViewports = []
  if (stage === 'M3B2') {
    await evaluate(`document.querySelector('.details-close')?.click()`)
    for (const [width, height] of [[720, 680], [1000, 700], [1280, 800]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      await delay(180)
      await reachLevel('middle')
      const contourState = await readContours()
      contourViewports.push({ width, height, fits: await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), level: await readLevel(), ...contourState })
      await capture(`${theme}-middle-${width}.jpg`)
    }
  }
  semanticZoom = {
    levels: [near.level, middle.level, far.level],
    zoomPercents: { near: near.zoomPercent, middle: middle.zoomPercent, far: far.zoomPercent },
    communityCount: 5,
    overviewEntryCount,
    enteredCommunityNodeCount,
    returnedToOverview,
    viewports,
    motionPreference: 'reduced',
  }
  semanticHierarchy = {
    nearContours: near.contours,
    middleContours: middle.contours,
    farContours: far.contours,
    stableCommunityCount: overviewEntryCount,
    contourViewports,
    nodeLayoutMutation: false,
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
}

if (stage === 'M3B4' || stage === 'M3B5') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(180)
  const initialRoutes = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {curved:Number(canvas?.dataset.curvedRouteCount||0),parallel:Number(canvas?.dataset.parallelRouteCount||0)}})()`)
  await capture(`${theme}-curved-parallel-global-1280.jpg`)
  await evaluate(`document.querySelector('[data-testid="graph-path-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-path-panel"]')!==null`, `${stage} path panel`)
  const choosePath = async (selector, prefix) => {
    const chosen = await evaluate(`(()=>{const select=document.querySelector(${JSON.stringify(selector)});if(!(select instanceof HTMLSelectElement))return false;const option=[...select.options].find(item=>item.textContent?.startsWith(${JSON.stringify(prefix)}));if(!option)return false;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    if (!chosen) throw new Error(`${stage} option missing: ${prefix}`)
  }
  await choosePath('[data-testid="graph-path-start"]', 'NorthStar · Markdown')
  await choosePath('[data-testid="graph-path-end"]', 'Evidence · PDF')
  await evaluate(`document.querySelector('[data-testid="graph-path-run"]')?.click()`)
  await waitFor(`document.querySelectorAll('[data-testid="graph-path-evidence-edge"]').length===3`, `${stage} verified path evidence`)
  const viewports = []
  for (const [width, height] of [[1280, 800], [1000, 700], [720, 680]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await delay(260)
    await evaluate(`document.querySelector('button[title="适合窗口"]')?.click()`)
    await delay(120)
    const cameraDiagnostic = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {safe:canvas?.dataset.pathCameraSafe==='true',diagnostics:canvas?.dataset.pathCameraDiagnostics||''}})()`)
    if (!cameraDiagnostic.safe) throw new Error(`${width}x${height} path camera unsafe: ${cameraDiagnostic.diagnostics}`)
    const viewport = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');const panel=document.querySelector('[data-testid="graph-path-panel"]');const rect=panel?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth+1,cameraSafe:canvas?.dataset.pathCameraSafe==='true',pathLabelCount:Number(canvas?.dataset.pathRelationLabelCount||0),panelInBounds:Boolean(rect&&rect.left>=0&&rect.top>=0&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1),panelRect:rect?{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}:null}})()`)
    viewports.push(viewport)
    await capture(`${theme}-path-${width}.jpg`)
  }
  pathVisual = {
    curvedRouteCount: initialRoutes.curved,
    parallelRouteCount: initialRoutes.parallel,
    evidenceEdgeCount: await evaluate(`document.querySelectorAll('[data-testid="graph-path-evidence-edge"]').length`),
    pathLabelCount: await evaluate(`Number(document.querySelector('[data-testid="graph-canvas"]')?.dataset.pathRelationLabelCount||0)`),
    viewports,
  }
  if (stage === 'M3B5') {
    const motionViewports = []
    for (const [width, height] of [[1280, 800], [720, 680]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      await delay(420)
      const before = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {pixels:canvas?.toDataURL('image/png')||'',phase:Number(canvas?.dataset.pathMotionPhase||0),frames:Number(canvas?.dataset.pathMotionFrames||0),state:canvas?.dataset.pathMotionState||'',reduced:canvas?.dataset.pathMotionReduced==='true',segments:Number(canvas?.dataset.pathMotionTraversalSegments||0),forward:Number(canvas?.dataset.pathMotionForwardSegments||0),reverse:Number(canvas?.dataset.pathMotionReverseSegments||0),labels:Number(canvas?.dataset.pathRelationLabelCount||0)}})()`)
      await capture(`${theme}-${motion}-path-motion-${width}-before.jpg`)
      await delay(320)
      const after = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {pixels:canvas?.toDataURL('image/png')||'',phase:Number(canvas?.dataset.pathMotionPhase||0),frames:Number(canvas?.dataset.pathMotionFrames||0),state:canvas?.dataset.pathMotionState||'',reduced:canvas?.dataset.pathMotionReduced==='true',segments:Number(canvas?.dataset.pathMotionTraversalSegments||0),forward:Number(canvas?.dataset.pathMotionForwardSegments||0),reverse:Number(canvas?.dataset.pathMotionReverseSegments||0),labels:Number(canvas?.dataset.pathRelationLabelCount||0)}})()`)
      await capture(`${theme}-${motion}-path-motion-${width}-after.jpg`)
      motionViewports.push({ width, height, state: after.state, reduced: after.reduced, traversalSegments: after.segments, forwardSegments: after.forward, reverseSegments: after.reverse, labelCount: after.labels, phaseChanged: after.phase !== before.phase, framesAdvanced: after.frames > before.frames, pixelsChanged: after.pixels !== before.pixels })
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
    await delay(180)
    const beforePause = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');window.dispatchEvent(new Event('blur'));return Number(canvas?.dataset.pathMotionFrames||0)})()`)
    await delay(320)
    const pausedSnapshot = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {state:canvas?.dataset.pathMotionState||'',frames:Number(canvas?.dataset.pathMotionFrames||0)}})()`)
    await evaluate(`window.dispatchEvent(new Event('focus'))`)
    await delay(320)
    const resumedSnapshot = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {state:canvas?.dataset.pathMotionState||'',frames:Number(canvas?.dataset.pathMotionFrames||0)}})()`)
    pathMotion = {
      preference: motion,
      viewports: motionViewports,
      pause: { beforeFrames: beforePause, state: pausedSnapshot.state, framesStable: pausedSnapshot.frames === beforePause },
      resume: { state: resumedSnapshot.state, framesAdvanced: resumedSnapshot.frames > pausedSnapshot.frames, framesStable: resumedSnapshot.frames === pausedSnapshot.frames },
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
}

if (stage === 'M3B6') {
  const viewports = []
  await evaluate(`document.querySelector('.details-close')?.click()`)
  for (const [width, height] of [[1280, 800], [1000, 700], [720, 680]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await delay(220)
    await evaluate(`(()=>{const controls=document.querySelector('.graph-controls');if(controls)controls.scrollLeft=Math.max(0,controls.scrollWidth-controls.clientWidth)})()`)
    await delay(220)
    const viewport = await evaluate(`(()=>{const controls=document.querySelector('.graph-controls');const fit=document.querySelector('.graph-controls button[title="适合窗口"]')||document.querySelector('.graph-controls .control-btn:last-child');const controlRect=controls?.getBoundingClientRect();const fitRect=fit?.getBoundingClientRect();const facts={width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth+1,controlsScrollable:Boolean(controls&&controls.scrollWidth>controls.clientWidth),controlsScrollLeft:controls?.scrollLeft||0,controlsMaxScroll:controls?Math.max(0,controls.scrollWidth-controls.clientWidth):0,controlRect:controlRect?{left:controlRect.left,right:controlRect.right,width:controlRect.width}:null,fitRect:fitRect?{left:fitRect.left,right:fitRect.right,width:fitRect.width}:null,fitTitle:fit?.getAttribute('title')||'',fitReachable:Boolean(controlRect&&fitRect&&fitRect.left>=controlRect.left-1&&fitRect.right<=controlRect.right+1),zoomText:document.querySelector('.graph-stats')?.textContent?.match(/(\\d+)%/)?.[1]||'',minimapVisible:Boolean(document.querySelector('[data-testid="graph-minimap"]')),fitSelectionVisible:Boolean(document.querySelector('[data-testid="graph-fit-selection"]')),fullscreenVisible:Boolean(document.querySelector('[data-testid="graph-fullscreen"]'))};fit?.click();return facts})()`)
    await delay(120)
    viewports.push(viewport)
    await capture(`navigation-baseline-${width}.jpg`)
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(160)
  const beforeFocus = await evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.toDataURL('image/png')||''`)
  const focused = await evaluate(`(()=>{const input=document.querySelector('.graph-search input');if(!(input instanceof HTMLInputElement))return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(input,'Evidence');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true})()`)
  if (!focused) throw new Error('M3B-6 search focus entry missing')
  await delay(0)
  const immediateFocus = await evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.toDataURL('image/png')||''`)
  await delay(260)
  const settledFocus = await evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.toDataURL('image/png')||''`)
  await capture('navigation-immediate-node-focus.jpg')

  await evaluate(`(()=>{const input=document.querySelector('.graph-search input');if(input instanceof HTMLInputElement){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}))}document.querySelector('[data-testid="graph-community-entry"]')?.click()})()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-panel"]')!==null`, 'M3B-6 community panel')
  await delay(80)
  const fullGraphStats = await evaluate(`document.querySelector('.graph-stats')?.textContent?.replace(/\\s+/g,' ').trim()||''`)
  const enteredCommunityCount = await evaluate(`(()=>{const entry=[...document.querySelectorAll('[data-testid="graph-community-card"]')].find(item=>Number(item.dataset.nodeCount||0)>1);const count=Number(entry?.dataset.nodeCount||0);entry?.click();return count})()`)
  if (!enteredCommunityCount) throw new Error('M3B-6 non-singleton community missing')
  await evaluate(`document.querySelector('[data-testid="graph-community-close"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')!==null`, 'M3B-6 community focus')
  await delay(120)
  const communityStats = await evaluate(`document.querySelector('.graph-stats')?.textContent?.replace(/\\s+/g,' ').trim()||''`)
  await capture('navigation-community-filter.jpg')
  await evaluate(`document.querySelector('[data-testid="graph-community-focus-return"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')===null`, 'M3B-6 community return')
  navigationBaseline = {
    viewports,
    nodeFocus: { canvasChangedImmediately: beforeFocus !== immediateFocus, stableAfterImmediateFocus: immediateFocus === settledFocus },
    community: { fullGraphStats, enteredCommunityCount, communityStats, returned: true, interactionKind: 'filtered-subgraph' },
    capabilities: { fitAll: true, fitSelection: false, smoothFocus: false, minimap: false, clusterCollapseExpand: false, fullscreen: false },
  }
}

if (stage === 'M3B7') {
  const viewports = []
  await evaluate(`document.querySelector('.details-close')?.click()`)
  for (const [width, height] of [[1280, 800], [1000, 700], [720, 680]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await delay(220)
    await evaluate(`(()=>{const controls=document.querySelector('.graph-controls');if(controls)controls.scrollLeft=Math.max(0,controls.scrollWidth-controls.clientWidth)})()`)
    await delay(260)
    const viewport = await evaluate(`(()=>{const controls=document.querySelector('.graph-controls');const fitAll=document.querySelector('[data-testid="graph-fit-all"]');const fitSelection=document.querySelector('[data-testid="graph-fit-selection"]');const controlRect=controls?.getBoundingClientRect();const allRect=fitAll?.getBoundingClientRect();const selectionRect=fitSelection?.getBoundingClientRect();const reachable=rect=>Boolean(controlRect&&rect&&rect.left>=controlRect.left-1&&rect.right<=controlRect.right+1);return {width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth+1,controlsScrollable:Boolean(controls&&controls.scrollWidth>controls.clientWidth),controlsScrollLeft:controls?.scrollLeft||0,controlsMaxScroll:controls?Math.max(0,controls.scrollWidth-controls.clientWidth):0,fitAllReachable:reachable(allRect),fitSelectionReachable:reachable(selectionRect),fitSelectionDisabled:Boolean(fitSelection?.disabled)}})()`)
    viewports.push(viewport)
    await capture(`camera-toolbar-${width}-${motion}.jpg`)
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(220)
  const focusStartedAt = Date.now()
  await evaluate(`(()=>{const input=document.querySelector('.graph-search input');if(!(input instanceof HTMLInputElement))return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(input,'Evidence');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true})()`)
  await waitFor(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return canvas?.dataset.cameraMotionReason==='node-focus'&&['running','reduced','completed'].includes(canvas.dataset.cameraMotionState||'')})()`, 'M3B-7 node focus start')
  const focusStart = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {state:canvas?.dataset.cameraMotionState||'',frames:Number(canvas?.dataset.cameraMotionFrames||0),reduced:canvas?.dataset.cameraMotionReduced==='true'}})()`)
  await waitFor(`(()=>{const state=document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionState;return state==='completed'||state==='reduced'})()`, 'M3B-7 node focus completion')
  const focusElapsedMs = Date.now() - focusStartedAt
  await delay(80)
  const focusCompletePixels = await evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.toDataURL('image/png')||''`)
  const focusComplete = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');const canvasRect=canvas?.getBoundingClientRect();const panelRect=document.querySelector('[data-testid="graph-selected-node"]')?.getBoundingClientRect();const diagnostics=JSON.parse(canvas?.dataset.cameraFocusDiagnostics||'{}');delete diagnostics.nodeId;return {state:canvas?.dataset.cameraMotionState||'',reason:canvas?.dataset.cameraMotionReason||'',frames:Number(canvas?.dataset.cameraMotionFrames||0),pose:JSON.parse(canvas?.dataset.cameraPose||'{}'),diagnostics,selectedCount:Number(canvas?.dataset.selectedCount||0),detailsOverlap:Boolean(canvasRect&&panelRect&&panelRect.left<canvasRect.right&&panelRect.right>canvasRect.left)}})()`)
  await delay(300)
  const focusSettledPixels = await evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.toDataURL('image/png')||''`)
  await capture(`camera-node-focus-${motion}.jpg`)

  const cancellationsBefore = await evaluate(`Number(document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionCancellations||0)`)
  await evaluate(`(()=>{const input=document.querySelector('.graph-search input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!(input instanceof HTMLInputElement))return;setter?.call(input,'North');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()`)
  if (motion === 'calm') await waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionState==='running'`, 'M3B-7 cancellable focus')
  await delay(35)
  await evaluate(`(()=>{const input=document.querySelector('.graph-search input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!(input instanceof HTMLInputElement))return;setter?.call(input,'Brief');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()`)
  await waitFor(`(()=>{const state=document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionState;return state==='completed'||state==='reduced'})()`, 'M3B-7 replacement focus')
  const replacementFocus = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return {state:canvas?.dataset.cameraMotionState||'',reason:canvas?.dataset.cameraMotionReason||'',frames:Number(canvas?.dataset.cameraMotionFrames||0),cancellations:Number(canvas?.dataset.cameraMotionCancellations||0)}})()`)

  await evaluate(`(()=>{const input=document.querySelector('.graph-search input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(input instanceof HTMLInputElement){setter?.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}))}document.querySelector('.details-close')?.click();document.querySelector('[data-testid="graph-fit-all"]')?.click()})()`)
  await delay(180)
  let selectedCount = 0
  for (const ratio of [0.46, 0.58, 0.7, 0.82]) {
    await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');if(!(canvas instanceof HTMLCanvasElement))return;canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const rect=canvas.getBoundingClientRect();const startX=rect.left+8,startY=rect.top+8;const endX=rect.left+rect.width*${ratio},endY=rect.top+rect.height*${ratio};canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:startX,clientY:startY,shiftKey:true,bubbles:true}));canvas.dispatchEvent(new MouseEvent('mousemove',{button:0,clientX:endX,clientY:endY,shiftKey:true,bubbles:true}));canvas.dispatchEvent(new MouseEvent('mouseup',{button:0,clientX:endX,clientY:endY,shiftKey:true,bubbles:true}))})()`)
    await delay(60)
    selectedCount = await evaluate(`Number(document.querySelector('[data-testid="graph-canvas"]')?.dataset.selectedCount||0)`)
    if (selectedCount >= 2 && selectedCount < 17) break
  }
  if (selectedCount < 2 || selectedCount >= 17) throw new Error(`M3B-7 bounded multi-selection missing: ${selectedCount}`)
  const fitSelectionEnabled = await evaluate(`document.querySelector('[data-testid="graph-fit-selection"]')?.disabled===false`)
  await evaluate(`document.querySelector('[data-testid="graph-fit-selection"]')?.click()`)
  await waitFor(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');const state=canvas?.dataset.cameraMotionState;return canvas?.dataset.cameraMotionReason==='fit-selection'&&(state==='completed'||state==='reduced')})()`, 'M3B-7 fit selection completion')
  await delay(80)
  const fitCompletePixels = await evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.toDataURL('image/png')||''`)
  const fitSelection = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');const diagnostics=JSON.parse(canvas?.dataset.fitSelectionDiagnostics||'{}');diagnostics.nodeCount=diagnostics.nodeIds?.length||0;delete diagnostics.nodeIds;return {state:canvas?.dataset.cameraMotionState||'',frames:Number(canvas?.dataset.cameraMotionFrames||0),selectedCount:Number(canvas?.dataset.selectedCount||0),pose:JSON.parse(canvas?.dataset.cameraPose||'{}'),diagnostics}})()`)
  await delay(300)
  const fitSettledPixels = await evaluate(`document.querySelector('[data-testid="graph-canvas"]')?.toDataURL('image/png')||''`)
  await capture(`camera-fit-selection-${motion}.jpg`)

  cameraNavigation = {
    viewports,
    focus: { start: focusStart, complete: focusComplete, elapsedMs: focusElapsedMs, stableAfterCompletion: focusCompletePixels === focusSettledPixels },
    replacementFocus: { cancellationsBefore, ...replacementFocus },
    fitSelection: { enabled: fitSelectionEnabled, ...fitSelection, stableAfterCompletion: fitCompletePixels === fitSettledPixels },
  }
}

if (stage === 'M3B8') {
  const viewports = []
  await evaluate(`document.querySelector('.details-close')?.click()`)
  for (const [width, height] of [[1280, 800], [1000, 700], [720, 680]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await delay(240)
    const cameraPoseInitiallyAvailable = await evaluate(`Boolean(document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraPose)`)
    await evaluate(`document.querySelector('[data-testid="graph-fit-all"]')?.click()`)
    await delay(80)
    const viewport = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');const container=document.querySelector('[data-testid="graph-container"]');const legend=document.querySelector('[data-testid="graph-semantic-legend"]');const stats=document.querySelector('.graph-stats');const rect=element=>{const value=element?.getBoundingClientRect();return value?{left:Math.round(value.left),top:Math.round(value.top),right:Math.round(value.right),bottom:Math.round(value.bottom),width:Math.round(value.width),height:Math.round(value.height)}:null};return {width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth+1,canvasRect:rect(canvas),containerRect:rect(container),legendRect:rect(legend),statsRect:rect(stats),semanticZoomLevel:container?.dataset.semanticZoomLevel||'',cameraPoseAvailable:Boolean(canvas?.dataset.cameraPose),minimapVisible:Boolean(document.querySelector('[data-testid="graph-minimap"]')),clusterCollapseExpandVisible:Boolean(document.querySelector('[data-testid="graph-cluster-collapse"],[data-testid="graph-cluster-expand"]')),fullscreenVisible:Boolean(document.querySelector('[data-testid="graph-fullscreen"]')),fullscreenApiAvailable:typeof document.documentElement.requestFullscreen==='function'}})()`)
    viewport.cameraPoseInitiallyAvailable = cameraPoseInitiallyAvailable
    viewport.cameraPoseInitializedByFitAll = !cameraPoseInitiallyAvailable && viewport.cameraPoseAvailable
    viewports.push(viewport)
    await capture(`remaining-navigation-${width}.jpg`)
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(180)
  const fullGraphStats = await evaluate(`document.querySelector('.graph-stats')?.textContent?.replace(/\\s+/g,' ').trim()||''`)
  await evaluate(`document.querySelector('[data-testid="graph-community-entry"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-panel"]')!==null`, 'M3B-8 community panel')
  const enteredCommunityCount = await evaluate(`(()=>{const entry=[...document.querySelectorAll('[data-testid="graph-community-card"]')].find(item=>Number(item.dataset.nodeCount||0)>1);const count=Number(entry?.dataset.nodeCount||0);entry?.click();return count})()`)
  if (!enteredCommunityCount) throw new Error('M3B-8 non-singleton community missing')
  await evaluate(`document.querySelector('[data-testid="graph-community-close"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')!==null`, 'M3B-8 community filter')
  await delay(100)
  const communityStats = await evaluate(`document.querySelector('.graph-stats')?.textContent?.replace(/\\s+/g,' ').trim()||''`)
  await evaluate(`document.querySelector('[data-testid="graph-community-focus-return"]')?.click()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-focus"]')===null`, 'M3B-8 community return')
  remainingNavigationSelection = {
    viewports,
    community: { fullGraphStats, enteredCommunityCount, communityStats, returned: true, interactionKind: 'filtered-subgraph' },
    capabilities: { cameraPose: true, semanticCommunityOverview: true, minimap: false, clusterCollapseExpand: false, fullscreen: false },
  }
}

if (stage === 'M3B9') {
  const viewports = []
  const overlaps = (left, right) => Boolean(left && right && left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top)
  for (const [width, height] of [[1280, 800], [1000, 700], [720, 680]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await delay(260)
    const viewport = await evaluate(`(()=>{const minimap=document.querySelector('[data-testid="graph-minimap"]');const canvas=document.querySelector('[data-testid="graph-canvas"]');const details=document.querySelector('[data-testid="graph-selected-node"]');const legend=document.querySelector('[data-testid="graph-semantic-legend"]');const stats=document.querySelector('.graph-stats');const rect=element=>{const value=element?.getBoundingClientRect();return value?{left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height}:null};return {width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth+1,minimapRect:rect(minimap),canvasRect:rect(canvas),detailsRect:rect(details),legendRect:rect(legend),statsRect:rect(stats),sourceNodeCount:Number(minimap?.dataset.sourceNodeCount||0),renderedPointCount:Number(minimap?.dataset.renderedPointCount||0),viewportInBounds:minimap?.dataset.viewportInBounds==='true',cameraInitialized:minimap?.dataset.cameraInitialized==='true',diagnostics:JSON.parse(minimap?.dataset.diagnostics||'{}')}})()`)
    viewport.overlaps = { details: overlaps(viewport.minimapRect, viewport.detailsRect), legend: overlaps(viewport.minimapRect, viewport.legendRect), stats: overlaps(viewport.minimapRect, viewport.statsRect) }
    viewports.push(viewport)
    await capture(`minimap-${width}-${theme}-${motion}.jpg`)
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(180)
  const clickSetup = await evaluate(`(()=>{const minimap=document.querySelector('[data-testid="graph-minimap-canvas"]');const main=document.querySelector('[data-testid="graph-canvas"]');const host=document.querySelector('[data-testid="graph-minimap"]');const rect=minimap?.getBoundingClientRect();const localX=(minimap?.clientWidth||0)*.82;const localY=(minimap?.clientHeight||0)*.28;return {x:(rect?.left||0)+(minimap?.clientLeft||0)+localX,y:(rect?.top||0)+(minimap?.clientTop||0)+localY,localX,localY,mainWidth:main?.clientWidth||0,mainHeight:main?.clientHeight||0,beforePose:JSON.parse(main?.dataset.cameraPose||'{}'),diagnostics:JSON.parse(host?.dataset.diagnostics||'{}')}})()`)
  const clickStartedAt = Date.now()
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickSetup.x, y: clickSetup.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickSetup.x, y: clickSetup.y, button: 'left', clickCount: 1 })
  await waitFor(`(()=>{const state=document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionState;return state==='completed'||state==='reduced'})()`, 'M3B-9 minimap click completion')
  const click = await evaluate(`(()=>{const main=document.querySelector('[data-testid="graph-canvas"]');const host=document.querySelector('[data-testid="graph-minimap"]');return {elapsedMs:${Date.now()}-${clickStartedAt},pose:JSON.parse(main?.dataset.cameraPose||'{}'),motionState:main?.dataset.cameraMotionState||'',motionReason:main?.dataset.cameraMotionReason||'',motionFrames:Number(main?.dataset.cameraMotionFrames||0),navigationState:host?.dataset.navigationState||'',navigationCount:Number(host?.dataset.navigationCount||0),viewportInBounds:host?.dataset.viewportInBounds==='true'}})()`)
  await capture(`minimap-click-${theme}-${motion}.jpg`)

  const dragSetup = await evaluate(`(()=>{const element=document.querySelector('[data-testid="graph-minimap-canvas"]');const rect=element?.getBoundingClientRect();return {startX:(rect?.left||0)+(rect?.width||0)*.52,startY:(rect?.top||0)+(rect?.height||0)*.48,endX:(rect?.left||0)+(rect?.width||0)*.25,endY:(rect?.top||0)+(rect?.height||0)*.76,beforePose:JSON.parse(document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraPose||'{}')}})()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragSetup.startX, y: dragSetup.startY, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragSetup.endX, y: dragSetup.endY, button: 'left' })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragSetup.endX, y: dragSetup.endY, button: 'left', clickCount: 1 })
  await delay(100)
  const drag = await evaluate(`(()=>{const main=document.querySelector('[data-testid="graph-canvas"]');const host=document.querySelector('[data-testid="graph-minimap"]');return {pose:JSON.parse(main?.dataset.cameraPose||'{}'),motionState:main?.dataset.cameraMotionState||'',motionReason:main?.dataset.cameraMotionReason||'',navigationState:host?.dataset.navigationState||'',navigationCount:Number(host?.dataset.navigationCount||0),viewportInBounds:host?.dataset.viewportInBounds==='true'}})()`)
  await capture(`minimap-drag-${theme}-${motion}.jpg`)

  const keyboardBeforePose = await evaluate(`(()=>{const minimap=document.querySelector('[data-testid="graph-minimap-canvas"]');minimap?.focus();return JSON.parse(document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraPose||'{}')})()`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await waitFor(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');return canvas?.dataset.cameraMotionReason==='minimap-keyboard'&&['completed','reduced'].includes(canvas.dataset.cameraMotionState||'')})()`, 'M3B-9 keyboard navigation completion')
  const keyboard = await evaluate(`(()=>{const main=document.querySelector('[data-testid="graph-canvas"]');const host=document.querySelector('[data-testid="graph-minimap"]');return {beforePose:${JSON.stringify(keyboardBeforePose)},pose:JSON.parse(main?.dataset.cameraPose||'{}'),motionState:main?.dataset.cameraMotionState||'',motionReason:main?.dataset.cameraMotionReason||'',motionFrames:Number(main?.dataset.cameraMotionFrames||0),navigationCount:Number(host?.dataset.navigationCount||0),viewportInBounds:host?.dataset.viewportInBounds==='true'}})()`)
  await capture(`minimap-keyboard-${theme}-${motion}.jpg`)

  await evaluate(`(()=>{document.querySelector('.details-close')?.click();const zoomOut=document.querySelector('.lucide-zoom-out')?.closest('button');for(let index=0;index<10;index+=1)zoomOut?.click()})()`)
  await waitFor(`document.querySelector('[data-testid="graph-community-overview"]')!==null`, 'M3B-9 far community overview')
  await delay(360)
  const far = await evaluate(`(()=>{const minimap=document.querySelector('[data-testid="graph-minimap"]')?.getBoundingClientRect();const nav=document.querySelector('[data-testid="graph-community-overview"]')?.getBoundingClientRect();const shape=rect=>rect?{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height}:null;return {minimapRect:shape(minimap),communityNavRect:shape(nav),semanticZoomLevel:document.querySelector('[data-testid="graph-container"]')?.dataset.semanticZoomLevel||''}})()`)
  far.overlap = overlaps(far.minimapRect, far.communityNavRect)
  await capture(`minimap-far-${theme}-${motion}.jpg`)
  minimapNavigation = { viewports, clickSetup, click, dragSetup, drag, keyboard, far }
}

if (stage === 'M3B10') {
  const viewports = []
  await evaluate(`document.querySelector('.details-close')?.click()`)
  for (const [width, height] of [[1280, 800], [1000, 700], [720, 680]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await delay(260)
    const viewport = await evaluate(`(()=>{const canvas=document.querySelector('[data-testid="graph-canvas"]');const minimap=document.querySelector('[data-testid="graph-minimap"]');return {width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth+1,canvasVisible:Boolean(canvas),minimapVisible:Boolean(minimap),nodeStatusRingVisible:Boolean(document.querySelector('[data-testid="graph-node-status-ring"],[data-node-status-ring]')),clusterCollapseExpandVisible:Boolean(document.querySelector('[data-testid="graph-cluster-collapse"],[data-testid="graph-cluster-expand"]')),fullscreenVisible:Boolean(document.querySelector('[data-testid="graph-fullscreen"]')),fullscreenApiAvailable:typeof document.documentElement.requestFullscreen==='function',semanticZoomLevel:document.querySelector('[data-testid="graph-container"]')?.dataset.semanticZoomLevel||''}})()`)
    viewports.push(viewport)
    await capture(`remaining-visual-${width}.jpg`)
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await delay(180)
  await evaluate(`document.querySelector('.health-entry')?.click()`)
  await waitFor(`document.querySelector('[data-testid="knowledge-network-pulse"]')!==null`, 'M3B-10 real health and pulse scan')
  const health = await evaluate(`(()=>{const pulse=document.querySelector('[data-testid="knowledge-network-pulse"]');const summaries=[...document.querySelectorAll('.health-summary button')].map(item=>item.textContent?.replace(/\s+/g,' ').trim()||'');const topics=[...document.querySelectorAll('[data-testid="knowledge-network-topic"]')].map(item=>({text:item.querySelector('span')?.textContent?.replace(/\s+/g,' ').trim()||'',relationCount:Number(item.querySelector('b')?.textContent||0)}));return {objectCount:Number(pulse?.dataset.objectCount||0),relationCount:Number(pulse?.dataset.relationCount||0),connectedCount:Number(pulse?.dataset.connectedCount||0),isolatedCount:Number(pulse?.dataset.isolatedCount||0),coveragePercent:Number(document.querySelector('[data-testid="knowledge-network-coverage"]')?.getAttribute('aria-valuenow')||0),summaries,topics,isolationQueueCount:document.querySelectorAll('[data-testid="knowledge-isolation-item"]').length,panelFits:document.documentElement.scrollWidth<=innerWidth+1}})()`)
  await capture('remaining-visual-health-1280.jpg')
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
  await delay(220)
  health.narrowFits = await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`)
  await capture('remaining-visual-health-720.jpg')
  await evaluate(`document.querySelector('[aria-label="关闭知识图谱治理"]')?.click()`)

  const timestampFiles = ['NorthStar.md', 'research/Brief.md', 'research/Evidence.pdf', 'research/Roadmap.table.json', 'research/System.canvas', 'research/Outline.opml', 'research/Review.pptx']
  const timestamps = await Promise.all(timestampFiles.map(async file => ({ file, modifiedAt: Math.floor((await fs.stat(path.join(library, file))).mtimeMs / 1000) })))
  const uniqueModifiedAtCount = new Set(timestamps.map(item => item.modifiedAt)).size
  remainingVisualSelection = {
    viewports,
    health,
    sourceSignals: { timestamps, uniqueModifiedAtCount, relationStrengthObserved: health.topics.some(item => item.relationCount > 0) },
    capabilities: { minimap: true, communityFilteredSubgraph: true, nodeStatusRings: false, clusterCollapseExpand: false, fullscreen: false },
  }
}

const clicked = await evaluate(`(()=>{const element=document.querySelector('.management-back');if(!(element instanceof HTMLElement))return false;element.click();return true})()`)
if (!clicked) throw new Error('M3A-1 return control missing')
await waitFor(`document.querySelector('.library-mode')!==null`, 'return to library')
const afterSha256 = await hashDirectory(library)
const evidence = {
  schemaVersion: 1,
  stage: stage === 'M3B10' ? 'M3B-10' : stage === 'M3B9' ? 'M3B-9' : stage === 'M3B8' ? 'M3B-8' : stage === 'M3B7' ? 'M3B-7' : stage === 'M3B6' ? 'M3B-6' : stage === 'M3B5' ? 'M3B-5' : stage === 'M3B4' ? 'M3B-4' : stage === 'M3B2' ? 'M3B-2' : stage === 'M3B1' ? 'M3B-1' : stage === 'M3B0' ? 'M3B-0' : stage === 'M3A8' ? 'M3A-8' : stage === 'M3A7' ? 'M3A-7' : stage === 'M3A6' ? 'M3A-6' : stage === 'M3A5' ? 'M3A-5' : stage === 'M3A4' ? 'M3A-4' : stage === 'M3A3' ? 'M3A-3' : stage === 'M3A2' ? 'M3A-2' : 'M3A-1',
  actual: { theme, motion, wide, narrow, neighborFocus, shortestPath, relationEvidence, community, nodeComparison, selectionHistory, neighborPinning, combinedFlow, visualBaseline, semanticZoom, semanticHierarchy, pathVisual, pathMotion, navigationBaseline, cameraNavigation, remainingNavigationSelection, minimapNavigation, remainingVisualSelection, returnedToLibrary: true, runtimeErrors: runtimeErrors.length, runtimeErrorMessages: runtimeErrors, sourceFilesUnchanged: beforeSha256 === afterSha256, beforeSha256, afterSha256 },
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, ['M3B5', 'M3B7', 'M3B9'].includes(stage) ? `desktop-${theme}-${motion}.json` : ['M3B1', 'M3B2', 'M3B4'].includes(stage) ? `desktop-${theme}.json` : 'desktop.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log(`${stage} desktop: ${wide.objectTypeIds.length} object types, ${wide.relationTypeIds.length} relation types, runtime errors ${runtimeErrors.length}`)
