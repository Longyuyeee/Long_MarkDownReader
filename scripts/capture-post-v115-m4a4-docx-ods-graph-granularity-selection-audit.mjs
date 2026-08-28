import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14536'
const output = path.resolve(process.env.LONGEDIT_M4A4_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4A4_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4A4_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4A-4 audit environment is incomplete')

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

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const files = { docx: path.join(library, 'M4A4 Word.docx'), ods: path.join(library, 'M4A4 Sheet.ods') }
const sourceHashesBefore = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const rebuilt = await invoke('rebuild_knowledge_index', { libraryRoot: library })
if (rebuilt.state !== 'ready' || rebuilt.schemaVersion !== 2) throw new Error(`Expected ready schema v2 index: ${JSON.stringify(rebuilt)}`)
const [docx, ods, graph] = await Promise.all([
  invoke('read_docx_document', { libraryRoot: library, path: files.docx }),
  invoke('read_odf_content_document', { libraryRoot: library, path: files.ods }),
  invoke('build_link_graph', { libraryRoot: library }),
])
const headings = docx.model.headings.filter(heading => heading.text.trim())
const odsCells = ods.model.sheets.reduce((count, sheet) => count + sheet.rows.reduce((sum, row) => sum + row.cells.length, 0), 0)
const heading = headings.at(-1)
const sheet = ods.model.sheets.at(-1)
if (!heading?.blockId || !sheet?.id) throw new Error(`Fixture lacks heading/sheet selection targets: ${JSON.stringify({ headings: headings.length, sheets: ods.model.sheets.length })}`)

const searches = await Promise.all([
  ['docx', 'before explicit page break', 'docx-block'],
  ['ods', 'read-only structured preview', 'ods-cell'],
].map(async ([format, query, locatorKind]) => {
  const results = await invoke('search_knowledge', { libraryRoot: library, query })
  const result = results.find(item => item.locatorKind === locatorKind)
  if (!result?.locatorObjectId) throw new Error(`Missing ${locatorKind} locator for ${query}`)
  return { format, query, locatorKind, locatorObjectId: result.locatorObjectId, locationLabel: result.locationLabel || '' }
}))

await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(files.docx)})+'&locator='+encodeURIComponent(${JSON.stringify(heading.blockId)})+'&locatorToken=m4a4-docx-heading'`)
await waitFor(`document.getElementById(${JSON.stringify(heading.blockId)})?.classList.contains('docx-heading') === true`, 'DOCX heading locator')
await delay(500)
const docxLocation = await evaluate(`(() => { const node = document.getElementById(${JSON.stringify(heading.blockId)}); const rect = node?.getBoundingClientRect(); return { route: location.hash, blockId: node?.id || '', text: node?.textContent?.trim() || '', heading: Boolean(node?.classList.contains('docx-heading')), visible: Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight) } })()`)
if (!docxLocation.heading || !docxLocation.visible) throw new Error(`DOCX heading locator is not precise: ${JSON.stringify(docxLocation)}`)
await capture('docx-heading-location-1280.jpg')

await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(files.ods)})+'&locator='+encodeURIComponent(${JSON.stringify(sheet.id)})+'&locatorToken=m4a4-ods-sheet'`)
await waitFor(`document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim() === ${JSON.stringify(sheet.name)}`, 'ODS sheet locator')
await delay(500)
const odsLocation = await evaluate(`({ route: location.hash, sheetId: ${JSON.stringify(sheet.id)}, sheetName: document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim() || '', active: document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim() === ${JSON.stringify(sheet.name)} })`)
if (!odsLocation.active) throw new Error(`ODS sheet locator is not precise: ${JSON.stringify(odsLocation)}`)
await capture('ods-sheet-location-1280.jpg')

const candidateTypes = ['docx', 'docx_heading', 'ods', 'ods_sheet']
const candidateNodes = graph.nodes.filter(node => candidateTypes.includes(node.objectType))
const sourceHashesAfter = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await sha256(file)])))
const sourceFilesUnchanged = JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const scale = {
  largeGraphAcceptedTier: 5000,
  naive: { docxBlockChildren: 50000, odsCellChildren: 200000, children: 250000, nodesWithParents: 250002, containsRelations: 250000 },
  selected: { docxHeadingCap: 512, odsSheetCap: 128, childrenPerDocumentPair: 640, nodesWithParentsPerDocumentPair: 642, containsRelationsPerDocumentPair: 640 },
  selectedNodeShareOfAcceptedTier: 642 / 5000,
  naiveToSelectedNodeRatio: 250002 / 642,
}
const actual = {
  parsedObjects: {
    docx: { blocks: docx.model.blocks.length, headings: headings.length, blockKinds: Object.fromEntries(docx.model.blocks.map(block => block.kind).filter((kind, index, values) => values.indexOf(kind) === index).map(kind => [kind, docx.model.blocks.filter(block => block.kind === kind).length])) },
    ods: { sheets: ods.model.sheets.length, cells: odsCells, sheetNames: ods.model.sheets.map(item => item.name) },
  },
  existingSearchLocators: searches,
  directSelectionLocators: [
    { format: 'docx', kind: 'docx-block', objectId: heading.blockId, label: heading.text, route: auditRoute(docxLocation.route), precise: docxLocation.heading && docxLocation.visible },
    { format: 'ods', kind: 'ods-sheet', objectId: sheet.id, label: sheet.name, route: auditRoute(odsLocation.route), precise: odsLocation.active },
  ],
  graphBeforeImplementation: { candidateNodeCount: candidateNodes.length, candidateObjectTypes: [...new Set(candidateNodes.map(node => node.objectType))] },
  scale,
  selection: { docxChildType: 'docx_heading', docxChildCap: 512, odsChildType: 'ods_sheet', odsChildCap: 128, relationType: 'contains', structuralMentionCount: 0, nextStage: 'M4A-5' },
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceFilesUnchanged,
}
if (searches.length !== 2 || candidateNodes.length !== 0 || !actual.directSelectionLocators.every(item => item.precise) || runtimeErrors.length || blockingErrorSurfaceObserved || !sourceFilesUnchanged) throw new Error(`M4A-4 runtime gate failed: ${JSON.stringify(actual)}`)
await fs.writeFile(path.join(output, 'selection-evidence.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-4', status: 'passed', sourceCommit, actual, sourceHashesBefore, sourceHashesAfter, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
const screenshots = []
for (const file of ['docx-heading-location-1280.jpg', 'ods-sheet-location-1280.jpg']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'selection-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-4', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'selection-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4A-4 selection audit passed: ${headings.length}/${docx.model.blocks.length} DOCX headings/blocks, ${ods.model.sheets.length}/${odsCells} ODS sheets/cells, ${runtimeErrors.length} runtime errors.`)
