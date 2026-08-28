import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4B2_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4B2_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4B2_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4B-2 audit environment is incomplete')

const startedAt = Date.now()
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
  if (!target) await delay(100)
}
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
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
  return response.result.value
}
const invoke = async (command, args = {}) => {
  const result = await evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))`)
  if (!result?.ok) throw new Error(`${command} failed: ${result?.error || 'unknown error'}`)
  return result.value
}
const waitFor = async (expression, description, attempts = 600) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,2000)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const sha256Bytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const sha256 = async file => sha256Bytes(await fs.readFile(file))
const sanitizeWorkspacePath = () => evaluate(`(() => { const e = document.querySelector('.workspace-identity p'); if (e) { e.textContent = '临时审计资料库（路径已脱敏）'; e.removeAttribute('title') } })()`)
const capture = async file => {
  await sanitizeWorkspacePath()
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const clickTaskAction = async (title, testId) => {
  const clicked = await evaluate(`(() => { const row = [...document.querySelectorAll('.task-row')].find(e => e.textContent?.includes(${JSON.stringify(title)})); const button = row?.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click ${testId} for ${title}`)
}
const clickDialog = async label => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('.n-dialog__action button')].find(x => x.textContent?.includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement)) return false; e.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click dialog action ${label}`)
}
const clickUndo = async () => {
  const clicked = await evaluate(`(() => { const e = document.querySelector('[data-testid="m2a1-task-undo"]'); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`)
  if (!clicked) throw new Error('Cannot click Workspace task undo')
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const tablePath = path.join(library, 'M4B0 Tasks.table.json')
const markdownPath = path.join(library, 'M4B0 Today.md')
const pdfPath = path.join(library, 'Workspace Evidence.pdf')
const annotationPath = `${pdfPath}.annotations.json`
const sourcePaths = { table: tablePath, markdown: markdownPath, pdf: pdfPath, annotations: annotationPath }
const initialBytes = Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([id, file]) => [id, await fs.readFile(file)])))
const initialHashes = Object.fromEntries(Object.entries(initialBytes).map(([id, bytes]) => [id, sha256Bytes(bytes)]))
const [overview, health] = await Promise.all([
  invoke('get_workspace_overview', { libraryRoot: library }),
  invoke('analyze_workspace_health', { libraryRoot: library }),
])
const allTasks = [...overview.tasks, ...overview.completedTasks]
const markdownTaskTitle = '现有 Markdown 工作台待办'
const tableTaskTitle = '复核 Table 工作台行动'

await evaluate(`location.hash='#/workspace'`)
await waitFor(`document.querySelector('[data-testid="m2a2-workspace-primary"]')?.getAttribute('data-primary-state') === 'ready' && document.querySelector('[data-testid="m4b1-table-task-complete"]') && document.body.innerText.includes(${JSON.stringify(markdownTaskTitle)})`, 'combined Workspace actions')
const firstActionableMs = Date.now() - startedAt
await waitFor(`document.querySelector('[data-testid="m2a2-attention-queue"]')?.getAttribute('data-analysis-state') === 'ready' && document.querySelector('[data-issue-kind="annotation"]')`, 'PDF annotation governance action')
const responsive1280 = await evaluate(`(() => { const e = document.querySelector('.workspace-home'); return Boolean(e && e.scrollWidth <= e.clientWidth + 1) })()`)
await capture('workspace-actions-combined-1280.jpg')

await clickTaskAction(markdownTaskTitle, 'm2a1-task-complete')
await waitFor(`document.querySelector('.n-dialog__action')`, 'Markdown completion confirmation')
await clickDialog('完成待办')
await waitFor(`!document.querySelector('.n-dialog__action') && document.querySelector('[data-testid="m2a1-task-undo"]')`, 'Markdown completion')
const markdownCompletedHash = await sha256(markdownPath)
const markdownCompleteChangedSource = markdownCompletedHash !== initialHashes.markdown
await capture('markdown-task-completed-1280.jpg')
await clickUndo()
await waitFor(`[...document.querySelectorAll('.task-row')].some(e => e.textContent?.includes(${JSON.stringify(markdownTaskTitle)}))`, 'Markdown undo')
const markdownUndoRestoredOriginalBytes = (await fs.readFile(markdownPath)).equals(initialBytes.markdown)
await waitFor(`!document.querySelector('.n-message')`, 'Markdown notification cleanup')

await clickTaskAction(tableTaskTitle, 'm4b1-table-task-complete')
await waitFor(`document.querySelector('.n-dialog__action')`, 'Table completion confirmation')
await clickDialog('完成待办')
await waitFor(`!document.querySelector('.n-dialog__action') && document.querySelector('[data-testid="m2a1-task-undo"]')`, 'Table completion')
const tableCompletedHash = await sha256(tablePath)
const tableCompleteChangedSource = tableCompletedHash !== initialHashes.table
await capture('table-task-completed-1280.jpg')
await clickUndo()
await waitFor(`[...document.querySelectorAll('.task-row')].some(e => e.textContent?.includes(${JSON.stringify(tableTaskTitle)}))`, 'Table undo')
const tableUndoRestoredOriginalBytes = (await fs.readFile(tablePath)).equals(initialBytes.table)
await waitFor(`!document.querySelector('.n-message')`, 'Table notification cleanup')

await evaluate(`document.querySelector('[data-issue-kind="annotation"]')?.scrollIntoView({ block: 'center' })`)
const annotationClicked = await evaluate(`(() => { const e = document.querySelector('[data-issue-kind="annotation"] button'); if (!(e instanceof HTMLButtonElement)) return false; e.click(); return true })()`)
if (!annotationClicked) throw new Error('Cannot open the PDF annotation governance action')
await waitFor(`document.querySelector('.pdf-view') && document.querySelectorAll('.annotation-card.active').length === 1 && document.body.innerText.includes('Review Workspace PDF annotation entry')`, 'precise PDF annotation open', 900)
const pdfAnnotationPreciseOpenCount = await evaluate(`document.querySelectorAll('.annotation-card.active').length`)
await capture('pdf-annotation-locator-1280.jpg')
const pdfAnnotationSourceWriteObserved = await sha256(pdfPath) !== initialHashes.pdf || await sha256(annotationPath) !== initialHashes.annotations

await evaluate(`location.hash='#/workspace'`)
await waitFor(`document.querySelector('[data-testid="m4b1-table-task-complete"]') && document.querySelector('[data-testid="m2a1-task-complete"]')`, 'Workspace restored after PDF annotation')
await waitFor(`!document.querySelector('.n-message')`, 'Workspace notification cleanup')
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await evaluate(`document.querySelector('[data-testid="m2a1-task-section"]')?.scrollIntoView({ block: 'start' })`)
await delay(350)
const responsive480 = await evaluate(`(() => { const e = document.querySelector('.workspace-home'); return Boolean(e && e.scrollWidth <= e.clientWidth + 1 && document.querySelector('[data-testid="m4b1-table-task-complete"]') && document.querySelector('[data-testid="m2a1-task-complete"]')) })()`)
await capture('workspace-actions-restored-480.jpg')

const finalHashes = Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([id, file]) => [id, await sha256(file)])))
const sourceFilesUnchangedAfterAudit = JSON.stringify(finalHashes) === JSON.stringify(initialHashes)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const actual = {
  initialOpenTaskCount: overview.tasks.length,
  initialCompletedTaskCount: overview.completedTasks.length,
  markdownTaskCount: allTasks.filter(task => task.sourceType === 'markdown').length,
  tableTaskCount: allTasks.filter(task => task.sourceType === 'table').length,
  unreferencedAnnotationCount: health.unreferencedAnnotations.length,
  markdownCompleteChangedSource,
  markdownUndoRestoredOriginalBytes,
  tableCompleteChangedSource,
  tableUndoRestoredOriginalBytes,
  pdfAnnotationPreciseOpenCount,
  pdfAnnotationSourceWriteObserved,
  firstActionableMs,
  responsive1280,
  responsive480,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceFilesUnchangedAfterAudit,
}
if (actual.initialOpenTaskCount !== 2 || actual.initialCompletedTaskCount !== 1 || actual.markdownTaskCount !== 1 || actual.tableTaskCount !== 2 || actual.unreferencedAnnotationCount !== 1 || !markdownCompleteChangedSource || !markdownUndoRestoredOriginalBytes || !tableCompleteChangedSource || !tableUndoRestoredOriginalBytes || pdfAnnotationPreciseOpenCount !== 1 || pdfAnnotationSourceWriteObserved || firstActionableMs > 5000 || !responsive1280 || !responsive480 || runtimeErrors.length || blockingErrorSurfaceObserved || !sourceFilesUnchangedAfterAudit) throw new Error(`M4B-2 runtime gate failed: ${JSON.stringify(actual)}`)

const evidence = { schemaVersion: 1, stage: 'M4B-2', status: 'passed', sourceCommit, actual, initialHashes, markdownCompletedHash, tableCompletedHash, finalHashes, inheritedM4B1SafetyEvidence: true, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'exit-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['workspace-actions-combined-1280.jpg', 'markdown-task-completed-1280.jpg', 'table-task-completed-1280.jpg', 'pdf-annotation-locator-1280.jpg', 'workspace-actions-restored-480.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) })
}
const evidenceBytes = await fs.readFile(path.join(output, 'exit-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4B-2', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'exit-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4B-2 Workspace action exit audit passed in ${firstActionableMs} ms with ${runtimeErrors.length} runtime errors.`)
