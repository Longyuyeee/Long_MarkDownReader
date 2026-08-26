import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14415'
const output = path.resolve(process.env.LONGEDIT_M1A4A_AUDIT_OUTPUT || 'docs/evidence/post-v115-m1a4a-xlsx-conditional-editor')
const sourceCommit = process.env.LONGEDIT_M1A4A_SOURCE_COMMIT || ''
const workbookPath = process.env.LONGEDIT_M1A4A_XLSX || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !workbookPath) throw new Error('M1A4A environment is incomplete')

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
const click = async selector => {
  const point = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return null; const rect = node.getBoundingClientRect(); return rect.width && rect.height ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null })()`)
  if (!point) throw new Error(`Clickable element was not found: ${selector}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const clickText = async (selector, text) => {
  const clicked = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.trim().includes(${JSON.stringify(text)})); if (!node) return false; node.click(); return true })()`)
  if (!clicked) throw new Error(`Text control was not found: ${selector} / ${text}`)
}
const clickTextReal = async (selector, text) => {
  const point = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.trim().includes(${JSON.stringify(text)})); if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, disabled: node.getAttribute('aria-disabled'), classes: node.className } })()`)
  if (!point) throw new Error(`Text control was not found: ${selector} / ${text}`)
  if (point.disabled === 'true') throw new Error(`Text control is disabled: ${selector} / ${text} / ${point.classes}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const setInput = async (selector, value) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(node, ${JSON.stringify(value)}); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
const setSelect = async (selector, value) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(node, ${JSON.stringify(value)}); node.dispatchEvent(new Event('change', { bubbles: true })); return node.value })()`)
const selectCell = async (rowNumber, columnIndex) => {
  const point = await evaluate(`(() => { const row = [...document.querySelectorAll('.sheet-row')].find(node => Number(node.querySelector('.row-number')?.textContent) === ${rowNumber}); const cell = row?.querySelectorAll('.workbook-cell')[${columnIndex}]; if (!cell) return null; const rect = cell.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })()`)
  if (!point) throw new Error(`Cell selection failed: row=${rowNumber}, column=${columnIndex}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const openEditor = async () => {
  await clickText('.sheet-tabs button', 'Summary')
  await waitFor(`document.querySelector('.sheet-tabs button.active')?.textContent.includes('Summary') && document.querySelector('.sheet-row')`, 'Summary sheet')
  await selectCell(2, 1)
  console.log('M1A4A selection state:', await evaluate(`JSON.stringify({ address: document.querySelector('.formula-bar output')?.textContent.trim(), selected: document.querySelector('.workbook-cell.selected')?.textContent.trim(), conditional: Boolean(document.querySelector('.workbook-cell.conditional')) })`))
  await click('.tool-panel-trigger')
  await waitFor(`[...document.querySelectorAll('.n-dropdown-option')].some(node => node.textContent.includes('数据、Table 与规则'))`, 'workbook tool menu')
  await clickTextReal('.n-dropdown-option', '数据、Table 与规则')
  console.log('M1A4A tool state:', await evaluate(`JSON.stringify({ label: document.querySelector('.tool-panel-trigger')?.textContent.trim(), dataToolbar: Boolean(document.querySelector('.data-toolbar')) })`))
  await waitFor(`[...document.querySelectorAll('.data-toolbar button')].some(node => node.textContent.includes('编辑条件格式'))`, 'conditional-format data toolbar')
  await clickText('.data-toolbar button', '编辑条件格式')
  await waitFor(`document.querySelector('.conditional-format-modal')`, 'conditional-format modal')
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
const beforeHash = await sha256(workbookPath)
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(workbookPath)})`)
await delay(1_500)
console.log('M1A4A route state:', await evaluate(`JSON.stringify({ hash: location.hash, classes: document.body.className, text: document.body.innerText.slice(0, 600), workbook: Boolean(document.querySelector('.workbook-view')), sheet: Boolean(document.querySelector('.sheet-scroll')), loader: Boolean(document.querySelector('.page-loader')) })`))
await waitFor(`document.querySelector('.workbook-view') && document.querySelector('.sheet-row')`, 'XLSX workbook')
await openEditor()

const initialForm = await evaluate(`(() => { const modal = document.querySelector('.conditional-format-modal'); return { title: modal?.querySelector('.n-card-header__main')?.textContent.trim(), range: modal?.querySelector('.conditional-format-context strong')?.textContent.trim(), kinds: [...modal.querySelectorAll('.conditional-kind-switch button')].map(node => node.textContent.trim()), styleLabels: [...modal.querySelectorAll('.conditional-style-grid button span')].map(node => node.textContent.trim()), preview: modal?.querySelector('.conditional-preview strong')?.textContent.trim(), error: modal?.querySelector('.conditional-format-error')?.textContent.trim() || '' } })()`)
if (initialForm.range !== 'B2' || initialForm.styleLabels.length !== 5 || initialForm.preview !== '128') throw new Error(`Unexpected initial editor form: ${JSON.stringify(initialForm)}`)
const selectValue = await setSelect('.conditional-format-modal select', 'between')
if (selectValue !== 'between') throw new Error(`Operator selection failed: ${selectValue}`)
await waitFor(`document.querySelectorAll('.conditional-thresholds input').length === 2`, 'second threshold')
if (!await setInput('.conditional-thresholds input:nth-of-type(1)', '1000')) throw new Error('First threshold input was not found')
if (!await setInput('.conditional-thresholds label:nth-child(2) input', '2000')) throw new Error('Second threshold input was not found')
await clickText('.conditional-style-grid button', '绿色通过')
await waitFor(`document.querySelector('.conditional-format-modal button[aria-checked="true"] span')?.textContent.includes('绿色通过')`, 'green visual preset')
const hashWhileEditing = await sha256(workbookPath)
if (hashWhileEditing !== beforeHash) throw new Error('Workbook changed while the visual form was only being edited')
await capture('xlsx-conditional-editor-wide.jpg')

await clickText('.conditional-format-actions button', '应用并写入文件')
await waitFor(`!document.querySelector('.conditional-format-modal') && !document.querySelector('.data-toolbar button[disabled][title*="条件格式"]')`, 'conditional-format write completion')
await delay(500)
const afterApplyHash = await sha256(workbookPath)
if (afterApplyHash === beforeHash) throw new Error('Workbook hash did not change after applying the rule')

await evaluate(`location.reload()`)
await delay(1_200)
await waitFor(`document.querySelector('.workbook-view') && document.querySelector('.sheet-row')`, 'reopened workbook')
await openEditor()
const reopened = await evaluate(`(() => { const modal = document.querySelector('.conditional-format-modal'); const inputs = [...modal.querySelectorAll('.conditional-thresholds input')].map(node => node.value); return { operator: modal.querySelector('select')?.value, inputs, preset: modal.querySelector('.conditional-style-grid button[aria-checked="true"] span')?.textContent.trim(), error: modal.querySelector('.conditional-format-error')?.textContent.trim() || '' } })()`)
if (reopened.operator !== 'between' || JSON.stringify(reopened.inputs) !== JSON.stringify(['1000', '2000']) || reopened.preset !== '绿色通过' || reopened.error) throw new Error(`Rule did not survive reopen: ${JSON.stringify(reopened)}`)

await send('Emulation.setDeviceMetricsOverride', { width: 560, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(250)
const narrowBounds = await evaluate(`(() => { const modal = document.querySelector('.conditional-format-modal'); const rect = modal.getBoundingClientRect(); const overflowY = getComputedStyle(modal).overflowY; return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight, contained: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, overflowY, clientHeight: modal.clientHeight, scrollHeight: modal.scrollHeight, scrollable: modal.scrollHeight > modal.clientHeight && ['auto', 'scroll'].includes(overflowY) } })()`)
if (!narrowBounds.contained || !narrowBounds.scrollable) throw new Error(`Narrow conditional-format modal is not safely reachable: ${JSON.stringify(narrowBounds)}`)
await capture('xlsx-conditional-editor-narrow.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = {
  schemaVersion: 1,
  stage: 'M1A4A',
  sourceCommit,
  fixture: path.basename(workbookPath),
  expected: { operator: 'between', thresholds: ['1000', '2000'], preset: 'green_fill', visualStyleCount: 5, sourceUnchangedWhileEditing: true, sourceChangedAfterApply: true, ruleSurvivesReopen: true },
  beforeActual: { singleVisibleForm: false, visualStylePicker: false, livePreview: false, basicRulePromptSteps: 5, objectChangesUseExplicitSave: false },
  afterActual: {
    initialForm,
    sourceUnchangedWhileEditing: hashWhileEditing === beforeHash,
    sourceChangedAfterApply: afterApplyHash !== beforeHash,
    reopened,
    narrowViewportContained: narrowBounds.contained,
    narrowViewportScrollable: narrowBounds.scrollable,
    narrowBounds,
    runtimeErrorCount: runtimeErrors.length,
    blockingErrorSurfaceObserved,
    objectChangesUseExplicitSave: false
  },
  differenceResolved: initialForm.styleLabels.length === 5 && hashWhileEditing === beforeHash && afterApplyHash !== beforeHash && reopened.operator === 'between' && reopened.inputs.join(',') === '1000,2000' && reopened.preset === '绿色通过' && narrowBounds.contained && narrowBounds.scrollable && runtimeErrors.length === 0 && !blockingErrorSurfaceObserved,
  deferred: { advancedRulesRemainInAdvancedEditor: true, objectDraftUndoExplicitSave: 'M1A4B' },
  sourceUserContentIncluded: false,
  releaseCandidate: false
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['xlsx-conditional-editor-wide.jpg', 'xlsx-conditional-editor-narrow.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M1A4A', status: evidence.differenceResolved ? 'accepted' : 'rejected', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M1A4A conditional-format editor captured with ${runtimeErrors.length} runtime errors.`)
