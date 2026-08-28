import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4B1_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4B1_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4B1_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4B-1 audit environment is incomplete')

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
const invoke = async (command, args = {}, allowFailure = false) => {
  const result = await evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))`)
  if (!result?.ok && !allowFailure) throw new Error(`${command} failed: ${result?.error || 'unknown error'}`)
  return result
}
const waitFor = async (expression, description, attempts = 600) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,1800)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const sha256Bytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const sha256 = async file => sha256Bytes(await fs.readFile(file))
const capture = async file => {
  await sanitizeWorkspacePath()
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const sanitizeWorkspacePath = () => evaluate(`(() => { const e = document.querySelector('.workspace-identity p'); if (e) { e.textContent = '临时审计资料库（路径已脱敏）'; e.removeAttribute('title') } })()`)
const clickTaskAction = async (title, testId) => {
  const clicked = await evaluate(`(() => { const row = [...document.querySelectorAll('.task-row')].find(e => e.textContent?.includes(${JSON.stringify(title)})); const button = row?.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click ${testId} for ${title}`)
}
const clickTaskOpen = async title => {
  const clicked = await evaluate(`(() => { const row = [...document.querySelectorAll('.task-row')].find(e => e.textContent?.includes(${JSON.stringify(title)})); const button = row?.querySelector('.task-open'); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot open task ${title}`)
}
const clickDialog = async label => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('.n-dialog__action button')].find(x => x.textContent?.includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement)) return false; e.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click dialog action ${label}`)
}
const clickStatus = async label => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('.task-status button')].find(x => x.textContent?.includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement)) return false; e.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click task status ${label}`)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const tablePath = path.join(library, 'M4B0 Tasks.table.json')
const markdownPath = path.join(library, 'M4B0 Today.md')
const initialTableBytes = await fs.readFile(tablePath)
const initialHashes = { table: sha256Bytes(initialTableBytes), markdown: await sha256(markdownPath) }
const initialOverviewResult = await invoke('get_workspace_overview', { libraryRoot: library })
const initialOverview = initialOverviewResult.value
const tableTasks = [...initialOverview.tasks, ...initialOverview.completedTasks].filter(task => task.sourceType === 'table')
const openTaskTitle = '复核 Table 工作台行动'
const completedTaskTitle = '保留已完成行用于恢复'

await evaluate(`location.hash='#/workspace'`)
await waitFor(`document.querySelector('[data-testid="m4b1-table-task-complete"]') && document.body.innerText.includes(${JSON.stringify(openTaskTitle)})`, 'Table task action')
const firstActionableMs = Date.now() - startedAt
await delay(350)
const responsive1280 = await evaluate(`(() => { const e = document.querySelector('.workspace-home'); return Boolean(e && e.scrollWidth <= e.clientWidth + 1) })()`)
await capture('table-tasks-workspace-1280.jpg')

await clickTaskAction(openTaskTitle, 'm4b1-table-task-complete')
await waitFor(`document.querySelector('.n-dialog__action')`, 'cancel confirmation')
await clickDialog('取消')
await waitFor(`!document.querySelector('.n-dialog__action')`, 'cancel dialog dismissal')
await delay(250)
const cancelSourceUnchanged = await sha256(tablePath) === initialHashes.table

await clickTaskAction(openTaskTitle, 'm4b1-table-task-complete')
await waitFor(`document.querySelector('.n-dialog__action')`, 'completion confirmation')
await clickDialog('完成待办')
await waitFor(`!document.querySelector('.n-dialog__action')`, 'completion dialog dismissal')
await waitFor(`document.querySelector('[data-testid="m2a1-task-undo"]') && ![...document.querySelectorAll('.task-row')].some(e => e.textContent?.includes(${JSON.stringify(openTaskTitle)}))`, 'Table task completion')
const completedHash = await sha256(tablePath)
const completeChangedSource = completedHash !== initialHashes.table
await capture('table-task-completed-1280.jpg')

const undoClicked = await evaluate(`(() => { const e = document.querySelector('[data-testid="m2a1-task-undo"]'); if (!(e instanceof HTMLButtonElement)) return false; e.click(); return true })()`)
if (!undoClicked) throw new Error('Cannot click Table task undo')
await waitFor(`[...document.querySelectorAll('.task-row')].some(e => e.textContent?.includes(${JSON.stringify(openTaskTitle)}))`, 'Table task undo')
const undoRestoredOriginalBytes = (await fs.readFile(tablePath)).equals(initialTableBytes)

await clickStatus('已完成')
await waitFor(`[...document.querySelectorAll('.task-row')].some(e => e.textContent?.includes(${JSON.stringify(completedTaskTitle)}))`, 'completed Table task')
await clickTaskAction(completedTaskTitle, 'm4b1-table-task-restore')
await waitFor(`document.querySelector('.n-dialog__action')`, 'restore confirmation')
await clickDialog('恢复待办')
await waitFor(`!document.querySelector('.n-dialog__action')`, 'restore dialog dismissal')
await waitFor(`![...document.querySelectorAll('.task-row')].some(e => e.textContent?.includes(${JSON.stringify(completedTaskTitle)}))`, 'Table task restore')
await clickStatus('未完成')
await waitFor(`[...document.querySelectorAll('.task-row')].some(e => e.textContent?.includes(${JSON.stringify(completedTaskTitle)}))`, 'restored Table task in open filter')
await clickTaskAction(completedTaskTitle, 'm4b1-table-task-complete')
await waitFor(`document.querySelector('.n-dialog__action')`, 'recomplete confirmation')
await clickDialog('完成待办')
await waitFor(`!document.querySelector('.n-dialog__action')`, 'recomplete dialog dismissal')
await waitFor(`![...document.querySelectorAll('.task-row')].some(e => e.textContent?.includes(${JSON.stringify(completedTaskTitle)}))`, 'Table task recompletion')
const restoreAndRecompleteRestoredOriginalBytes = (await fs.readFile(tablePath)).equals(initialTableBytes)

await clickTaskOpen(openTaskTitle)
await waitFor(`document.querySelector('.table-view') && document.body.textContent.includes('已定位第 1 行')`, 'precise Table row open')
const preciseTableRowOpenCount = await evaluate(`document.querySelectorAll('.table-row.selected').length`)
await waitFor(`!document.querySelector('.n-message')`, 'locator notification cleanup')
await capture('table-task-locator-1280.jpg')

await evaluate(`location.hash='#/workspace'`)
await waitFor(`document.querySelector('[data-testid="m4b1-table-task-complete"]') && document.body.innerText.includes(${JSON.stringify(openTaskTitle)})`, 'Workspace after Table locator')
await fs.appendFile(tablePath, '\n')
const conflictBytes = await fs.readFile(tablePath)
await clickTaskAction(openTaskTitle, 'm4b1-table-task-complete')
await waitFor(`document.querySelector('.n-dialog__action')`, 'stale signature confirmation')
await clickDialog('完成待办')
await waitFor(`!document.querySelector('.n-dialog__action')`, 'stale signature dialog dismissal')
await waitFor(`document.body.innerText.includes('其他程序修改')`, 'stale signature rejection')
const staleSignatureRejectedWithoutWrite = (await fs.readFile(tablePath)).equals(conflictBytes)
await capture('table-task-conflict-1280.jpg')
await fs.writeFile(tablePath, initialTableBytes)

await evaluate(`location.hash='#/library'; setTimeout(() => { location.hash='#/workspace' }, 50)`)
await waitFor(`document.querySelector('[data-testid="m4b1-table-task-complete"]') && document.body.innerText.includes(${JSON.stringify(openTaskTitle)})`, 'restored Workspace source')
await waitFor(`!document.querySelector('.n-message')`, 'restored workspace notification cleanup')
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await evaluate(`document.querySelector('[data-testid="m2a1-task-section"]')?.scrollIntoView({ block: 'start' })`)
await delay(350)
const responsive480 = await evaluate(`(() => { const e = document.querySelector('.workspace-home'); return Boolean(e && e.scrollWidth <= e.clientWidth + 1 && document.querySelector('[data-testid="m4b1-table-task-complete"]')) })()`)
await capture('table-tasks-restored-480.jpg')

const finalHashes = { table: await sha256(tablePath), markdown: await sha256(markdownPath) }
const sourceFilesUnchangedAfterAudit = JSON.stringify(finalHashes) === JSON.stringify(initialHashes)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const actual = {
  initialOpenTaskCount: initialOverview.tasks.length,
  initialCompletedTaskCount: initialOverview.completedTasks.length,
  tableTaskCount: tableTasks.length,
  cancelSourceUnchanged,
  completeChangedSource,
  undoRestoredOriginalBytes,
  restoreAndRecompleteRestoredOriginalBytes,
  staleSignatureRejectedWithoutWrite,
  preciseTableRowOpenCount,
  firstActionableMs,
  responsive1280,
  responsive480,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceFilesUnchangedAfterAudit,
}
if (actual.initialOpenTaskCount !== 2 || actual.initialCompletedTaskCount !== 1 || actual.tableTaskCount !== 2 || !cancelSourceUnchanged || !completeChangedSource || !undoRestoredOriginalBytes || !restoreAndRecompleteRestoredOriginalBytes || !staleSignatureRejectedWithoutWrite || preciseTableRowOpenCount !== 1 || firstActionableMs > 5000 || !responsive1280 || !responsive480 || runtimeErrors.length || blockingErrorSurfaceObserved || !sourceFilesUnchangedAfterAudit) throw new Error(`M4B-1 runtime gate failed: ${JSON.stringify(actual)}`)

const evidence = { schemaVersion: 1, stage: 'M4B-1', status: 'passed', sourceCommit, actual, initialHashes, completedHash, finalHashes, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['table-tasks-workspace-1280.jpg', 'table-task-completed-1280.jpg', 'table-task-locator-1280.jpg', 'table-task-conflict-1280.jpg', 'table-tasks-restored-480.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4B-1', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4B-1 Table workspace audit passed in ${firstActionableMs} ms with ${runtimeErrors.length} runtime errors.`)
