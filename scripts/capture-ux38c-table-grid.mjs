import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14410'
const output = path.resolve(process.env.LONGEDIT_UX38C_AUDIT_OUTPUT || 'docs/evidence/ux38c-table-grid')
const sourceCommit = process.env.LONGEDIT_UX38C_SOURCE_COMMIT || ''
const csvPath = process.env.LONGEDIT_UX38C_CSV || ''
const tsvPath = process.env.LONGEDIT_UX38C_TSV || ''
const libraryPath = process.env.LONGEDIT_UX38C_LIBRARY || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !csvPath || !tsvPath || !libraryPath) throw new Error('UX-38C environment is incomplete')

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
const clickText = async (selector, text) => {
  const point = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && item.textContent?.trim().includes(${JSON.stringify(text)}) }); if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })()`)
  if (!point) throw new Error(`Clickable text was not found: ${text}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const dialogText = text => `[...document.querySelectorAll('.n-dialog')].some(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.includes(${JSON.stringify(text)}) })`

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(csvPath)})`)
await waitFor(`document.querySelector('.table-view .table-scroll') && document.querySelector('.table-title')?.textContent?.includes('UX38C Professional Grid.csv')`, 'CSV table')

await evaluate(`(() => { const input = document.querySelector('.freeze-control input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '3'); input.dispatchEvent(new Event('change', { bubbles: true })) })()`)
await waitFor(`document.querySelectorAll('.table-header .header-cell.frozen').length === 3`, 'three frozen columns')
const beforeScroll = await evaluate(`(() => { const cells = [...document.querySelectorAll('.table-header .header-cell')]; return cells.slice(0, 4).map(cell => cell.getBoundingClientRect().left) })()`)
await evaluate(`document.querySelector('.table-scroll').scrollLeft = 720`)
await delay(400)
const frozenMetrics = await evaluate(`(() => {
  const scroller = document.querySelector('.table-scroll').getBoundingClientRect()
  const cells = [...document.querySelectorAll('.table-header .header-cell')]
  const rowNumber = document.querySelector('.table-row .row-number').getBoundingClientRect()
  const first = cells.slice(0, 3).map(cell => ({ left: cell.getBoundingClientRect().left, background: getComputedStyle(cell).backgroundColor }))
  const data = [...document.querySelectorAll('.table-row .data-cell')].slice(0, 3).map(cell => getComputedStyle(cell).backgroundColor)
  return { scrollLeft: document.querySelector('.table-scroll').scrollLeft, scrollerLeft: scroller.left, rowNumberLeft: rowNumber.left, first, data, frozenCount: document.querySelectorAll('.table-header .header-cell.frozen').length, edgeCount: document.querySelectorAll('.table-header .header-cell.frozen-edge').length }
})()`)
const opaque = color => {
  if (!color || color === 'transparent') return false
  const match = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)
  return !match || Number(match[1]) >= 0.999
}
const expectedLefts = [frozenMetrics.scrollerLeft + 52, frozenMetrics.scrollerLeft + 212, frozenMetrics.scrollerLeft + 372]
const stickyPositionsStable = frozenMetrics.first.every((cell, index) => Math.abs(cell.left - expectedLefts[index]) <= 2) && Math.abs(frozenMetrics.rowNumberLeft - frozenMetrics.scrollerLeft) <= 2
const frozenLayersOpaque = [...frozenMetrics.first.map(item => item.background), ...frozenMetrics.data].every(opaque)
if (frozenMetrics.frozenCount !== 3 || frozenMetrics.edgeCount !== 1 || frozenMetrics.scrollLeft < 500 || !stickyPositionsStable || !frozenLayersOpaque) throw new Error(`Frozen-column gate failed: ${JSON.stringify({ beforeScroll, frozenMetrics, stickyPositionsStable, frozenLayersOpaque })}`)
await capture('csv-three-frozen-columns.jpg')

await evaluate(`document.querySelector('.table-row .row-number').click()`)
await waitFor(`document.querySelector('.table-row.selected') && !document.querySelector('.n-dialog')`, 'non-destructive row selection')
const rowCountBeforeDelete = await evaluate(`document.querySelector('.table-meta-bar')?.textContent`)
await clickText('.row-selection-actions button', '删除')
await waitFor(dialogText('删除第'), 'authorized delete confirmation')
const deleteDialogUsesApplicationSurface = await evaluate(`Boolean(document.querySelector('.n-dialog .n-dialog__content'))`)
await clickText('.n-dialog .n-button', '取消')
await waitFor(`!document.querySelector('.n-dialog')`, 'delete cancellation')
const rowSelectionNonDestructive = await evaluate(`Boolean(document.querySelector('.table-row.selected')) && document.querySelector('.table-meta-bar')?.textContent === ${JSON.stringify(rowCountBeforeDelete)}`)

const existingTables = (await fs.readdir(libraryPath)).filter(file => file.endsWith('.table.json'))
await clickText('.table-tools button', '创建 Table 副本')
await waitFor(dialogText('创建可视化 Table 副本'), 'conversion explanation')
const conversionExplained = await evaluate(`(() => { const text = document.querySelector('.n-dialog')?.textContent || ''; return text.includes('UX38C Professional Grid.table.json') && text.includes('原 CSV 文件保持不变') && text.includes('创建副本') && text.includes('取消') })()`)
if (!conversionExplained) throw new Error('Conversion explanation is incomplete')
await capture('csv-conversion-preview.jpg')
await clickText('.n-dialog .n-button', '创建副本')
await waitFor(dialogText('Table 副本已创建'), 'conversion result')
const createdTables = (await fs.readdir(libraryPath)).filter(file => file.endsWith('.table.json') && !existingTables.includes(file))
if (createdTables.length !== 1) throw new Error(`Expected one generated Table, received ${JSON.stringify(createdTables)}`)
const conversionResultText = await evaluate(`[...document.querySelectorAll('.n-dialog')].find(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.includes('Table 副本已创建') })?.textContent || ''`)
const conversionResultExplained = conversionResultText.includes('没有改变') && conversionResultText.includes('打开新文件') && conversionResultText.includes('在文件树中定位')
if (!conversionResultExplained) throw new Error(`Conversion completion choices are incomplete: ${JSON.stringify(conversionResultText)}`)
await clickText('.n-dialog .n-button', '在文件树中定位')
await waitFor(`[...document.querySelectorAll('.library-file-tree .n-tree-node--selected')].some(node => node.textContent?.includes(${JSON.stringify(createdTables[0].replace('.table.json', ''))}))`, 'generated Table tree selection')
const generatedTableLocated = true

await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(tsvPath)})`)
await waitFor(`document.querySelector('.table-view .table-scroll') && document.querySelector('.table-title')?.textContent?.includes('UX38C Tabular Review.tsv') && document.querySelector('.table-title')?.textContent?.includes('TSV')`, 'TSV table')
const tsvLoaded = true
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(450)
const narrowViewportStable = await evaluate(`(() => { const view = document.querySelector('.table-view').getBoundingClientRect(); const scroll = document.querySelector('.table-scroll').getBoundingClientRect(); return view.right <= innerWidth + 1 && scroll.width > 300 && document.documentElement.scrollWidth <= innerWidth + 2 })()`)
await capture('tsv-narrow-grid.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = {
  schemaVersion: 1, stage: 'UX-38C1', sourceCommit,
  csvLoaded: true, tsvLoaded, frozenColumns: frozenMetrics.frozenCount, stickyPositionsStable, frozenLayersOpaque,
  rowSelectionNonDestructive, deleteDialogUsesApplicationSurface, conversionExplained, conversionResultExplained,
  generatedTableCreated: createdTables.length === 1, generatedTableLocated, narrowViewportStable,
  runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved,
  sourceUserContentIncluded: false, releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['csv-three-frozen-columns.jpg', 'csv-conversion-preview.jpg', 'tsv-narrow-grid.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-38C1', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`UX-38C table grid captured with ${runtimeErrors.length} runtime errors.`)
