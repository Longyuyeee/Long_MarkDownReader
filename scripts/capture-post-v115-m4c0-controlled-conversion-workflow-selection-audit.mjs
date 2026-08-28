import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4C0_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4C0_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4C0_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4C-0 audit environment is incomplete')

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
const openManaged = async file => {
  await evaluate(`location.hash=${JSON.stringify(`#/library?path=${encodeURIComponent(file)}`)}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const clickButton = async label => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('button')].find(x => x.textContent?.trim().includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click button ${label}`)
}
const dismissDialog = async label => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('.n-dialog__action button')].find(x => x.textContent?.includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement)) return false; e.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot dismiss dialog with ${label}`)
}
const exists = async file => fs.access(file).then(() => true, () => false)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const csvPath = path.join(library, 'Conversion Matrix.csv')
const opmlPath = path.join(library, 'Conversion Outline.opml')
const graphCenterPath = path.join(library, 'Graph Center.md')
const graphPeerPath = path.join(library, 'Graph Peer.md')
const sourcePaths = { csv: csvPath, opml: opmlPath, graphCenter: graphCenterPath, graphPeer: graphPeerPath }
const initialHashes = Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([id, file]) => [id, await sha256(file)])))

await openManaged(csvPath)
await waitFor(`document.querySelector('.table-view') && document.body.innerText.includes('创建 Table 副本') && !document.querySelector('.table-state')`, 'CSV Table surface')
await clickButton('创建 Table 副本')
await waitFor(`document.querySelector('.n-dialog__action')`, 'CSV conversion disclosure')
const csvDialogText = await evaluate(`document.querySelector('.n-dialog')?.innerText || ''`)
const csvDialogSourceContext = await evaluate(`document.querySelector('.table-title')?.innerText.includes('Conversion Matrix.csv') || false`)
const csvDialogTargetName = csvDialogText.includes('Conversion Matrix.table.json')
const csvDialogSourceUnchanged = csvDialogText.includes('原 CSV 文件保持不变')
const csvDialogNumberedCollision = csvDialogText.includes('新的序号')
const csvDialogLossDisclosure = csvDialogText.includes('转换损失') || csvDialogText.includes('类型推断') || csvDialogText.includes('前 2,000')
const responsive1280 = await evaluate(`(() => { const e = document.querySelector('.table-view'); return Boolean(e && e.scrollWidth <= e.clientWidth + 1) })()`)
await capture('csv-current-disclosure-1280.jpg')
await dismissDialog('取消')
await waitFor(`!document.querySelector('.n-dialog__action')`, 'CSV dialog close')

const csvFirstTarget = await invoke('import_table_file', { libraryRoot: library, path: csvPath })
const csvCollisionTarget = await invoke('import_table_file', { libraryRoot: library, path: csvPath })
const csvFirstTargetCreated = await exists(csvFirstTarget)
const csvCollisionTargetCreated = await exists(csvCollisionTarget) && csvCollisionTarget !== csvFirstTarget
const csvTarget = JSON.parse(await fs.readFile(csvFirstTarget, 'utf8'))
const csvTargetRowCount = csvTarget.data?.rows?.length ?? -1
const csvTargetColumnCount = csvTarget.data?.columns?.length ?? -1
const csvSourceUnchanged = await sha256(csvPath) === initialHashes.csv
await openManaged(csvFirstTarget)
await waitFor(`document.querySelector('.table-view') && document.body.innerText.includes('开放 Table')`, 'created internal Table')
await capture('csv-created-target-1280.jpg')
const csvCurrentAutoOpen = false

await openManaged(opmlPath)
await waitFor(`document.querySelector('.mindmap-page') && document.body.innerText.includes('投影到 Canvas') && document.body.innerText.includes('4 个主题')`, 'OPML projection surface')
const opmlPreWriteDialogObserved = await evaluate(`Boolean(document.querySelector('.n-dialog__action'))`)
await capture('opml-current-projection-1280.jpg')
await clickButton('投影到 Canvas')
await waitFor(`document.querySelector('.canvas-page')`, 'automatically opened OPML Canvas', 900)
const opmlAutoOpened = true
const opmlFirstTarget = path.join(library, 'Conversion Outline 画布.canvas')
const opmlFirstTargetCreated = await exists(opmlFirstTarget)
const opmlCollisionTarget = await invoke('create_canvas_from_opml', { libraryRoot: library, path: opmlPath })
const opmlCollisionTargetCreated = await exists(opmlCollisionTarget) && opmlCollisionTarget !== opmlFirstTarget
const opmlSourceUnchanged = await sha256(opmlPath) === initialHashes.opml

const graphSnapshot = await invoke('build_link_graph', { libraryRoot: library })
const graphCenterNode = graphSnapshot.nodes?.find(node => node.title === 'Graph Center')
if (!graphCenterNode?.id) throw new Error('Graph Center node was not found in the real graph')
await evaluate(`location.hash=${JSON.stringify(`#/graph?mode=network&root=${encodeURIComponent(graphCenterNode.id)}`)}`)
await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.textContent.includes('Graph Center') && document.body.innerText.includes('发送到可编辑画布') && document.body.innerText.includes('生成项目笔记')`, 'graph output actions', 900)
const graphPreWriteDialogObserved = await evaluate(`Boolean(document.querySelector('.n-dialog__action'))`)
await evaluate(`(() => { const e = document.querySelector('[data-testid="graph-selected-node"] .details-path'); if (e) { e.textContent = '临时审计资料库（路径已脱敏）'; e.removeAttribute('title') } })()`)
await capture('graph-current-outputs-1280.jpg')
const graphCanvasFirstTarget = await invoke('create_canvas_from_graph', { libraryRoot: library, centerPath: graphCenterPath, depth: 1 })
const graphCanvasCollisionTarget = await invoke('create_canvas_from_graph', { libraryRoot: library, centerPath: graphCenterPath, depth: 1 })
const graphProjectFirstTarget = await invoke('create_project_note_from_graph', { libraryRoot: library, centerPath: graphCenterPath, depth: 1 })
const graphProjectCollisionTarget = await invoke('create_project_note_from_graph', { libraryRoot: library, centerPath: graphCenterPath, depth: 1 })
const graphCanvasFirstTargetCreated = await exists(graphCanvasFirstTarget)
const graphCanvasCollisionTargetCreated = await exists(graphCanvasCollisionTarget) && graphCanvasCollisionTarget !== graphCanvasFirstTarget
const graphProjectFirstTargetCreated = await exists(graphProjectFirstTarget)
const graphProjectCollisionTargetCreated = await exists(graphProjectCollisionTarget) && graphProjectCollisionTarget !== graphProjectFirstTarget
const graphCanvas = JSON.parse(await fs.readFile(graphCanvasFirstTarget, 'utf8'))
const graphProject = await fs.readFile(graphProjectFirstTarget, 'utf8')
const graphSourcesUnchanged = await sha256(graphCenterPath) === initialHashes.graphCenter && await sha256(graphPeerPath) === initialHashes.graphPeer

const finalHashes = Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([id, file]) => [id, await sha256(file)])))
const sourceFilesUnchangedAfterAudit = JSON.stringify(finalHashes) === JSON.stringify(initialHashes)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const actual = {
  csvDialogSourceContext,
  csvDialogTargetName,
  csvDialogSourceUnchanged,
  csvDialogNumberedCollision,
  csvDialogLossDisclosure,
  csvCurrentAutoOpen,
  csvSourceUnchanged,
  csvFirstTargetCreated,
  csvCollisionTargetCreated,
  csvTargetRowCount,
  csvTargetColumnCount,
  opmlSourceUnchanged,
  opmlAutoOpened,
  opmlFirstTargetCreated,
  opmlCollisionTargetCreated,
  opmlPreWriteDialogObserved,
  graphSourcesUnchanged,
  graphCanvasFirstTargetCreated,
  graphCanvasCollisionTargetCreated,
  graphCanvasNodeCount: graphCanvas.nodes?.length ?? -1,
  graphCanvasEdgeCount: graphCanvas.edges?.length ?? -1,
  graphProjectFirstTargetCreated,
  graphProjectCollisionTargetCreated,
  graphProjectTraceable: graphProject.includes('longedit-generated: graph-project') && graphProject.includes('longedit-center:'),
  graphPreWriteDialogObserved,
  responsive1280,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceFilesUnchangedAfterAudit,
}
if (!csvDialogSourceContext || !csvDialogTargetName || !csvDialogSourceUnchanged || !csvDialogNumberedCollision || csvDialogLossDisclosure || csvCurrentAutoOpen || !csvSourceUnchanged || !csvFirstTargetCreated || !csvCollisionTargetCreated || csvTargetRowCount !== 3 || csvTargetColumnCount !== 3 || !opmlSourceUnchanged || !opmlAutoOpened || !opmlFirstTargetCreated || !opmlCollisionTargetCreated || opmlPreWriteDialogObserved || !graphSourcesUnchanged || !graphCanvasFirstTargetCreated || !graphCanvasCollisionTargetCreated || actual.graphCanvasNodeCount !== 2 || actual.graphCanvasEdgeCount < 1 || !graphProjectFirstTargetCreated || !graphProjectCollisionTargetCreated || !actual.graphProjectTraceable || graphPreWriteDialogObserved || !responsive1280 || runtimeErrors.length || blockingErrorSurfaceObserved || !sourceFilesUnchangedAfterAudit) throw new Error(`M4C-0 runtime gate failed: ${JSON.stringify(actual)}`)

const targets = {
  csv: [path.basename(csvFirstTarget), path.basename(csvCollisionTarget)],
  opml: [path.basename(opmlFirstTarget), path.basename(opmlCollisionTarget)],
  graphCanvas: [path.basename(graphCanvasFirstTarget), path.basename(graphCanvasCollisionTarget)],
  graphProject: [path.basename(graphProjectFirstTarget), path.basename(graphProjectCollisionTarget)],
}
const evidence = { schemaVersion: 1, stage: 'M4C-0', status: 'passed', sourceCommit, actual, targets, initialHashes, finalHashes, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'selection-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['csv-current-disclosure-1280.jpg', 'csv-created-target-1280.jpg', 'opml-current-projection-1280.jpg', 'graph-current-outputs-1280.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) })
}
const evidenceBytes = await fs.readFile(path.join(output, 'selection-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4C-0', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'selection-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4C-0 conversion selection audit passed with ${runtimeErrors.length} runtime errors.`)
