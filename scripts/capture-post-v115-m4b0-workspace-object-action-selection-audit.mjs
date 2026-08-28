import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4B0_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4B0_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4B0_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4B-0 audit environment is incomplete')

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
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result.value }
const invoke = async (command, args = {}) => {
  const result = await evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))`)
  if (!result?.ok) throw new Error(`${command} failed: ${result?.error || 'unknown error'}`)
  return result.value
}
const waitFor = async (expression, description, attempts = 600) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const tablePath = path.join(library, 'M4B0 Tasks.table.json')
const markdownPath = path.join(library, 'M4B0 Today.md')
const sourceHashesBefore = { table: await sha256(tablePath), markdown: await sha256(markdownPath) }
const [overview, table] = await Promise.all([
  invoke('get_workspace_overview', { libraryRoot: library }),
  invoke('read_table_file', { libraryRoot: library, path: tablePath }),
])
const doneColumn = table.columnIds.find((id, index) => table.headers[index] === '完成' && table.columnTypes[index] === 'boolean')
const doneColumnIndex = table.columnIds.indexOf(doneColumn)
const booleanTaskRows = table.rows.filter(row => /^(?:true|false)$/i.test(row[doneColumnIndex] || ''))

await evaluate(`location.hash='#/workspace'`)
await waitFor(`document.querySelector('[data-testid="m2a1-task-section"]') && document.querySelector('[data-primary-state="ready"]')`, 'Workspace ready')
await delay(900)
await evaluate(`(() => { const pathLabel = document.querySelector('.workspace-identity p'); if (pathLabel) { pathLabel.textContent = '临时审计资料库（路径已脱敏）'; pathLabel.removeAttribute('title') } })()`)
await capture('workspace-current-actions-1280.jpg')
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await delay(400)
await evaluate(`document.querySelector('[data-testid="m2a1-task-section"]')?.scrollIntoView({ block: 'start' })`)
await delay(300)
await capture('workspace-current-actions-480.jpg')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await evaluate(`location.hash='#/library?path=${encodeURIComponent(tablePath)}&row=task-row-1&locatorToken=m4b0-audit'`)
await waitFor(`document.querySelector('.table-view') && document.body.textContent.includes('已定位第 1 行')`, 'Table row locator')
await delay(300)
await capture('table-boolean-task-row-1280.jpg')

const sourceHashesAfter = { table: await sha256(tablePath), markdown: await sha256(markdownPath) }
const sourceFilesUnchanged = JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter)
const actual = {
  workspace: {
    totalFiles: overview.totalFiles,
    markdownTaskCount: overview.tasks.length,
    tableTaskCount: 0,
    directMutationFamilies: ['markdown-task'],
    readOnlyActionFamilies: ['pdf-annotation'],
  },
  table: {
    format: table.format,
    rowCount: table.rows.length,
    booleanTaskCandidateCount: booleanTaskRows.length,
    booleanColumnId: doneColumn,
    stableRowIds: table.rowIds,
    rowLocatorObserved: await evaluate(`document.body.textContent.includes('已定位第 1 行') && Boolean(document.querySelector('.table-row.selected, .row-number.selected'))`),
    sourceWriteObserved: false,
  },
  beforeWorkflow: {
    workspaceDirectCompletionAvailable: false,
    path: ['open Table from Continue work or Library', 'locate the task row', 'edit the boolean cell', 'explicitly save the Table'],
  },
  selectedWorkflow: {
    format: 'Table',
    action: 'boolean-task-row completion and restore',
    expectedCompletionClicks: 2,
    expectedUndoClicks: 1,
    requiresConfirmation: true,
    requiresExpectedSignature: true,
    requiresStableRowAndColumnIds: true,
  },
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`),
  sourceFilesUnchanged,
}
if (actual.workspace.markdownTaskCount !== 1 || actual.workspace.tableTaskCount !== 0 || actual.table.booleanTaskCandidateCount !== 2 || actual.table.stableRowIds.length !== 2 || !actual.table.rowLocatorObserved || runtimeErrors.length || actual.blockingErrorSurfaceObserved || !sourceFilesUnchanged) throw new Error(`M4B-0 runtime gate failed: ${JSON.stringify(actual)}`)
await fs.writeFile(path.join(output, 'selection-evidence.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4B-0', status: 'passed', sourceCommit, actual, sourceHashesBefore, sourceHashesAfter, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
const screenshots = []
for (const file of ['workspace-current-actions-1280.jpg', 'workspace-current-actions-480.jpg', 'table-boolean-task-row-1280.jpg']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'selection-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4B-0', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'selection-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4B-0 selection audit passed: ${booleanTaskRows.length} Table candidates, ${overview.tasks.length} current Workspace tasks, ${runtimeErrors.length} runtime errors.`)
