import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14416'
const output = path.resolve(process.env.LONGEDIT_M1A4B2_AUDIT_OUTPUT || 'docs/evidence/post-v115-m1a4b2-xlsx-object-drafts')
const sourceCommit = process.env.LONGEDIT_M1A4B2_SOURCE_COMMIT || ''
const workbookPath = process.env.LONGEDIT_M1A4B2_XLSX || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !workbookPath) throw new Error('M1A4B2 environment is incomplete')

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
const waitFor = async (expression, description, attempts = 300) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }
const clickText = async (selector, text) => {
  const clicked = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.trim().includes(${JSON.stringify(text)})); if (!node || node.disabled || node.getAttribute('aria-disabled') === 'true') return false; node.click(); return true })()`)
  if (!clicked) throw new Error(`Text control was not available: ${selector} / ${text}`)
}
const clickTextReal = async (selector, text) => {
  const point = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.trim().includes(${JSON.stringify(text)})); if (!node || node.getAttribute('aria-disabled') === 'true') return null; const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })()`)
  if (!point) throw new Error(`Text control was not available for pointer input: ${selector} / ${text}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const clickTitle = async title => {
  const clicked = await evaluate(`(() => { const node = document.querySelector('[title=${JSON.stringify(title)}]'); if (!node || node.disabled) return false; node.click(); return true })()`)
  if (!clicked) throw new Error(`Titled control was not available: ${title}`)
}
const clickSelector = async selector => {
  const clicked = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node || node.disabled) return false; node.click(); return true })()`)
  if (!clicked) throw new Error(`Control was not available: ${selector}`)
}
const setInput = async (selector, value) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(node, ${JSON.stringify(value)}); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
const setSelect = async (selector, value) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(node, ${JSON.stringify(value)}); node.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
const selectCell = async (rowNumber, columnIndex, extend = false) => {
  const point = await evaluate(`(() => { const row = [...document.querySelectorAll('.sheet-row')].find(node => Number(node.querySelector('.row-number')?.textContent) === ${rowNumber}); const cell = row?.querySelectorAll('.workbook-cell')[${columnIndex}]; if (!cell) return null; const rect = cell.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })()`)
  if (!point) throw new Error(`Cell selection failed: row=${rowNumber}, column=${columnIndex}`)
  const modifiers = extend ? 8 : 0
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1, modifiers })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1, modifiers })
}
const selectSheet = async name => {
  await clickText('.sheet-tabs button', name)
  await waitFor(`document.querySelector('.sheet-tabs button.active')?.textContent.includes(${JSON.stringify(name)}) && document.querySelector('.sheet-row')`, `${name} sheet`)
}
const openDataTools = async () => {
  if (await evaluate(`Boolean(document.querySelector('.data-toolbar'))`)) return
  const opened = await evaluate(`(() => { const node = document.querySelector('.tool-panel-trigger'); if (!node || node.disabled) return false; node.click(); return true })()`)
  if (!opened) throw new Error('Workbook tool trigger was not available')
  await waitFor(`[...document.querySelectorAll('.n-dropdown-option')].some(node => node.textContent.includes('数据、Table 与规则'))`, 'workbook tool menu')
  await clickTextReal('.n-dropdown-option', '数据、Table 与规则')
  await waitFor(`document.querySelector('.data-toolbar')`, 'data toolbar')
}
const openConditionalEditor = async () => {
  await selectSheet('Summary')
  await selectCell(2, 1)
  await openDataTools()
  await clickText('.data-toolbar button', '编辑条件格式')
  await waitFor(`document.querySelector('.conditional-format-modal')`, 'conditional-format modal')
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(workbookPath)})`)
await waitFor(`document.querySelector('.workbook-view') && document.querySelector('.sheet-row')`, 'XLSX workbook')
const beforeHash = await sha256(workbookPath)

await openConditionalEditor()
if (!await setSelect('.conditional-format-modal select', 'between')) throw new Error('Conditional operator was not set')
await waitFor(`document.querySelectorAll('.conditional-thresholds input').length === 2`, 'second conditional threshold')
if (!await setInput('.conditional-thresholds input:nth-of-type(1)', '1000')) throw new Error('First conditional threshold was not set')
if (!await setInput('.conditional-thresholds label:nth-child(2) input', '2000')) throw new Error('Second conditional threshold was not set')
await clickText('.conditional-style-grid button', '绿色通过')
await clickText('.conditional-format-actions button', '加入待保存更改')
await delay(300)
console.log('M1A4B2 first draft state:', await evaluate(`JSON.stringify({ save: document.querySelector('.workbook-actions .primary')?.textContent.trim(), status: document.querySelector('.workbook-status')?.textContent.trim(), modal: Boolean(document.querySelector('.conditional-format-modal')), messages: [...document.querySelectorAll('.n-message')].map(node => node.textContent.trim()) })`))
await waitFor(`document.querySelector('.workbook-actions .primary span')?.textContent.includes('保存 (1)') && document.querySelector('.workbook-status')?.textContent.includes('1 个对象更改')`, 'first object draft')
await waitFor(`!document.querySelector('.conditional-format-modal')`, 'conditional-format modal close')
const hashAfterConditionalDraft = await sha256(workbookPath)

await selectSheet('Inventory')
await waitFor(`Boolean(document.querySelector('.workbook-cell.in-table'))`, 'Inventory table cells')
await selectCell(1, 0)
await selectCell(3, 2, true)
await openDataTools()
console.log('M1A4B2 Inventory state:', await evaluate(`JSON.stringify({ address: document.querySelector('.formula-bar output')?.textContent.trim(), selected: document.querySelector('.workbook-cell.selected')?.className, dataToolbar: document.querySelector('.data-toolbar')?.textContent.trim(), inTableCells: document.querySelectorAll('.workbook-cell.in-table').length })`))
await waitFor(`[...document.querySelectorAll('.data-toolbar select')].some(node => [...node.options].some(option => option.value === 'TableStyleMedium4'))`, 'Inventory table style control')
const tableStyleDrafted = await evaluate(`(() => { const node = [...document.querySelectorAll('.data-toolbar select')].find(select => [...select.options].some(option => option.value === 'TableStyleMedium4')); if (!node) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(node, 'TableStyleMedium4'); node.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
if (!tableStyleDrafted) throw new Error('Table style draft was not set')
await waitFor(`document.querySelector('.workbook-actions .primary span')?.textContent.includes('保存 (2)') && document.querySelector('.workbook-status')?.textContent.includes('2 个对象更改')`, 'second object draft')
const hashAfterTableDraft = await sha256(workbookPath)
await capture('xlsx-object-drafts-before-save.jpg')

await clickSelector('.workbook-actions > button:nth-of-type(1)')
await waitFor(`document.querySelector('.workbook-actions .primary span')?.textContent.includes('保存 (1)') && document.querySelector('.workbook-status')?.textContent.includes('1 个对象更改')`, 'object draft undo')
const undoCount = 1
await clickSelector('.workbook-actions > button:nth-of-type(2)')
await waitFor(`document.querySelector('.workbook-actions .primary span')?.textContent.includes('保存 (2)') && document.querySelector('.workbook-status')?.textContent.includes('2 个对象更改')`, 'object draft redo')
const redoCount = 2

await clickText('.workbook-actions button.primary', '保存 (2)')
await delay(700)
console.log('M1A4B2 save state:', await evaluate(`JSON.stringify({ save: document.querySelector('.workbook-actions .primary')?.textContent.trim(), status: document.querySelector('.workbook-status')?.textContent.trim(), messages: [...document.querySelectorAll('.n-message')].map(node => node.textContent.trim()) })`))
await waitFor(`document.querySelector('.workbook-actions .primary span')?.textContent.trim() === '已保存'`, 'atomic workbook save')
await delay(500)
const afterSaveHash = await sha256(workbookPath)

await evaluate('location.reload()')
await waitFor(`document.querySelector('.workbook-view') && document.querySelector('.sheet-row')`, 'reopened workbook')
await openConditionalEditor()
const reopenedConditional = await evaluate(`(() => { const modal = document.querySelector('.conditional-format-modal'); return { operator: modal.querySelector('select')?.value, thresholds: [...modal.querySelectorAll('.conditional-thresholds input')].map(node => node.value), preset: modal.querySelector('.conditional-style-grid button[aria-checked="true"] span')?.textContent.trim() } })()`)
await evaluate(`document.querySelector('.conditional-format-modal .n-base-close')?.click()`)
await selectSheet('Inventory')
await waitFor(`Boolean(document.querySelector('.workbook-cell.in-table'))`, 'reopened Inventory table cells')
await selectCell(1, 0)
await selectCell(3, 2, true)
await openDataTools()
await waitFor(`[...document.querySelectorAll('.data-toolbar select')].some(node => [...node.options].some(option => option.value === 'TableStyleMedium4'))`, 'reopened table style control')
const reopenedTableStyle = await evaluate(`[...document.querySelectorAll('.data-toolbar select')].find(select => [...select.options].some(option => option.value === 'TableStyleMedium4'))?.value`)
await capture('xlsx-object-drafts-after-reopen.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const differenceResolved = hashAfterConditionalDraft === beforeHash && hashAfterTableDraft === beforeHash && undoCount === 1 && redoCount === 2 && afterSaveHash !== beforeHash && reopenedConditional.operator === 'between' && reopenedConditional.thresholds.join(',') === '1000,2000' && reopenedConditional.preset === '绿色通过' && reopenedTableStyle === 'TableStyleMedium4' && runtimeErrors.length === 0 && !blockingErrorSurfaceObserved
const evidence = {
  schemaVersion: 1,
  stage: 'M1A4B2',
  sourceCommit,
  fixture: path.basename(workbookPath),
  expected: { sourceUnchangedWhileDrafting: true, objectDraftCounts: [1, 2], undoCount: 1, redoCount: 2, sourceChangedAfterSingleSave: true, conditionalOperator: 'between', conditionalThresholds: ['1000', '2000'], tableStyle: 'TableStyleMedium4', runtimeErrorCount: 0 },
  beforeActual: { objectActionsWriteImmediately: true, objectActionsShareUndoHistory: false, mixedObjectSaveBoundary: false },
  afterActual: { sourceUnchangedAfterConditionalDraft: hashAfterConditionalDraft === beforeHash, sourceUnchangedAfterTableDraft: hashAfterTableDraft === beforeHash, undoCount, redoCount, sourceChangedAfterSingleSave: afterSaveHash !== beforeHash, reopenedConditional, reopenedTableStyle, runtimeErrorCount: runtimeErrors.length, runtimeErrors, blockingErrorSurfaceObserved },
  differenceResolved,
  sourceUserContentIncluded: false,
  releaseCandidate: false
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['xlsx-object-drafts-before-save.jpg', 'xlsx-object-drafts-after-reopen.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M1A4B2', status: differenceResolved ? 'accepted' : 'rejected', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
if (!differenceResolved) throw new Error(`M1A4B2 difference was not resolved: ${JSON.stringify(evidence.afterActual)}`)
console.log(`M1A4B2 object drafts captured with ${runtimeErrors.length} runtime errors.`)
