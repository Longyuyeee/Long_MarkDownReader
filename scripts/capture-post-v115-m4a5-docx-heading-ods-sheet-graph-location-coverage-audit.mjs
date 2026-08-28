import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14538'
const output = path.resolve(process.env.LONGEDIT_M4A5_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4A5_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4A5_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4A-5 audit environment is incomplete')

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
const openFromParentContext = async (parent, child, parentReady, childReady, verify, screenshot) => {
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
  await delay(400)
  await capture(screenshot)
  await evaluate(`history.back()`)
  await waitFor(parentReady, `return to parent ${parent.title}`)
  await returnToGraph(parent)
  return { parent: parent.title, child: child.title, route: auditRoute(route), parentContext, childContext, details, returnedToGraph: true }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')
const files = { docx: path.join(library, 'M4A5 Word.docx'), ods: path.join(library, 'M4A5 Sheet.ods') }
const sourceHashesBefore = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const graph = await invoke('build_link_graph', { libraryRoot: library })
const rebuiltGraph = await invoke('build_link_graph', { libraryRoot: library })
const parents = graph.nodes.filter(node => ['docx', 'ods'].includes(node.objectType))
const children = graph.nodes.filter(node => ['docx_heading', 'ods_sheet'].includes(node.objectType))
const deferred = graph.nodes.filter(node => ['docx_block', 'ods_cell'].includes(node.objectType))
const contains = graph.edges.filter(edge => edge.relationType === 'contains' && children.some(child => child.id === edge.target))
const identities = children.map(node => `${node.id}|${node.parentId || ''}`).sort()
const rebuiltIdentities = rebuiltGraph.nodes.filter(node => ['docx_heading', 'ods_sheet'].includes(node.objectType)).map(node => `${node.id}|${node.parentId || ''}`).sort()
if (parents.length !== 2 || children.length !== 3 || contains.length !== 3 || contains.some(edge => edge.mentions.length) || deferred.length || JSON.stringify(identities) !== JSON.stringify(rebuiltIdentities)) throw new Error(`M4A-5 graph counts/identity failed: ${JSON.stringify({ parents: parents.length, children: children.length, contains: contains.length, deferred: deferred.length })}`)
const docx = parents.find(node => node.objectType === 'docx')
const heading = children.find(node => node.objectType === 'docx_heading')
const ods = parents.find(node => node.objectType === 'ods')
const odsSheets = children.filter(node => node.objectType === 'ods_sheet')
const overview = odsSheets.find(node => node.title === 'Overview')
const notes = odsSheets.find(node => node.title === 'Notes')
if (!docx || !heading || !ods || !overview || !notes) throw new Error('M4A-5 expected fixture objects are missing')

await evaluate(`location.hash='#/graph'`)
await waitFor(`document.querySelector('.graph-stats')?.textContent?.includes('5 / 5')`, '5-node M4A-5 graph')
await evaluate(`document.querySelector('.details-close')?.click()`)
await waitFor(`!document.querySelector('[data-testid="graph-selected-node"]')`, 'closed graph details before overview capture')
await delay(500)
await capture('docx-ods-graph-1280.jpg')

const docxReady = `(() => { const node = document.getElementById(${JSON.stringify(heading.locator.objectId)}); const rect = node?.getBoundingClientRect(); return node?.classList.contains('docx-heading') && rect && rect.top >= 0 && rect.bottom <= innerHeight })()`
const docxVerify = `(() => { const node = document.getElementById(${JSON.stringify(heading.locator.objectId)}); const rect = node?.getBoundingClientRect(); return { located: Boolean(node?.classList.contains('docx-heading') && rect && rect.top >= 0 && rect.bottom <= innerHeight), blockId: node?.id || '', text: node?.textContent?.trim() || '' } })()`
const graphDocx = await openGraphChild(heading, docxReady, docxVerify)
const contextDocx = await openFromParentContext(docx, heading, `Boolean(document.querySelector('.docx-workspace .docx-page'))`, docxReady, docxVerify, 'docx-heading-relation-context-1280.jpg')

const odsReady = node => `document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim() === ${JSON.stringify(node.title)}`
const odsVerify = node => `(() => { const title = document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim() || ''; return { located: title === ${JSON.stringify(node.title)}, activeSheet: title, sheetId: ${JSON.stringify(node.locator.objectId)} } })()`
const graphOds = await openGraphChild(overview, odsReady(overview), odsVerify(overview))
const contextOds = await openFromParentContext(ods, notes, `Boolean(document.querySelector('.odf-workspace .sheet-tabs button.active'))`, odsReady(notes), odsVerify(notes), 'ods-sheet-relation-context-1280.jpg')

const sourceHashesAfter = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const sourceFilesUnchanged = JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const graphOpens = [graphDocx, graphOds]
const contextOpens = [contextDocx, contextOds]
const actual = {
  graph: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, parentCount: parents.length, childCount: children.length, docxHeadingCount: children.filter(node => node.objectType === 'docx_heading').length, odsSheetCount: children.filter(node => node.objectType === 'ods_sheet').length, deferredFineGrainedNodeCount: deferred.length, containsRelationCount: contains.length, structuralMentionCount: contains.reduce((count, edge) => count + edge.mentions.length, 0), sameSourceIdentityStable: JSON.stringify(identities) === JSON.stringify(rebuiltIdentities), objectTypes: [...new Set(graph.nodes.map(node => node.objectType))].sort() },
  graphOpens,
  contextOpens,
  graphInternalOpenCount: graphOpens.length,
  relationContextInternalOpenCount: contextOpens.length,
  returnedGraphCount: [...graphOpens, ...contextOpens].filter(item => item.returnedToGraph).length,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceFilesUnchanged,
}
if (actual.graphInternalOpenCount !== 2 || actual.relationContextInternalOpenCount !== 2 || actual.returnedGraphCount !== 4 || runtimeErrors.length || blockingErrorSurfaceObserved || !sourceFilesUnchanged) throw new Error(`M4A-5 runtime gate failed: ${JSON.stringify(actual)}`)
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-5', status: 'passed', sourceCommit, actual, sourceHashesBefore, sourceHashesAfter, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
const screenshots = []
for (const file of ['docx-ods-graph-1280.jpg', 'docx-heading-relation-context-1280.jpg', 'ods-sheet-relation-context-1280.jpg']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-5', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4A-5 desktop audit passed: ${parents.length} parents, ${children.length} children, ${contains.length} contains relations, ${runtimeErrors.length} runtime errors.`)
