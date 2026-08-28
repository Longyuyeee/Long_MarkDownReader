import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14531'
const output = path.resolve(process.env.LONGEDIT_M4A1_AUDIT_OUTPUT || 'docs/evidence/post-v115-m4a1-unified-object-navigation')
const library = path.resolve(process.env.LONGEDIT_M4A1_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4A1_SOURCE_COMMIT || ''
if (!library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4A-1 audit environment is incomplete')

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
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description, attempts = 400) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const invoke = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`)
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 91, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }
const setSearch = async value => {
  const changed = await evaluate(`(() => { const input = document.querySelector('.search-area input'); if (!(input instanceof HTMLInputElement)) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  if (!changed) throw new Error('Unable to set Library search input')
}
const returnToLibrary = async query => {
  await evaluate(`history.back()`)
  await waitFor(`document.querySelector('.search-area input')?.value === ${JSON.stringify(query)} && document.querySelector('.knowledge-search-result')`, `preserved Library search state for ${query}`)
}
const searchAndOpen = async ({ query, objectType, locatorKind, ready, verify }) => {
  await setSearch(''); await setSearch(query)
  await waitFor(`document.querySelector('.knowledge-search-result')?.textContent?.toLowerCase().includes(${JSON.stringify(query.toLowerCase())}) === true`, `search result for ${query}`)
  const backend = await invoke('search_knowledge', { libraryRoot: library, query })
  const result = backend.find(item => item.objectType === objectType && item.locatorKind === locatorKind)
  if (!result?.locatorObjectId) throw new Error(`Missing ${locatorKind} result for ${query}: ${JSON.stringify(backend)}`)
  const opened = await evaluate(`(() => { const cards = [...document.querySelectorAll('.knowledge-search-result')].filter(item => item.textContent?.toLowerCase().includes(${JSON.stringify(query.toLowerCase())})); const card = ${JSON.stringify(locatorKind)} === 'pptx-object' ? cards.find(item => item.querySelector('.knowledge-result-head i')?.textContent?.includes('对象')) : cards[0]; const button = card?.querySelector('.knowledge-result-open'); if (!(button instanceof HTMLElement)) return false; button.click(); return true })()`)
  if (!opened) throw new Error(`Unable to open ${locatorKind} result`)
  await waitFor(ready(result), `${locatorKind} route`)
  const route = await evaluate(`location.hash`)
  if (!route.includes(encodeURIComponent(result.locatorObjectId)) && !route.includes(result.locatorObjectId)) throw new Error(`Route omitted ${result.locatorObjectId}: ${route}`)
  const details = await evaluate(verify(result))
  if (!details?.located) throw new Error(`${locatorKind} target was not visibly located: ${JSON.stringify(details)}`)
  await returnToLibrary(query)
  return { query, objectType, locatorKind, locatorObjectId: result.locatorObjectId, locationLabel: result.locationLabel, route, details, returnedSearchState: true }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')
const fixtureFiles = (await fs.readdir(library)).map(name => path.join(library, name))
const sourceHashesBefore = Object.fromEntries(await Promise.all(fixtureFiles.map(async file => [path.basename(file), await sha256(file)])))
const rebuilt = await invoke('rebuild_knowledge_index', { libraryRoot: library })
if (rebuilt.state !== 'ready' || rebuilt.schemaVersion !== 2) throw new Error(`Expected ready schema v2 index: ${JSON.stringify(rebuilt)}`)

const results = []
results.push(await searchAndOpen({ query: 'm4a1-table-row-needle', objectType: 'table', locatorKind: 'table-row', ready: result => `document.querySelector('.table-view') && document.querySelector('[data-testid="table-data-row"][data-row-id=${JSON.stringify(result.locatorObjectId)}].selected')`, verify: result => `(() => { const row = document.querySelector('[data-testid="table-data-row"][data-row-id=${JSON.stringify(result.locatorObjectId)}]'); return { located: Boolean(row?.classList.contains('selected')), rowId: row?.getAttribute('data-row-id') || '', notice: document.querySelector('.table-meta-bar i')?.textContent || '' } })()` }))
await setSearch('m4a1-table-row-needle'); await waitFor(`document.querySelector('.knowledge-search-result')`, 'Table result after return'); await evaluate(`document.querySelector('.knowledge-result-open')?.click()`); await waitFor(`document.querySelector('.table-view')`, 'Table screenshot route'); await capture('table-row-locator-1280.jpg'); await returnToLibrary('m4a1-table-row-needle')
results.push(await searchAndOpen({ query: 'm4a1-opml-node-needle', objectType: 'opml', locatorKind: 'opml-node', ready: result => `document.querySelector('.mindmap-page') && document.querySelector('[data-testid="opml-map-node"][data-node-id=${JSON.stringify(result.locatorObjectId)}].selected')`, verify: result => `(() => { const node = document.querySelector('[data-testid="opml-map-node"][data-node-id=${JSON.stringify(result.locatorObjectId)}]'); return { located: Boolean(node?.classList.contains('selected')), nodeId: node?.getAttribute('data-node-id') || '', inspectorId: document.querySelector('.inspector-head code')?.textContent || '' } })()` }))
await setSearch('m4a1-opml-node-needle'); await waitFor(`document.querySelector('.knowledge-search-result')`, 'OPML result after return'); await evaluate(`document.querySelector('.knowledge-result-open')?.click()`); await waitFor(`document.querySelector('[data-testid="opml-map-node"].selected')`, 'OPML screenshot route'); await capture('opml-node-locator-1280.jpg'); await returnToLibrary('m4a1-opml-node-needle')
results.push(await searchAndOpen({ query: 'before explicit page break', objectType: 'docx', locatorKind: 'docx-block', ready: result => `document.querySelector('.docx-workspace') && document.getElementById(${JSON.stringify(result.locatorObjectId)})`, verify: result => `(() => { const node = document.getElementById(${JSON.stringify(result.locatorObjectId)}); return { located: Boolean(node), blockId: node?.id || '' } })()` }))
results.push(await searchAndOpen({ query: 'read-only structured preview', objectType: 'ods', locatorKind: 'ods-cell', ready: result => `document.querySelector('.odf-workspace') && document.getElementById(${JSON.stringify(result.locatorObjectId)})?.classList.contains('route-target')`, verify: result => `(() => { const node = document.getElementById(${JSON.stringify(result.locatorObjectId)}); return { located: Boolean(node?.classList.contains('route-target')), cellId: node?.id || '' } })()` }))
results.push(await searchAndOpen({ query: 'search and precise location', objectType: 'odp', locatorKind: 'odp-slide', ready: result => `document.querySelector('.odf-workspace') && document.getElementById(${JSON.stringify(result.locatorObjectId)})?.classList.contains('route-target')`, verify: result => `(() => { const node = document.getElementById(${JSON.stringify(result.locatorObjectId)}); return { located: Boolean(node?.classList.contains('route-target')), slideId: node?.id || '' } })()` }))
results.push(await searchAndOpen({ query: 'structured slide reading', objectType: 'pptx', locatorKind: 'pptx-object', ready: () => `document.querySelector('.pptx-workspace') && document.querySelector('.slide-object.route-target-object')`, verify: () => `(() => { const node = document.querySelector('.slide-object.route-target-object'); return { located: Boolean(node), objectId: node?.getAttribute('data-object-id') || '', activeSlide: document.querySelector('.slide-strip > button.active')?.getAttribute('data-slide-index') || '' } })()` }))
await setSearch('structured slide reading'); await waitFor(`document.querySelector('.knowledge-search-result')`, 'Office result after return'); await capture('office-precise-locator-regression-1280.jpg')

const sourceHashesAfter = Object.fromEntries(await Promise.all(fixtureFiles.map(async file => [path.basename(file), await sha256(file)])))
const sourceFilesUnchanged = JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
if (!sourceFilesUnchanged || runtimeErrors.length || blockingErrorSurfaceObserved) throw new Error(`M4A-1 audit gate failed: ${JSON.stringify({ sourceFilesUnchanged, runtimeErrors, blockingErrorSurfaceObserved })}`)
const evidence = { schemaVersion: 1, stage: 'M4A-1', sourceCommit, index: { state: rebuilt.state, schemaVersion: rebuilt.schemaVersion, objectCount: rebuilt.objectCount, relationCount: rebuilt.relationCount }, actual: { unifiedConsumer: 'LibraryMode knowledge search result click', preciseLocatorResults: results, tableRowLocated: results.some(item => item.locatorKind === 'table-row' && item.details.located), opmlNodeLocated: results.some(item => item.locatorKind === 'opml-node' && item.details.located), existingOfficeLocatorRegressions: results.filter(item => ['docx', 'ods', 'odp', 'pptx'].includes(item.objectType)).length, returnedSearchStateCount: results.filter(item => item.returnedSearchState).length, sourceFilesUnchanged, runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved }, runtimeErrorMessages: runtimeErrors, sourceHashesBefore, sourceHashesAfter, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['table-row-locator-1280.jpg', 'opml-node-locator-1280.jpg', 'office-precise-locator-regression-1280.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4A-1', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride'); socket.close()
console.log(`M4A-1 desktop audit passed ${results.length} precise locator checks with ${runtimeErrors.length} runtime errors.`)
