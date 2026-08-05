import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14411'
const output = path.resolve(process.env.LONGEDIT_UX38C2_AUDIT_OUTPUT || 'docs/evidence/ux38c2-workbook-context')
const sourceCommit = process.env.LONGEDIT_UX38C2_SOURCE_COMMIT || ''
const xlsxPath = process.env.LONGEDIT_UX38C2_XLSX || ''
const odsPath = process.env.LONGEDIT_UX38C2_ODS || ''
const csvPath = process.env.LONGEDIT_UX38C2_CSV || ''
const tsvPath = process.env.LONGEDIT_UX38C2_TSV || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !xlsxPath || !odsPath || !csvPath || !tsvPath) throw new Error('UX-38C2 environment is incomplete')

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
const waitFor = async (expression, description, attempts = 300) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }
const click = async selector => {
  const point = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return null; const rect = node.getBoundingClientRect(); return rect.width && rect.height ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null })()`)
  if (!point) throw new Error(`Clickable element was not found: ${selector}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const opaque = color => {
  if (!color || color === 'transparent') return false
  const match = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)
  return !match || Number(match[1]) >= 0.999
}
const verifyTableGraphReturn = async (filePath, title) => {
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(filePath)})`)
  await waitFor(`document.querySelector('.table-view .table-scroll') && document.querySelector('.table-title')?.textContent?.includes(${JSON.stringify(title)})`, `${title} table`)
  await evaluate(`(() => { const scroller = document.querySelector('.table-scroll'); scroller.scrollTo({ top: 260, left: 320 }); scroller.dispatchEvent(new Event('scroll')) })()`)
  await delay(250)
  const before = await evaluate(`(() => { const scroller = document.querySelector('.table-scroll'); return { top: scroller.scrollTop, left: scroller.scrollLeft } })()`)
  await evaluate(`location.hash = '#/graph'`)
  await waitFor(`document.querySelector('.graph-container .management-back')`, `knowledge graph from ${title}`)
  await evaluate(`document.querySelector('.graph-container .management-back').click()`)
  await waitFor(`document.querySelector('.table-view .table-scroll') && document.querySelector('.table-title')?.textContent?.includes(${JSON.stringify(title)})`, `returned ${title} table`)
  await delay(300)
  const after = await evaluate(`(() => { const scroller = document.querySelector('.table-scroll'); return { top: scroller.scrollTop, left: scroller.scrollLeft, error: document.querySelector('.table-state')?.textContent || '' } })()`)
  return { restored: Math.abs(after.top - before.top) <= 2 && Math.abs(after.left - before.left) <= 2 && !after.error.includes('无法打开'), before, after }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')

await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(xlsxPath)})`)
await waitFor(`document.querySelector('.workbook-view .sheet-scroll') && document.querySelector('.workbook-title')?.textContent?.includes('UX38C2 Workbook.xlsx')`, 'XLSX workbook')
const workbookLoaded = true
await evaluate(`(() => { const scroller = document.querySelector('.sheet-scroll'); scroller.scrollTo({ top: 220, left: 180 }); scroller.dispatchEvent(new Event('scroll')) })()`)
await delay(450)
const frozenMetrics = await evaluate(`(() => {
  const scroller = document.querySelector('.sheet-scroll').getBoundingClientRect()
  const headers = [...document.querySelectorAll('.column-header.frozen')].map(node => ({ left: node.getBoundingClientRect().left, background: getComputedStyle(node).backgroundColor }))
  const cells = [...document.querySelectorAll('.workbook-cell.frozen')].slice(0, 8).map(node => getComputedStyle(node).backgroundColor)
  const rowNumber = document.querySelector('.sheet-row .row-number')
  return { scrollLeft: document.querySelector('.sheet-scroll').scrollLeft, scrollTop: document.querySelector('.sheet-scroll').scrollTop, scrollerLeft: scroller.left, headers, cells, rowNumberBackground: getComputedStyle(rowNumber).backgroundColor }
})()`)
const workbookFrozenLayersOpaque = [...frozenMetrics.headers.map(item => item.background), ...frozenMetrics.cells, frozenMetrics.rowNumberBackground].every(opaque)
const workbookFrozenPositionsStable = frozenMetrics.headers.length > 0 && Math.abs(frozenMetrics.headers[0].left - frozenMetrics.scrollerLeft - 52) <= 2
if (!workbookFrozenLayersOpaque || !workbookFrozenPositionsStable) throw new Error(`XLSX frozen layer gate failed: ${JSON.stringify(frozenMetrics)}`)
await capture('xlsx-frozen-grid.jpg')

const sheetCount = await evaluate(`document.querySelectorAll('.workbook-view .sheet-tabs button').length`)
if (sheetCount < 2) throw new Error('XLSX fixture must expose multiple sheets')
await click('.workbook-view .sheet-tabs button:nth-of-type(2)')
await waitFor(`document.querySelector('.workbook-view .sheet-tabs button:nth-of-type(2).active') && document.querySelector('.workbook-view .sheet-scroll')`, 'second XLSX sheet grid')
await evaluate(`(() => { const scroller = document.querySelector('.sheet-scroll'); scroller.scrollTo({ top: 360, left: 140 }); scroller.dispatchEvent(new Event('scroll')) })()`)
await delay(300)
const xlsxBeforeGraph = await evaluate(`(() => { const scroller = document.querySelector('.sheet-scroll'); return { sheet: document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim(), top: scroller.scrollTop, left: scroller.scrollLeft } })()`)
await evaluate(`location.hash = '#/graph'`)
await waitFor(`document.querySelector('.graph-container .management-back')`, 'knowledge graph')
await evaluate(`document.querySelector('.graph-container .management-back').click()`)
await delay(1200)
const xlsxReturnRoute = await evaluate(`({ hash: location.hash, library: Boolean(document.querySelector('.library-mode')), workbook: Boolean(document.querySelector('.workbook-view')), state: document.querySelector('.workbook-state')?.textContent || '', title: document.querySelector('.workbook-title')?.textContent || '' })`)
if (!xlsxReturnRoute.workbook) throw new Error(`XLSX graph return route failed: ${JSON.stringify(xlsxReturnRoute)}`)
await waitFor(`document.querySelector('.workbook-view .sheet-scroll') && document.querySelector('.workbook-title')?.textContent?.includes('UX38C2 Workbook.xlsx')`, 'returned XLSX workbook')
await delay(450)
const xlsxAfterGraph = await evaluate(`(() => { const scroller = document.querySelector('.sheet-scroll'); return { sheet: document.querySelector('.workbook-view .sheet-tabs button.active')?.textContent?.trim(), top: scroller.scrollTop, left: scroller.scrollLeft, error: document.querySelector('.workbook-state')?.textContent || '' } })()`)
const workbookContextRestored = xlsxAfterGraph.sheet === xlsxBeforeGraph.sheet && Math.abs(xlsxAfterGraph.top - xlsxBeforeGraph.top) <= 2 && Math.abs(xlsxAfterGraph.left - xlsxBeforeGraph.left) <= 2 && !xlsxAfterGraph.error.includes('无法打开')
if (!workbookContextRestored) throw new Error(`XLSX graph return context failed: ${JSON.stringify({ xlsxBeforeGraph, xlsxAfterGraph })}`)
await capture('xlsx-graph-return-context.jpg')

const csvContext = await verifyTableGraphReturn(csvPath, 'UX38C2 Context.csv')
const tsvContext = await verifyTableGraphReturn(tsvPath, 'UX38C2 Context.tsv')
const csvContextRestored = csvContext.restored
const tsvContextRestored = tsvContext.restored
if (!csvContextRestored || !tsvContextRestored) throw new Error(`Table graph return context failed: ${JSON.stringify({ csvContext, tsvContext })}`)

await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(odsPath)})`)
await waitFor(`document.querySelector('.odf-workspace .sheet-stage') && document.querySelector('.identity')?.textContent?.includes('UX38C2 Spreadsheet.ods')`, 'ODS spreadsheet')
const odsLoaded = true
const odsSheetCount = await evaluate(`document.querySelectorAll('.odf-workspace .sheet-tabs button').length`)
if (odsSheetCount > 1) {
  await evaluate(`document.querySelector('.odf-workspace .sheet-tabs button:nth-of-type(2)').click()`)
  await waitFor(`document.querySelector('.odf-workspace .sheet-tabs button:nth-of-type(2).active')`, 'second ODS sheet')
}
await evaluate(`(() => { const scroller = document.querySelector('.odf-workspace .sheet-stage'); scroller.scrollTo({ top: 90, left: 160 }); scroller.dispatchEvent(new Event('scroll')) })()`)
await delay(250)
const odsBeforeGraph = await evaluate(`(() => { const scroller = document.querySelector('.odf-workspace .sheet-stage'); return { sheet: document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim(), top: scroller.scrollTop, left: scroller.scrollLeft } })()`)
await evaluate(`location.hash = '#/graph'`)
await waitFor(`document.querySelector('.graph-container .management-back')`, 'knowledge graph from ODS')
await evaluate(`document.querySelector('.graph-container .management-back').click()`)
await waitFor(`document.querySelector('.odf-workspace .sheet-stage') && document.querySelector('.identity')?.textContent?.includes('UX38C2 Spreadsheet.ods')`, 'returned ODS spreadsheet')
await delay(350)
const odsAfterGraph = await evaluate(`(() => { const scroller = document.querySelector('.odf-workspace .sheet-stage'); return { sheet: document.querySelector('.odf-workspace .sheet-tabs button.active')?.textContent?.trim(), top: scroller.scrollTop, left: scroller.scrollLeft, error: document.querySelector('.state.error')?.textContent || '' } })()`)
const odsContextRestored = odsAfterGraph.sheet === odsBeforeGraph.sheet && Math.abs(odsAfterGraph.top - odsBeforeGraph.top) <= 2 && Math.abs(odsAfterGraph.left - odsBeforeGraph.left) <= 2 && !odsAfterGraph.error
if (!odsContextRestored) throw new Error(`ODS graph return context failed: ${JSON.stringify({ odsBeforeGraph, odsAfterGraph })}`)
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(450)
const odsNarrowStable = await evaluate(`(() => { const view = document.querySelector('.odf-workspace').getBoundingClientRect(); const header = document.querySelector('.odf-workspace > header').getBoundingClientRect(); const toolbar = document.querySelector('.odf-workspace .toolbar').getBoundingClientRect(); const colors = [...document.querySelectorAll('.sheet-stage thead th, .sheet-stage tbody th')].slice(0, 8).map(node => getComputedStyle(node).backgroundColor); return { stable: view.right <= innerWidth + 1 && header.height > 70 && toolbar.width > 240 && document.documentElement.scrollWidth <= innerWidth + 2, colors } })()`)
const odsFrozenLayersOpaque = odsNarrowStable.colors.every(opaque)
if (!odsNarrowStable.stable || !odsFrozenLayersOpaque) throw new Error(`ODS narrow/frozen gate failed: ${JSON.stringify(odsNarrowStable)}`)
await capture('ods-narrow-graph-return.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = {
  schemaVersion: 1, stage: 'UX-38C2', sourceCommit, workbookLoaded, odsLoaded,
  workbookFrozenLayersOpaque, workbookFrozenPositionsStable, workbookContextRestored, csvContextRestored, tsvContextRestored, odsContextRestored,
  odsFrozenLayersOpaque, odsNarrowStable: odsNarrowStable.stable,
  runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved,
  sourceUserContentIncluded: false, releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['xlsx-frozen-grid.jpg', 'xlsx-graph-return-context.jpg', 'ods-narrow-graph-return.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-38C2', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`UX-38C2 workbook context captured with ${runtimeErrors.length} runtime errors.`)
