import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4A2_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4A2_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4A2_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4A-2 audit environment is incomplete')

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
const waitFor = async (expression, description, attempts = 600) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const setSearch = async value => {
  const changed = await evaluate(`(() => { const input = document.querySelector('.search-area input'); if (!(input instanceof HTMLInputElement)) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  if (!changed) throw new Error('Unable to set Library search input')
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const files = {
  docx: path.join(library, 'M4A2 Word.docx'),
  ods: path.join(library, 'M4A2 Sheet.ods'),
  odp: path.join(library, 'M4A2 Slides.odp'),
  workbook: path.join(library, 'M4A2 Workbook.xlsx'),
}
const sourceHashesBefore = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const rebuilt = await invoke('rebuild_knowledge_index', { libraryRoot: library })
if (rebuilt.state !== 'ready' || rebuilt.schemaVersion !== 2) throw new Error(`Expected ready schema v2 index: ${JSON.stringify(rebuilt)}`)

const [docx, ods, odp, workbook, graph] = await Promise.all([
  invoke('read_docx_document', { libraryRoot: library, path: files.docx }),
  invoke('read_odf_content_document', { libraryRoot: library, path: files.ods }),
  invoke('read_odf_content_document', { libraryRoot: library, path: files.odp }),
  invoke('read_workbook_file', { libraryRoot: library, path: files.workbook }),
  invoke('build_link_graph', { libraryRoot: library }),
])
const searches = await Promise.all([
  ['docx', 'before explicit page break', 'docx-block'],
  ['ods', 'read-only structured preview', 'ods-cell'],
  ['odp', 'search and precise location', 'odp-slide'],
  ['workbook', 'Keyboard', 'workbook-sheet'],
].map(async ([format, query, locatorKind]) => {
  const results = await invoke('search_knowledge', { libraryRoot: library, query })
  const result = results.find(item => item.locatorKind === locatorKind)
  if (!result?.locatorObjectId) throw new Error(`Missing ${locatorKind} search locator for ${query}`)
  return { format, query, objectType: result.objectType, locatorKind, locatorObjectId: result.locatorObjectId, locationLabel: result.locationLabel || '' }
}))

await setSearch('Keyboard')
await waitFor(`document.querySelector('.knowledge-search-result')?.textContent?.includes('Keyboard')`, 'Workbook search result')
await capture('workbook-search-locator-1280.jpg')
await evaluate(`location.hash='#/graph'`)
await waitFor(`document.querySelector('[data-testid="graph-container"]') && document.querySelector('.graph-stats')`, 'Graph workspace')
await delay(500)
await evaluate(`document.querySelector('.details-close')?.click()`)
await waitFor(`!document.querySelector('[data-testid="graph-selected-node"]')`, 'closed graph node details')
await delay(500)
await capture('m1-object-graph-gap-1280.jpg')

const candidateTypes = ['docx', 'docx_block', 'ods', 'ods_cell', 'odp', 'odp_slide', 'workbook', 'workbook_sheet']
const candidateNodes = graph.nodes.filter(node => candidateTypes.includes(node.objectType))
const odsCellCount = ods.model.sheets.reduce((count, sheet) => count + sheet.rows.reduce((sum, row) => sum + row.cells.length, 0), 0)
const sourceHashesAfter = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const sourceFilesUnchanged = JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter)
const actual = {
  parsedObjects: {
    docx: { blocks: docx.model.blocks.length, relatedContent: docx.model.relatedContent.length, stableIdSample: docx.model.blocks[0]?.id || '' },
    ods: { sheets: ods.model.sheets.length, cells: odsCellCount, stableIdSample: ods.model.sheets[0]?.id || '' },
    odp: { slides: odp.model.slides.length, stableIdSample: odp.model.slides[0]?.id || '' },
    workbook: { sheets: workbook.sheets.length, stableIdSample: workbook.sheets[0] || '' },
  },
  searchLocators: searches,
  graph: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, candidateNodeCount: candidateNodes.length, candidateObjectTypes: [...new Set(candidateNodes.map(node => node.objectType))], relationMentionCount: graph.edges.reduce((count, edge) => count + edge.mentions.length, 0) },
  selection: { selectedFormats: ['Workbook', 'ODP'], selectedChildTypes: ['workbook_sheet', 'odp_slide'], structuralRelationType: 'contains', structuralMentionCount: 0, deferredFormats: ['DOCX', 'ODS'] },
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`),
  sourceFilesUnchanged,
}
if (searches.length !== 4 || candidateNodes.length !== 0 || runtimeErrors.length || actual.blockingErrorSurfaceObserved || !sourceFilesUnchanged || workbook.sheets.length !== 4 || !odp.model.slides.length) throw new Error(`M4A-2 runtime gate failed: ${JSON.stringify(actual)}`)
await fs.writeFile(path.join(output, 'selection-evidence.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-2', status: 'passed', sourceCommit, actual, sourceHashesBefore, sourceHashesAfter, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
const screenshots = []
for (const file of ['workbook-search-locator-1280.jpg', 'm1-object-graph-gap-1280.jpg']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'selection-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-2', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'selection-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4A-2 selection audit passed: ${searches.length} locator contracts, ${candidateNodes.length} candidate graph nodes, ${runtimeErrors.length} runtime errors.`)
