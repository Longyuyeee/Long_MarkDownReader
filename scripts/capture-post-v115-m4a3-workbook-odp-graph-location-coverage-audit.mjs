import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14534'
const output = path.resolve(process.env.LONGEDIT_M4A3_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4A3_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4A3_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4A-3 audit environment is incomplete')

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
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result.value }
const invoke = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`)
const waitFor = async (expression, description, attempts = 700) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const auditRoute = route => route.replace(/([?&]path=)[^&]*/i, '$1[fixture]')
const click = async selector => { const clicked = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!(node instanceof HTMLElement)) return false; node.click(); return true })()`); if (!clicked) throw new Error(`Unable to click ${selector}`) }
const openContext = async expectedTitle => {
  if (!await evaluate(`Boolean(document.querySelector('.relation-context-panel'))`)) await click('.relation-context-trigger')
  await waitFor(`document.querySelector('.relation-context-panel header strong')?.textContent?.trim() === ${JSON.stringify(expectedTitle)} && !document.querySelector('.relation-context-panel .context-state[role="status"]')`, `relation context for ${expectedTitle}`)
  return evaluate(`({ scope: document.querySelector('.relation-context-panel header small')?.textContent?.trim() || '', center: document.querySelector('.context-actions button')?.textContent?.replace(/\s+/g, ' ').trim() || '' })`)
}
const navigateGraph = async node => {
  await evaluate(`location.hash='#/library'`)
  await waitFor(`Boolean(document.querySelector('.library-mode'))`, 'Library route before centered graph navigation')
  await evaluate(`location.hash='#/graph?root='+encodeURIComponent(${JSON.stringify(node.id)})`)
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.getAttribute('data-node-id') === ${JSON.stringify(node.id)}`, `selected graph node ${node.title}`)
}
const returnToGraph = async node => {
  await evaluate(`history.back()`)
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.getAttribute('data-node-id') === ${JSON.stringify(node.id)}`, `return to graph node ${node.title}`)
}
const openGraphChild = async (node, ready, verify) => {
  await navigateGraph(node)
  await click('.node-details .primary-action')
  await waitFor(ready, `internal object ${node.title}`)
  const route = await evaluate(`location.hash`)
  const context = await openContext(node.title)
  const details = await evaluate(verify)
  if (!details.located || context.scope !== '内部对象上下文') throw new Error(`Graph internal object did not retain focus: ${JSON.stringify({ node, route, context, details })}`)
  await returnToGraph(node)
  return { title: node.title, objectType: node.objectType, locator: node.locator, route: auditRoute(route), context, details, returnedToGraph: true }
}
const openFromParentContext = async (parent, child, parentReady, childReady, verify) => {
  await navigateGraph(parent)
  await click('.node-details .primary-action')
  await waitFor(parentReady, `parent object ${parent.title}`)
  const parentContext = await openContext(parent.title)
  const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll('.relation-route')].find(node => node.textContent?.includes(${JSON.stringify(child.title)})); if (!(button instanceof HTMLElement)) return false; button.click(); return true })()`)
  if (!clicked) throw new Error(`Unable to open ${child.title} from relation context`)
  await waitFor(childReady, `relation context internal object ${child.title}`)
  const route = await evaluate(`location.hash`)
  const childContext = await openContext(child.title)
  const details = await evaluate(verify)
  if (!details.located || parentContext.scope !== '文件上下文' || childContext.scope !== '内部对象上下文') throw new Error(`Relation context internal object failed: ${JSON.stringify({ parent, child, route, parentContext, childContext, details })}`)
  await evaluate(`history.back()`)
  await waitFor(parentReady, `return to parent ${parent.title}`)
  await returnToGraph(parent)
  return { parent: parent.title, child: child.title, route: auditRoute(route), parentContext, childContext, details, returnedToGraph: true }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')
const files = { workbook: path.join(library, 'M4A3 Workbook.xlsx'), odp: path.join(library, 'M4A3 Slides.odp') }
const sourceHashesBefore = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const graph = await invoke('build_link_graph', { libraryRoot: library })
const parents = graph.nodes.filter(node => ['workbook', 'odp'].includes(node.objectType))
const children = graph.nodes.filter(node => ['workbook_sheet', 'odp_slide'].includes(node.objectType))
const contains = graph.edges.filter(edge => edge.relationType === 'contains' && children.some(child => child.id === edge.target))
if (parents.length !== 2 || children.length !== 6 || contains.length !== 6 || contains.some(edge => edge.mentions.length)) throw new Error(`M4A-3 graph counts failed: ${JSON.stringify({ parents: parents.length, children: children.length, contains: contains.length })}`)
const workbook = parents.find(node => node.objectType === 'workbook')
const inventory = children.find(node => node.objectType === 'workbook_sheet' && node.locator?.objectId === 'Inventory')
const detailsSheet = children.find(node => node.objectType === 'workbook_sheet' && node.locator?.objectId === 'Details')
const odp = parents.find(node => node.objectType === 'odp')
const odpSlides = children.filter(node => node.objectType === 'odp_slide').sort((left, right) => left.locator.page - right.locator.page)
if (!workbook || !inventory || !detailsSheet || !odp || odpSlides.length !== 2) throw new Error('M4A-3 expected fixture objects are missing')

await evaluate(`location.hash='#/graph'`)
await waitFor(`document.querySelector('.graph-stats')?.textContent?.includes('8 / 8')`, '8-node M4A-3 graph')
await evaluate(`document.querySelector('.details-close')?.click()`)
await waitFor(`!document.querySelector('[data-testid="graph-selected-node"]')`, 'closed graph details before overview capture')
await delay(500)
await capture('workbook-odp-graph-1280.jpg')

const graphWorkbook = await openGraphChild(inventory, `document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() === 'Inventory'`, `(() => ({ located: document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() === 'Inventory', activeSheet: document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() || '' }))()`)
const contextWorkbook = await openFromParentContext(workbook, detailsSheet, `Boolean(document.querySelector('.workbook-view .sheet-tabs button.active'))`, `document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() === 'Details'`, `(() => ({ located: document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() === 'Details', activeSheet: document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() || '' }))()`)
await evaluate(`history.forward()`); await waitFor(`Boolean(document.querySelector('.workbook-view .sheet-tabs button.active'))`, 'Workbook parent evidence route'); await evaluate(`history.forward()`); await waitFor(`document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() === 'Details'`, 'Workbook evidence screen'); await capture('workbook-relation-context-location-1280.jpg'); await evaluate(`location.hash='#/graph'`); await waitFor(`document.querySelector('[data-testid="graph-container"]')`, 'graph after Workbook evidence')

const graphOdp = await openGraphChild(odpSlides[0], `document.getElementById(${JSON.stringify(odpSlides[0].locator.objectId)})?.classList.contains('route-target')`, `(() => { const node = document.getElementById(${JSON.stringify(odpSlides[0].locator.objectId)}); return { located: Boolean(node?.classList.contains('route-target')), slideId: node?.id || '' } })()`)
const contextOdp = await openFromParentContext(odp, odpSlides[1], `Boolean(document.querySelector('.odf-workspace .slide'))`, `document.getElementById(${JSON.stringify(odpSlides[1].locator.objectId)})?.classList.contains('route-target')`, `(() => { const node = document.getElementById(${JSON.stringify(odpSlides[1].locator.objectId)}); return { located: Boolean(node?.classList.contains('route-target')), slideId: node?.id || '' } })()`)
await evaluate(`history.forward()`); await waitFor(`Boolean(document.querySelector('.odf-workspace .slide'))`, 'ODP parent evidence route'); await evaluate(`history.forward()`); await waitFor(`document.getElementById(${JSON.stringify(odpSlides[1].locator.objectId)})?.classList.contains('route-target')`, 'ODP evidence screen'); await capture('odp-relation-context-location-1280.jpg')

const sourceHashesAfter = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const sourceFilesUnchanged = JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const graphOpens = [graphWorkbook, graphOdp]
const contextOpens = [contextWorkbook, contextOdp]
const actual = {
  graph: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, parentCount: parents.length, childCount: children.length, containsRelationCount: contains.length, structuralMentionCount: contains.reduce((count, edge) => count + edge.mentions.length, 0), objectTypes: [...new Set(graph.nodes.map(node => node.objectType))].sort() },
  graphOpens,
  contextOpens,
  graphInternalOpenCount: graphOpens.length,
  relationContextInternalOpenCount: contextOpens.length,
  returnedGraphCount: [...graphOpens, ...contextOpens].filter(item => item.returnedToGraph).length,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceFilesUnchanged,
}
if (actual.graphInternalOpenCount !== 2 || actual.relationContextInternalOpenCount !== 2 || actual.returnedGraphCount !== 4 || runtimeErrors.length || blockingErrorSurfaceObserved || !sourceFilesUnchanged) throw new Error(`M4A-3 runtime gate failed: ${JSON.stringify(actual)}`)
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-3', status: 'passed', sourceCommit, actual, sourceHashesBefore, sourceHashesAfter, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
const screenshots = []
for (const file of ['workbook-odp-graph-1280.jpg', 'workbook-relation-context-location-1280.jpg', 'odp-relation-context-location-1280.jpg']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-3', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4A-3 desktop audit passed: ${parents.length} parents, ${children.length} children, ${contains.length} contains relations, ${runtimeErrors.length} runtime errors.`)
