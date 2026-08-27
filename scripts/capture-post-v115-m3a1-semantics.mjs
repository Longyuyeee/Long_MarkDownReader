import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M3A1_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M3A1_LIBRARY)
const stage = process.env.LONGEDIT_M3_STAGE || 'M3A1'
const theme = process.env.LONGEDIT_M3_THEME || 'dark'
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
const initialGraphHash = ['M3A7', 'M3A8', 'M3B0', 'M3B1'].includes(stage) ? `#/graph?mode=network&root=${encodeURIComponent(path.join(library, 'NorthStar.md'))}` : '#/graph'
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
if (stage === 'M3B1') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  const readLevel = () => evaluate(`document.querySelector('[data-testid="graph-semantic-zoom-status"]')?.dataset.level||''`)
  const wheel = async deltaY => {
    const rect = await evaluate(`(()=>{const rect=document.querySelector('[data-testid="graph-container"] canvas')?.getBoundingClientRect();return rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`)
    if (!rect) throw new Error('M3B-1 graph canvas missing')
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY })
    await delay(80)
  }
  const reachLevel = async targetLevel => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const current = await readLevel()
      if (current === targetLevel) return
      await wheel(targetLevel === 'near' ? -120 : 120)
    }
    throw new Error(`M3B-1 could not reach ${targetLevel}`)
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
  const near = { level: await readLevel(), zoomPercent: await evaluate(`Number(document.querySelector('.graph-stats')?.textContent?.match(/(\\d+)%/)?.[1]||0)`) }
  await capture(`${theme}-near-1280.jpg`)
  await reachLevel('middle')
  const middle = { level: await readLevel(), zoomPercent: await evaluate(`Number(document.querySelector('.graph-stats')?.textContent?.match(/(\\d+)%/)?.[1]||0)`) }
  await capture(`${theme}-middle-1280.jpg`)
  await reachLevel('far')
  await waitFor(`document.querySelectorAll('[data-testid="graph-community-overview-entry"]').length===5`, 'M3B-1 five community overview entries')
  const far = { level: await readLevel(), zoomPercent: await evaluate(`Number(document.querySelector('.graph-stats')?.textContent?.match(/(\\d+)%/)?.[1]||0)`) }
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
}

const clicked = await evaluate(`(()=>{const element=document.querySelector('.management-back');if(!(element instanceof HTMLElement))return false;element.click();return true})()`)
if (!clicked) throw new Error('M3A-1 return control missing')
await waitFor(`document.querySelector('.library-mode')!==null`, 'return to library')
const afterSha256 = await hashDirectory(library)
const evidence = {
  schemaVersion: 1,
  stage: stage === 'M3B1' ? 'M3B-1' : stage === 'M3B0' ? 'M3B-0' : stage === 'M3A8' ? 'M3A-8' : stage === 'M3A7' ? 'M3A-7' : stage === 'M3A6' ? 'M3A-6' : stage === 'M3A5' ? 'M3A-5' : stage === 'M3A4' ? 'M3A-4' : stage === 'M3A3' ? 'M3A-3' : stage === 'M3A2' ? 'M3A-2' : 'M3A-1',
  actual: { theme, wide, narrow, neighborFocus, shortestPath, relationEvidence, community, nodeComparison, selectionHistory, neighborPinning, combinedFlow, visualBaseline, semanticZoom, returnedToLibrary: true, runtimeErrors: runtimeErrors.length, sourceFilesUnchanged: beforeSha256 === afterSha256, beforeSha256, afterSha256 },
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, stage === 'M3B1' ? `desktop-${theme}.json` : 'desktop.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log(`${stage} desktop: ${wide.objectTypeIds.length} object types, ${wide.relationTypeIds.length} relation types, runtime errors ${runtimeErrors.length}`)
