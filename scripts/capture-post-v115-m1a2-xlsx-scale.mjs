import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14413'
const output = path.resolve(process.env.LONGEDIT_M1A2_AUDIT_OUTPUT || 'docs/evidence/post-v115-m1a2-xlsx-scale')
const sourceCommit = process.env.LONGEDIT_M1A2_SOURCE_COMMIT || ''
const files = JSON.parse(process.env.LONGEDIT_M1A2_FILES || '[]')
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || files.length !== 3) throw new Error('M1A2 environment is incomplete')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
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
const click = async selector => {
  const point = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return null; const rect = node.getBoundingClientRect(); return rect.width && rect.height ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null })()`)
  if (!point) throw new Error(`Clickable element was not found: ${selector}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
const results = []
for (const item of files) {
  const beforeHash = await sha256(item.path)
  const openStarted = performance.now()
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(item.path)})`)
  await waitFor(`document.querySelector('.workbook-view .sheet-scroll') && document.querySelector('.workbook-title')?.textContent?.includes(${JSON.stringify(item.name)})`, `${item.cells} workbook open`)
  const openMs = Math.round(performance.now() - openStarted)

  const bottomStarted = performance.now()
  await evaluate(`(() => { const scroller = document.querySelector('.sheet-scroll'); const rowHeight = document.querySelector('.sheet-row')?.getBoundingClientRect().height || 20; scroller.scrollTop = Math.max(0, (${item.rows} - 12) * rowHeight); scroller.dispatchEvent(new Event('scroll')) })()`)
  await waitFor(`Math.max(0, ...[...document.querySelectorAll('.sheet-row .row-number')].map(node => Number(node.textContent))) >= ${item.rows - 4} && !document.querySelector('.workbook-status')?.textContent?.includes('正在载入行数据')`, `${item.cells} bottom page`)
  const bottomPageMs = Math.round(performance.now() - bottomStarted)

  const targetSelector = `.sheet-row:has(.row-number:is(:not(.corner)))`
  const rowSelected = await evaluate(`(() => { const rows = [...document.querySelectorAll('.sheet-row')]; const row = rows.find(node => Number(node.querySelector('.row-number')?.textContent) === ${item.rows}); const cell = row?.querySelector('.workbook-cell'); if (!cell) return false; cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); return true })()`)
  if (!rowSelected) throw new Error(`Unable to select the last row for ${item.cells} cells (${targetSelector})`)
  await evaluate(`(() => { const input = document.querySelector('.formula-bar input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(`M1A2-${item.cells}`)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`)
  await waitFor(`document.querySelector('.workbook-actions button.primary')?.textContent?.includes('保存 (1)')`, `${item.cells} dirty edit`)
  const hashBeforeSave = await sha256(item.path)
  const saveStarted = performance.now()
  await click('.workbook-actions button.primary')
  await waitFor(`document.querySelector('.workbook-actions button.primary')?.textContent?.includes('已保存')`, `${item.cells} save`)
  const saveMs = Math.round(performance.now() - saveStarted)
  const afterHash = await sha256(item.path)
  results.push({ cells: item.cells, rows: item.rows, columns: item.columns, bytes: (await fs.stat(item.path)).size, openMs, bottomPageMs, saveMs, sourceUnchangedBeforeSave: beforeHash === hashBeforeSave, targetChangedAfterSave: beforeHash !== afterHash })
}

const largest = files.at(-1)
await evaluate(`location.reload()`)
await delay(1_200)
await waitFor(`document.querySelector('.workbook-view .sheet-scroll') && document.querySelector('.workbook-title')?.textContent?.includes(${JSON.stringify(largest.name)})`, '100k workbook reopen')
await evaluate(`(() => { const scroller = document.querySelector('.sheet-scroll'); const rowHeight = document.querySelector('.sheet-row')?.getBoundingClientRect().height || 20; scroller.scrollTop = Math.max(0, (${largest.rows} - 12) * rowHeight); scroller.dispatchEvent(new Event('scroll')) })()`)
await waitFor(`Math.max(0, ...[...document.querySelectorAll('.sheet-row .row-number')].map(node => Number(node.textContent))) >= ${largest.rows - 4} && !document.querySelector('.workbook-status')?.textContent?.includes('正在载入行数据')`, '100k reopened bottom page')
const reopenedValue = await evaluate(`(() => { const rows = [...document.querySelectorAll('.sheet-row')]; const row = rows.find(node => Number(node.querySelector('.row-number')?.textContent) === ${largest.rows}); return row?.querySelector('.workbook-cell .cell-content')?.textContent?.trim() || '' })()`)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = { schemaVersion: 1, stage: 'M1A2', sourceCommit, expected: { tiers: files.map(({ cells, maximumOpenMs, maximumBottomPageMs, maximumSaveMs }) => ({ cells, maximumOpenMs, maximumBottomPageMs, maximumSaveMs })), sourceUnchangedBeforeSave: true, editedValueSurvivesReopen: true, runtimeErrorCount: 0 }, beforeActual: { tieredDesktopEvidence: false, measuredCellTiers: [] }, afterActual: { tiers: results, reopenedValue, runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved }, sourceUserContentIncluded: false, releaseCandidate: false }
evidence.differenceResolved = results.every(item => {
  const expected = files.find(candidate => candidate.cells === item.cells)
  return item.openMs <= expected.maximumOpenMs && item.bottomPageMs <= expected.maximumBottomPageMs && item.saveMs <= expected.maximumSaveMs && item.sourceUnchangedBeforeSave && item.targetChangedAfterSave
}) && reopenedValue === `M1A2-${largest.cells}` && runtimeErrors.length === 0 && !blockingErrorSurfaceObserved
await fs.writeFile(path.join(output, 'scale-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
if (!evidence.differenceResolved) throw new Error(`M1A2 scale gate failed: ${JSON.stringify(evidence.afterActual)}`)
console.log(`M1A2 scale capture accepted: ${results.map(item => `${item.cells}:${item.openMs}/${item.bottomPageMs}/${item.saveMs}ms`).join(', ')}`)
