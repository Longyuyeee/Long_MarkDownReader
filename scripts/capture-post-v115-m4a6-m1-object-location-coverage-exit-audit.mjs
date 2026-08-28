import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14539'
const output = path.resolve(process.env.LONGEDIT_M4A6_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4A6_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4A6_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4A-6 audit environment is incomplete')

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
const setSearch = async value => {
  const changed = await evaluate(`(() => { const input = document.querySelector('.search-area input'); if (!(input instanceof HTMLInputElement)) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  if (!changed) throw new Error('Unable to set Library search input')
}
const openContext = async (expectedTitle, expectedScope) => {
  if (!await evaluate(`Boolean(document.querySelector('.relation-context-panel'))`)) await click('.relation-context-trigger')
  try {
    await waitFor(`document.querySelector('.relation-context-panel header small')?.textContent?.trim() === ${JSON.stringify(expectedScope)} && !document.querySelector('.relation-context-panel .context-state[role="status"]')`, `${expectedScope} for ${expectedTitle}`, 120)
  } catch (error) {
    const diagnostic = await evaluate(`({ hash: location.hash, title: document.querySelector('.relation-context-panel header strong')?.textContent?.trim() || '', scope: document.querySelector('.relation-context-panel header small')?.textContent?.trim() || '', state: document.querySelector('.relation-context-panel .context-state')?.textContent?.replace(/\s+/g, ' ').trim() || '', focus: window.__LONGEDIT_STORE__?.relationObjectFocus || null })`)
    const routePath = await evaluate(`new URLSearchParams(location.hash.split('?')[1] || '').get('path') || ''`)
    const backend = routePath ? await invoke('get_graph_relation_context', { libraryRoot: library, path: routePath, focusLocatorKind: null, focusLocatorObjectId: null, focusLocatorPage: null }) : null
    throw new Error(`${error.message}; diagnostic=${JSON.stringify({ ...diagnostic, backendNode: backend?.node || null })}`)
  }
  return evaluate(`({ title: document.querySelector('.relation-context-panel header strong')?.textContent?.trim() || '', scope: document.querySelector('.relation-context-panel header small')?.textContent?.trim() || '', center: document.querySelector('.context-actions button')?.textContent?.replace(/\s+/g, ' ').trim() || '' })`)
}
const returnToLibrary = async query => {
  await evaluate('history.back()')
  await waitFor(`document.querySelector('.search-area input')?.value === ${JSON.stringify(query)} && document.querySelector('.knowledge-search-result')`, `preserved search state for ${query}`)
}
const searchAndOpen = async ({ query, objectType, locatorKind, ready, verify }) => {
  await setSearch(''); await setSearch(query)
  await waitFor(`document.querySelector('.knowledge-search-result')?.textContent?.toLowerCase().includes(${JSON.stringify(query.toLowerCase())}) === true`, `search result for ${query}`)
  const backend = await invoke('search_knowledge', { libraryRoot: library, query })
  const result = backend.find(item => item.objectType === objectType && item.locatorKind === locatorKind)
  if (!result?.locatorObjectId) throw new Error(`Missing ${locatorKind} result for ${query}: ${JSON.stringify(backend)}`)
  const opened = await evaluate(`(() => { const cards = [...document.querySelectorAll('.knowledge-search-result')].filter(item => item.textContent?.toLowerCase().includes(${JSON.stringify(query.toLowerCase())})); const expected = ${JSON.stringify(locatorKind)}; const card = expected === 'pptx-object' ? cards.find(item => item.querySelector('.knowledge-result-head i')?.textContent?.includes('对象')) : cards[0]; const button = card?.querySelector('.knowledge-result-open'); if (!(button instanceof HTMLElement)) return false; button.click(); return true })()`)
  if (!opened) throw new Error(`Unable to open ${locatorKind} result`)
  await waitFor(ready(result), `${locatorKind} route`)
  const route = await evaluate('location.hash')
  const details = await evaluate(verify(result))
  if (!details?.located) throw new Error(`${locatorKind} target was not visibly located: ${JSON.stringify(details)}`)
  await returnToLibrary(query)
  return { query, objectType, locatorKind, locatorObjectId: result.locatorObjectId, locationLabel: result.locationLabel || '', route: auditRoute(route), details, returnedSearchState: true }
}
const navigateGraph = async node => {
  await evaluate("location.hash='#/library'")
  await waitFor(`Boolean(document.querySelector('.library-mode'))`, 'Library route before graph navigation')
  await evaluate(`location.hash='#/graph?root='+encodeURIComponent(${JSON.stringify(node.id)})`)
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.getAttribute('data-node-id') === ${JSON.stringify(node.id)}`, `selected graph node ${node.title}`)
}
const returnToGraph = async node => {
  await evaluate('history.back()')
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.getAttribute('data-node-id') === ${JSON.stringify(node.id)}`, `return to graph node ${node.title}`)
}
const openGraphChild = async spec => {
  await navigateGraph(spec.child)
  await click('.node-details .primary-action')
  await waitFor(spec.ready, `Graph object ${spec.child.title}`)
  const route = await evaluate('location.hash')
  const context = await openContext(spec.child.title, '内部对象上下文')
  const details = await evaluate(spec.verify)
  if (!details.located || context.scope !== '内部对象上下文') throw new Error(`Graph object focus failed: ${JSON.stringify({ child: spec.child, context, details })}`)
  await returnToGraph(spec.child)
  return { objectType: spec.child.objectType, title: spec.child.title, locator: spec.child.locator, route: auditRoute(route), context, details, returnedToGraph: true }
}
const openFromParentContext = async (spec, screenshot) => {
  await navigateGraph(spec.parent)
  await click('.node-details .primary-action')
  await waitFor(spec.parentReady, `parent object ${spec.parent.title}`)
  const parentContext = await openContext(spec.parent.title, '文件上下文')
  const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll('.relation-route')].find(node => node.textContent?.includes(${JSON.stringify(spec.child.title)})); if (!(button instanceof HTMLElement)) return false; button.click(); return true })()`)
  if (!clicked) throw new Error(`Unable to open ${spec.child.title} from relation context`)
  await waitFor(spec.ready, `relation-context object ${spec.child.title}`)
  const route = await evaluate('location.hash')
  const childContext = await openContext(spec.child.title, '内部对象上下文')
  const details = await evaluate(spec.verify)
  if (!details.located || parentContext.scope !== '文件上下文' || childContext.scope !== '内部对象上下文') throw new Error(`Relation-context object focus failed: ${JSON.stringify({ parent: spec.parent, child: spec.child, parentContext, childContext, details })}`)
  if (screenshot) { await delay(300); await capture(screenshot) }
  await evaluate('history.back()')
  await waitFor(spec.parentReady, `return to parent ${spec.parent.title}`)
  await returnToGraph(spec.parent)
  return { parent: spec.parent.title, child: spec.child.title, objectType: spec.child.objectType, route: auditRoute(route), parentContext, childContext, details, returnedToGraph: true }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')
const files = {
  table: path.join(library, 'M4A6 Workflow.table.json'), opml: path.join(library, 'M4A6 Workflow.opml'),
  docx: path.join(library, 'M4A6 Word.docx'), ods: path.join(library, 'M4A6 Sheet.ods'),
  odp: path.join(library, 'M4A6 Slides.odp'), pptx: path.join(library, 'M4A6 PowerPoint.pptx'),
  workbook: path.join(library, 'M4A6 Workbook.xlsx'),
}
const sourceHashesBefore = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
await waitFor(`document.querySelector('.knowledge-index-strip.state-ready')`, 'automatic knowledge-index preparation')
const rebuilt = await invoke('get_knowledge_index_status', { libraryRoot: library })
if (rebuilt.state !== 'ready' || rebuilt.schemaVersion !== 2) throw new Error(`Expected ready schema v2 index: ${JSON.stringify(rebuilt)}`)

const searches = []
searches.push(await searchAndOpen({ query: 'm4a6-table-row-needle', objectType: 'table', locatorKind: 'table-row', ready: result => `document.querySelector('[data-testid="table-data-row"][data-row-id=${JSON.stringify(result.locatorObjectId)}].selected')`, verify: result => `(() => { const node = document.querySelector('[data-testid="table-data-row"][data-row-id=${JSON.stringify(result.locatorObjectId)}]'); return { located: Boolean(node?.classList.contains('selected')), rowId: node?.getAttribute('data-row-id') || '' } })()` }))
searches.push(await searchAndOpen({ query: 'm4a6-opml-node-needle', objectType: 'opml', locatorKind: 'opml-node', ready: result => `document.querySelector('[data-testid="opml-map-node"][data-node-id=${JSON.stringify(result.locatorObjectId)}].selected')`, verify: result => `(() => { const node = document.querySelector('[data-testid="opml-map-node"][data-node-id=${JSON.stringify(result.locatorObjectId)}]'); return { located: Boolean(node?.classList.contains('selected')), nodeId: node?.getAttribute('data-node-id') || '' } })()` }))
searches.push(await searchAndOpen({ query: 'before explicit page break', objectType: 'docx', locatorKind: 'docx-block', ready: result => `Boolean(document.getElementById(${JSON.stringify(result.locatorObjectId)}))`, verify: result => `(() => { const node = document.getElementById(${JSON.stringify(result.locatorObjectId)}); return { located: Boolean(node), blockId: node?.id || '' } })()` }))
searches.push(await searchAndOpen({ query: 'read-only structured preview', objectType: 'ods', locatorKind: 'ods-cell', ready: result => `document.getElementById(${JSON.stringify(result.locatorObjectId)})?.classList.contains('route-target')`, verify: result => `(() => { const node = document.getElementById(${JSON.stringify(result.locatorObjectId)}); return { located: Boolean(node?.classList.contains('route-target')), cellId: node?.id || '' } })()` }))
searches.push(await searchAndOpen({ query: 'search and precise location', objectType: 'odp', locatorKind: 'odp-slide', ready: result => `document.getElementById(${JSON.stringify(result.locatorObjectId)})?.classList.contains('route-target')`, verify: result => `(() => { const node = document.getElementById(${JSON.stringify(result.locatorObjectId)}); return { located: Boolean(node?.classList.contains('route-target')), slideId: node?.id || '' } })()` }))
searches.push(await searchAndOpen({ query: 'structured slide reading', objectType: 'pptx', locatorKind: 'pptx-object', ready: () => `Boolean(document.querySelector('.slide-object.route-target-object'))`, verify: () => `(() => { const node = document.querySelector('.slide-object.route-target-object'); return { located: Boolean(node), objectId: node?.getAttribute('data-object-id') || '' } })()` }))
searches.push(await searchAndOpen({ query: 'Keyboard', objectType: 'workbook', locatorKind: 'workbook-sheet', ready: result => `document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() === ${JSON.stringify(result.locatorObjectId)}`, verify: result => `(() => { const title = document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() || ''; return { located: title === ${JSON.stringify(result.locatorObjectId)}, activeSheet: title } })()` }))
await setSearch('Keyboard'); await waitFor(`document.querySelector('.knowledge-search-result')?.textContent?.includes('Keyboard')`, 'final search coverage screen'); await capture('search-location-coverage-1280.jpg')

const graph = await invoke('build_link_graph', { libraryRoot: library })
const rebuiltGraph = await invoke('build_link_graph', { libraryRoot: library })
const parentTypes = ['table', 'opml', 'docx', 'ods', 'odp', 'pptx', 'workbook']
const childTypes = ['table_view', 'opml_node', 'docx_heading', 'ods_sheet', 'odp_slide', 'pptx_slide', 'workbook_sheet']
const parents = graph.nodes.filter(node => parentTypes.includes(node.objectType))
const children = graph.nodes.filter(node => childTypes.includes(node.objectType))
const contains = graph.edges.filter(edge => edge.relationType === 'contains' && children.some(child => child.id === edge.target))
const deferred = graph.nodes.filter(node => ['docx_block', 'ods_cell'].includes(node.objectType))
const identities = children.map(node => `${node.id}|${node.parentId || ''}`).sort()
const rebuiltIdentities = rebuiltGraph.nodes.filter(node => childTypes.includes(node.objectType)).map(node => `${node.id}|${node.parentId || ''}`).sort()
if (parents.length !== 7 || children.length !== 15 || contains.length !== 15 || contains.some(edge => edge.mentions.length) || deferred.length || JSON.stringify(identities) !== JSON.stringify(rebuiltIdentities)) throw new Error(`M4A-6 graph matrix failed: ${JSON.stringify({ parents: parents.length, children: children.length, contains: contains.length, deferred: deferred.length })}`)
const byType = type => parents.find(node => node.objectType === type)
const childBy = (type, predicate = () => true) => children.find(node => node.objectType === type && predicate(node))
const selected = {
  table: childBy('table_view', node => node.locator?.objectId === 'review-grid'),
  opml: childBy('opml_node', node => node.locator?.objectId === 'workflow-node'),
  docx: childBy('docx_heading'), ods: childBy('ods_sheet', node => node.title === 'Overview'),
  odp: childBy('odp_slide'), pptx: childBy('pptx_slide'),
  workbook: childBy('workbook_sheet', node => node.title === 'Inventory'),
}
if (Object.values(selected).some(node => !node)) throw new Error(`M4A-6 selected graph objects missing: ${JSON.stringify(selected)}`)
await evaluate("location.hash='#/graph'")
await waitFor(`document.querySelector('.graph-stats')?.textContent?.includes('22 / 22')`, '22-node bounded M1 graph')
await evaluate(`document.querySelector('.details-close')?.click()`)
await waitFor(`!document.querySelector('[data-testid="graph-selected-node"]')`, 'closed graph details')
await delay(500); await capture('bounded-graph-location-coverage-1280.jpg')

const specs = [
  { key: 'table', parent: byType('table'), child: selected.table, parentReady: `Boolean(document.querySelector('.table-view'))`, ready: `document.querySelector('.view-tab.active .view-tab-main')?.textContent?.trim() === ${JSON.stringify(selected.table.title)}`, verify: `(() => { const title = document.querySelector('.view-tab.active .view-tab-main')?.textContent?.trim() || ''; return { located: title === ${JSON.stringify(selected.table.title)}, activeView: title } })()` },
  { key: 'opml', parent: byType('opml'), child: selected.opml, parentReady: `Boolean(document.querySelector('.mindmap-page'))`, ready: `document.querySelector('[data-testid="opml-map-node"][data-node-id=${JSON.stringify(selected.opml.locator.objectId)}].selected')`, verify: `(() => { const node = document.querySelector('[data-testid="opml-map-node"][data-node-id=${JSON.stringify(selected.opml.locator.objectId)}]'); return { located: Boolean(node?.classList.contains('selected')), nodeId: node?.getAttribute('data-node-id') || '' } })()` },
  { key: 'pptx', parent: byType('pptx'), child: selected.pptx, parentReady: `Boolean(document.querySelector('.pptx-workspace'))`, ready: `Boolean(document.querySelector('.slide-strip > button.route-target.active'))`, verify: `(() => { const node = document.querySelector('.slide-strip > button.route-target.active'); return { located: Boolean(node), slideIndex: node?.getAttribute('data-slide-index') || '' } })()` },
  { key: 'odp', parent: byType('odp'), child: selected.odp, parentReady: `Boolean(document.querySelector('.odf-workspace .slide'))`, ready: `document.getElementById(${JSON.stringify(selected.odp.locator.objectId)})?.classList.contains('route-target')`, verify: `(() => { const node = document.getElementById(${JSON.stringify(selected.odp.locator.objectId)}); return { located: Boolean(node?.classList.contains('route-target')), slideId: node?.id || '' } })()` },
  { key: 'workbook', parent: byType('workbook'), child: selected.workbook, parentReady: `Boolean(document.querySelector('.workbook-view .sheet-tabs button.active'))`, ready: `document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() === ${JSON.stringify(selected.workbook.title)}`, verify: `(() => { const title = document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim() || ''; return { located: title === ${JSON.stringify(selected.workbook.title)}, activeSheet: title } })()` },
  { key: 'ods', parent: byType('ods'), child: selected.ods, parentReady: `Boolean(document.querySelector('.odf-workspace .sheet-tabs button.active'))`, ready: `document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim() === ${JSON.stringify(selected.ods.title)}`, verify: `(() => { const title = document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim() || ''; return { located: title === ${JSON.stringify(selected.ods.title)}, activeSheet: title } })()` },
  { key: 'docx', parent: byType('docx'), child: selected.docx, parentReady: `Boolean(document.querySelector('.docx-workspace .docx-page'))`, ready: `Boolean(document.getElementById(${JSON.stringify(selected.docx.locator.objectId)})?.classList.contains('docx-heading'))`, verify: `(() => { const node = document.getElementById(${JSON.stringify(selected.docx.locator.objectId)}); return { located: Boolean(node?.classList.contains('docx-heading')), blockId: node?.id || '' } })()` },
]
if (specs.some(spec => !spec.parent || !spec.child)) throw new Error('M4A-6 parent/child specification is incomplete')
const graphOpens = []
for (const spec of specs) graphOpens.push(await openGraphChild(spec))
const contextOpens = []
for (const spec of specs) {
  const screenshot = spec.key === 'opml' ? 'structured-relation-context-1280.jpg' : spec.key === 'workbook' ? 'office-relation-context-1280.jpg' : undefined
  contextOpens.push(await openFromParentContext(spec, screenshot))
}

const sourceHashesAfter = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const sourceFilesUnchanged = JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const actual = {
  index: { state: rebuilt.state, schemaVersion: rebuilt.schemaVersion, objectCount: rebuilt.objectCount, relationCount: rebuilt.relationCount },
  search: { locatorFamilyCount: searches.length, preciseOpenCount: searches.filter(item => item.details.located).length, returnedSearchStateCount: searches.filter(item => item.returnedSearchState).length, results: searches },
  graph: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, objectFamilyCount: new Set(children.map(node => node.objectType)).size, parentCount: parents.length, childCount: children.length, containsRelationCount: contains.length, structuralMentionCount: contains.reduce((count, edge) => count + edge.mentions.length, 0), deferredFineGrainedNodeCount: deferred.length, sameSourceIdentityStable: JSON.stringify(identities) === JSON.stringify(rebuiltIdentities), childCounts: Object.fromEntries(childTypes.map(type => [type, children.filter(node => node.objectType === type).length])) },
  graphOpens, contextOpens,
  graphInternalOpenCount: graphOpens.length,
  relationContextInternalOpenCount: contextOpens.length,
  returnedGraphCount: [...graphOpens, ...contextOpens].filter(item => item.returnedToGraph).length,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceFilesUnchanged,
}
if (actual.search.preciseOpenCount !== 7 || actual.search.returnedSearchStateCount !== 7 || actual.graphInternalOpenCount !== 7 || actual.relationContextInternalOpenCount !== 7 || actual.returnedGraphCount !== 14 || runtimeErrors.length || blockingErrorSurfaceObserved || !sourceFilesUnchanged) throw new Error(`M4A-6 runtime gate failed: ${JSON.stringify(actual)}`)
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-6', status: 'passed', sourceCommit, actual, sourceHashesBefore, sourceHashesAfter, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
const screenshots = []
for (const file of ['search-location-coverage-1280.jpg', 'bounded-graph-location-coverage-1280.jpg', 'structured-relation-context-1280.jpg', 'office-relation-context-1280.jpg']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-6', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4A-6 exit audit passed: ${searches.length} search locators, ${new Set(children.map(node => node.objectType)).size} graph object families, ${runtimeErrors.length} runtime errors.`)
