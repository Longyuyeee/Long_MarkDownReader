import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14514'
const output = path.resolve('docs/evidence/p1b2a2-pdf-form-panel')
const library = process.env.LONGEDIT_PDF_FORM_LIBRARY
const sourcePath = process.env.LONGEDIT_PDF_FORM_SOURCE
if (!library || !sourcePath) throw new Error('P1-B2A2 audit paths are missing')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sourceBefore = await fs.readFile(sourcePath)
const sourceDigest = crypto.createHash('sha256').update(sourceBefore).digest('hex')
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target) throw new Error('LongEdit WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'WebView log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description) => {
  for (let index = 0; index < 400; index += 1) { if (await evaluate(expression)) return; await delay(100) }
  const diagnostic = await evaluate(`({ href: location.href, body: document.body?.innerText?.slice(0, 1200), html: document.body?.innerHTML?.slice(0, 500) })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(diagnostic)}`)
}
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const metrics = () => evaluate(`(() => {
  const panel = document.querySelector('[data-testid="p1b2a2-pdf-form-panel"]')
  const bounds = panel?.getBoundingClientRect()
  const text = panel?.textContent || ''
  return { viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth - innerWidth,
    panel: bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    integrated: Boolean(panel?.closest('.pdf-sidebar') && panel?.closest('.pdf-view') && document.querySelector('.pdf-scroll')),
    fields: panel?.querySelectorAll('.form-field-card').length || 0,
    hasSummary: text.includes('2 字段') && text.includes('2 控件') && text.includes('可填写候选'),
    hasReadOnlyBoundary: text.includes('没有填写、保存或覆盖入口'),
    hasWriteAction: [...(panel?.querySelectorAll('button') || [])].some(button => /填写|保存|覆盖/.test(button.textContent || '')),
    errorVisible: Boolean(panel?.querySelector('[data-kind="error"], [role="alert"]')) }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`Boolean(window.__TAURI_INTERNALS__) && document.readyState !== 'loading'`, 'Tauri application runtime')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(sourcePath)})`)
await waitFor(`document.querySelector('.pdf-view .pdf-scroll')`, 'PDF workspace')
const clicked = await evaluate(`(() => { const button = document.querySelector('.pdf-toolbar button[title="只读检查 PDF 表单结构"]'); if (!button) return false; button.click(); return true })()`)
if (!clicked) throw new Error('PDF form inspection toolbar action was not found')
await waitFor(`document.querySelector('[data-testid="p1b2a2-pdf-form-panel"]')`, 'integrated form panel')
const report = await evaluate(`window.__TAURI_INTERNALS__.invoke('inspect_pdf_form_structure', { libraryRoot: ${JSON.stringify(library)}, path: ${JSON.stringify(sourcePath)} })`)
await waitFor(`document.querySelectorAll('[data-testid="p1b2a2-pdf-form-panel"] .form-field-card').length === 2`, 'form field inspection')
const wide = await metrics(); await capture('pdf-form-panel-wide.png')
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false }); await delay(300)
const narrow = await metrics(); await capture('pdf-form-panel-narrow.png')

const sourceAfter = await fs.readFile(sourcePath)
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
const passed = report.status === 'inspectable' && report.fieldCount === 2 && report.widgetCount === 2 && report.fillableCandidateCount === 2
  && report.sourceDigest === sourceDigest && wide.integrated && wide.hasSummary && wide.hasReadOnlyBoundary && !wide.hasWriteAction && !wide.errorVisible
  && wide.overflow <= 2 && wide.panel?.width >= 260 && narrow.integrated && narrow.hasSummary && narrow.hasReadOnlyBoundary
  && !narrow.hasWriteAction && !narrow.errorVisible && narrow.overflow <= 2 && narrow.panel?.width >= 260
  && sourceUnchanged && runtimeErrors.length === 0
if (!passed) throw new Error(`P1-B2A2 runtime gate failed: ${JSON.stringify({ report, wide, narrow, sourceUnchanged, runtimeErrors })}`)

const evidence = { schemaVersion: 1, stage: 'P1-B2A2', report: { status: report.status, fieldCount: report.fieldCount, widgetCount: report.widgetCount, fillableCandidateCount: report.fillableCandidateCount, missingAppearanceCount: report.missingAppearanceCount, sourceDigest: report.sourceDigest }, wide, narrow, sourceUnchanged, runtimeErrorCount: runtimeErrors.length, sourceUserContentIncluded: false, passed }
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['pdf-form-panel-wide.png', 'pdf-form-panel-narrow.png']) {
  const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'P1-B2A2', status: 'accepted', screenshots, sourceUserContentIncluded: false }, null, 2)}\n`)
socket.close()
console.log('P1-B2A2 PDF form panel runtime capture passed.')
