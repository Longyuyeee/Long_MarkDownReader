import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14412'
const output = path.resolve(process.env.LONGEDIT_M1A1_AUDIT_OUTPUT || 'docs/evidence/post-v115-m1a1-xlsx-validation')
const sourceCommit = process.env.LONGEDIT_M1A1_SOURCE_COMMIT || ''
const workbookPath = process.env.LONGEDIT_M1A1_XLSX || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !workbookPath) throw new Error('M1A1 environment is incomplete')

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

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
const beforeHash = await sha256(workbookPath)
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(workbookPath)})`)
await waitFor(`document.querySelector('.workbook-view .sheet-scroll')`, 'XLSX workbook')
await evaluate(`([...document.querySelectorAll('.sheet-tabs button')].find(node => node.textContent.includes('Details')))?.click()`)
await waitFor(`document.querySelector('.sheet-tabs button.active')?.textContent?.includes('Details') && document.querySelector('.workbook-cell.validated')`, 'Details validation cell')
await click('.workbook-cell.validated')
await waitFor(`document.querySelector('.validation-picker')`, 'validation picker')
await click('.validation-picker')
await waitFor(`document.querySelector('.validation-menu[role="listbox"]')`, 'validation option menu')
const options = await evaluate(`[...document.querySelectorAll('.validation-menu > button')].map(node => node.textContent.trim())`)
if (JSON.stringify(options) !== JSON.stringify(['Active', 'Paused', 'Closed'])) throw new Error(`Unexpected validation options: ${JSON.stringify(options)}`)
await capture('xlsx-validation-picker-wide.jpg')
await evaluate(`([...document.querySelectorAll('.validation-menu > button')].find(node => node.textContent.includes('Closed')))?.click()`)
await waitFor(`document.querySelector('.workbook-actions button.primary')?.textContent?.includes('保存 (1)')`, 'dirty workbook after selecting Closed')
const hashBeforeSave = await sha256(workbookPath)
const draftValue = await evaluate(`document.querySelector('.workbook-cell.validated .cell-content')?.textContent?.trim()`)
if (hashBeforeSave !== beforeHash || draftValue !== 'Closed') throw new Error(`Explicit-save boundary failed: ${JSON.stringify({ beforeHash, hashBeforeSave, draftValue })}`)
await click('.workbook-actions button.primary')
await waitFor(`document.querySelector('.workbook-actions button.primary')?.textContent?.includes('已保存')`, 'saved workbook')
const afterSaveHash = await sha256(workbookPath)
if (afterSaveHash === beforeHash) throw new Error('Workbook hash did not change after Save')

await evaluate(`location.reload()`)
await delay(1_200)
await waitFor(`document.querySelector('.workbook-view .sheet-scroll')`, 'reopened workbook')
await evaluate(`([...document.querySelectorAll('.sheet-tabs button')].find(node => node.textContent.includes('Details')))?.click()`)
await waitFor(`document.querySelector('.sheet-tabs button.active')?.textContent?.includes('Details') && document.querySelector('.workbook-cell.validated')`, 'reopened Details validation cell')
const reopenedValue = await evaluate(`document.querySelector('.workbook-cell.validated .cell-content')?.textContent?.trim()`)
if (reopenedValue !== 'Closed') throw new Error(`Selected value did not survive reopen: ${reopenedValue}`)

await send('Emulation.setDeviceMetricsOverride', { width: 860, height: 700, deviceScaleFactor: 1, mobile: false })
await click('.workbook-cell.validated')
await click('.validation-picker')
await waitFor(`document.querySelector('.validation-menu')`, 'narrow validation menu')
const narrowBounds = await evaluate(`(() => { const rect = document.querySelector('.validation-menu').getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight, contained: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight } })()`)
if (!narrowBounds.contained) throw new Error(`Narrow validation menu overflowed: ${JSON.stringify(narrowBounds)}`)
await capture('xlsx-validation-picker-narrow.jpg')

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const evidence = {
  schemaVersion: 1,
  stage: 'M1A1',
  sourceCommit,
  fixture: path.basename(workbookPath),
  expected: { options: ['Active', 'Paused', 'Closed'], selectedValue: 'Closed', explicitSave: true },
  beforeActual: { validationCellPresent: true, pickerPresent: false, manualInputRequired: true },
  afterActual: {
    options,
    draftValue,
    sourceUnchangedBeforeSave: hashBeforeSave === beforeHash,
    sourceChangedAfterSave: afterSaveHash !== beforeHash,
    reopenedValue,
    narrowViewportContained: narrowBounds.contained,
    runtimeErrorCount: runtimeErrors.length,
    blockingErrorSurfaceObserved,
  },
  differenceResolved: options.length === 3 && draftValue === 'Closed' && reopenedValue === 'Closed' && hashBeforeSave === beforeHash && afterSaveHash !== beforeHash && narrowBounds.contained && runtimeErrors.length === 0 && !blockingErrorSurfaceObserved,
  sourceUserContentIncluded: false,
  releaseCandidate: false
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['xlsx-validation-picker-wide.jpg', 'xlsx-validation-picker-narrow.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M1A1', status: evidence.differenceResolved ? 'accepted' : 'rejected', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M1A1 XLSX validation picker captured with ${runtimeErrors.length} runtime errors.`)
