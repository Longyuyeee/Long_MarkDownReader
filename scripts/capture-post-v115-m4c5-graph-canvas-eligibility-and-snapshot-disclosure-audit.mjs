import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14533'
const output = path.resolve(process.env.LONGEDIT_M4C5_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4C5_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4C5_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4C-5 audit environment is incomplete')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) {
  try { target = (await fetch(`${endpoint}/json`).then(response => response.json())).find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://')) } catch {}
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
  const request = pending.get(message.id); if (!request) return
  pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result.value }
const invokeResult = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))`)
const invoke = async (command, args = {}) => { const result = await invokeResult(command, args); if (!result?.ok) throw new Error(`${command} failed: ${result?.error || 'unknown error'}`); return result.value }
const waitFor = async (expression, description, attempts = 900) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,1800)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const sha256Bytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const sha256 = async file => sha256Bytes(await fs.readFile(file))
const exists = async file => fs.access(file).then(() => true, () => false)
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const clickButton = async label => { const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('button')].find(x => x.textContent?.trim().includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`); if (!clicked) throw new Error(`Cannot click button ${label}`) }
const clickDialogButton = async label => { const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('.n-dialog__action button')].find(x => x.textContent?.includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`); if (!clicked) throw new Error(`Cannot click dialog button ${label}`) }
const openGraph = async node => {
  await evaluate(`location.hash='#/'`)
  await waitFor(`document.querySelector('.library-mode') && !document.querySelector('[data-testid="graph-container"]')`, 'Library shell before graph remount')
  await evaluate(`location.hash=${JSON.stringify(`#/graph?mode=network&root=${encodeURIComponent(node.id)}`)}`)
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.dataset.nodeId === ${JSON.stringify(node.id)} && Boolean(document.querySelector('[data-testid="m4c5-send-to-canvas"]'))`, `selected ${node.title}`)
  await evaluate(`(() => { const e = document.querySelector('[data-testid="graph-selected-node"] .details-path'); if (e) { e.textContent = '临时审计资料库（路径已脱敏）'; e.removeAttribute('title') } })()`)
}
const canvasActionEnabled = () => evaluate(`!document.querySelector('[data-testid="m4c5-send-to-canvas"]')?.disabled`)
const dialogState = async () => evaluate(`(() => { const d = document.querySelector('.n-dialog'); const c = document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]'); if (!d || !c) return null; const r = d.getBoundingClientRect(); return { text: c.textContent || '', withinViewport: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, scrollReachable: c.scrollHeight >= c.clientHeight && Boolean(document.querySelector('.n-dialog__action button')) } })()`)
const routeHasCanvas = async file => waitFor(`decodeURIComponent(location.hash.replace(/\\+/g, ' ')).includes(${JSON.stringify(file)}) && Boolean(document.querySelector('.canvas-viewport'))`, `opened ${file}`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

await fs.writeFile(path.join(library, 'Data Board 思维导图.canvas'), '{"nodes":[],"edges":[]}', 'utf8')
const sourceNames = await fs.readdir(library)
const sourceFiles = sourceNames.map(name => path.join(library, name))
const initialHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [path.basename(file), await sha256(file)])))
const centerNames = ['Graph Center.md', 'Paper.pdf', 'Data.csv', 'Data.tsv', 'Data Board.table.json']
const localGraphs = []
for (const name of centerNames) localGraphs.push(await invoke('build_local_graph', { libraryRoot: library, centerPath: path.join(library, name), depth: 3 }))
const positiveCenterTypes = centerNames.filter((name, index) => localGraphs[index]?.nodes?.some(node => path.basename(node.path) === name))
const genericJsonResult = await invokeResult('build_local_graph', { libraryRoot: library, centerPath: path.join(library, 'Other.json'), depth: 3 })
const opmlResult = await invokeResult('build_local_graph', { libraryRoot: library, centerPath: path.join(library, 'Outline.opml'), depth: 3 })
const canvasResult = await invokeResult('build_local_graph', { libraryRoot: library, centerPath: path.join(library, 'Existing.canvas'), depth: 3 })
const graph = await invoke('build_link_graph', { libraryRoot: library })
const byFile = name => graph.nodes?.find(node => !node.parentId && path.basename(node.path) === name)
const markdownNode = byFile('Graph Center.md')
const tableNode = byFile('Data Board.table.json')
const opmlNode = byFile('Outline.opml')
const canvasNode = byFile('Existing.canvas')
const tableChild = graph.nodes?.find(node => node.parentId === tableNode?.id && node.objectType === 'table_view')
if (![markdownNode, tableNode, opmlNode, canvasNode, tableChild].every(Boolean)) throw new Error('Required graph eligibility nodes were not found')

await openGraph(opmlNode); const opmlActionDisabled = !await canvasActionEnabled()
await openGraph(canvasNode); const canvasActionDisabled = !await canvasActionEnabled()
await openGraph(tableChild); const internalActionDisabled = !await canvasActionEnabled()

const firstTarget = path.join(library, 'Graph Center 思维导图.canvas')
await openGraph(markdownNode); const markdownActionEnabled = await canvasActionEnabled()
await clickButton('发送到可编辑画布')
await waitFor(`Boolean(document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]'))`, 'wide Canvas disclosure')
const wideDialog = await dialogState()
const disclosureComplete1280 = Boolean(wideDialog?.withinViewport && wideDialog.text.includes('Graph Center.md') && wideDialog.text.includes('当前中心周围 3 层') && wideDialog.text.includes('Graph Center 思维导图.canvas') && wideDialog.text.includes('绝不覆盖') && wideDialog.text.includes('关系类型和有向/无向箭头') && wideDialog.text.includes('内部 locator') && wideDialog.text.includes('按关系深度重新排布') && wideDialog.text.includes('不会自动双向同步') && wideDialog.text.includes('关联文件保持不变'))
await capture('graph-canvas-disclosure-1280.jpg')
await clickDialogButton('取消'); await waitFor(`!document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]')`, 'wide disclosure close')
const cancelPreventedWrite = !await exists(firstTarget)
await clickButton('发送到可编辑画布'); await waitFor(`Boolean(document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]'))`, 'wide disclosure reopen')
await clickDialogButton('创建并打开'); await routeHasCanvas('Graph Center 思维导图.canvas')
await waitFor(`!document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]')`, 'wide disclosure close after create', 120)
await capture('graph-canvas-first-target-1280.jpg')
const firstCanvas = JSON.parse(await fs.readFile(firstTarget, 'utf8'))
await waitFor(`!document.querySelector('.n-message')`, 'first target success message close', 120)

await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await openGraph(tableNode); const tableActionEnabled = await canvasActionEnabled()
await evaluate(`document.querySelector('[data-testid="m4c5-send-to-canvas"]')?.scrollIntoView({ block: 'center' })`); await delay(150)
await clickButton('发送到可编辑画布'); await waitFor(`Boolean(document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]'))`, 'narrow Canvas disclosure')
const narrowDialog = await dialogState()
const disclosureComplete480 = Boolean(narrowDialog?.withinViewport && narrowDialog.scrollReachable && narrowDialog.text.includes('Data Board.table.json') && narrowDialog.text.includes('Data Board 思维导图.canvas') && narrowDialog.text.includes('带新序号') && narrowDialog.text.includes('多个内部对象可能指向同一源文件'))
await evaluate(`(() => { const e = document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]'); if (e) e.scrollTop = e.scrollHeight })()`); await delay(150)
await capture('graph-canvas-disclosure-480.jpg')
await clickDialogButton('创建并打开'); await routeHasCanvas('Data Board 思维导图 1.canvas')
await waitFor(`!document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]')`, 'narrow disclosure close after create', 120)
await capture('graph-canvas-numbered-target-480.jpg')
const numberedTarget = path.join(library, 'Data Board 思维导图 1.canvas')
const numberedCanvas = JSON.parse(await fs.readFile(numberedTarget, 'utf8'))

const finalHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [path.basename(file), await sha256(file)])))
const firstFiles = firstCanvas.nodes?.map(node => node.file).sort() || []
const tableFiles = numberedCanvas.nodes?.map(node => node.file) || []
const canvasNodesAreBoundedFiles = [...(firstCanvas.nodes || []), ...(numberedCanvas.nodes || [])].every(node => node.type === 'file' && typeof node.file === 'string' && !path.isAbsolute(node.file) && !('title' in node) && !('locator' in node))
const edgeProjectionMatches = (canvasEdge, graphEdge) => canvasEdge?.relationType === graphEdge?.relationType && canvasEdge?.toEnd === (graphEdge?.directed ? 'arrow' : 'none')
const relationProjectionObserved = firstCanvas.edges?.length === 1 && localGraphs[0].edges?.length === 1 && edgeProjectionMatches(firstCanvas.edges[0], localGraphs[0].edges[0]) && numberedCanvas.edges?.length === 1 && localGraphs[4].edges?.length === 1 && edgeProjectionMatches(numberedCanvas.edges[0], localGraphs[4].edges[0])
const actual = {
  positiveCenterTypes,
  genericJsonRejected: !genericJsonResult.ok && genericJsonResult.error.includes('仅支持开放 Table JSON'),
  opmlRejected: !opmlResult.ok,
  canvasRejected: !canvasResult.ok,
  opmlActionDisabled,
  canvasActionDisabled,
  internalActionDisabled,
  markdownActionEnabled,
  tableActionEnabled,
  disclosureComplete1280,
  disclosureComplete480,
  cancelPreventedWrite,
  firstTargetAutoOpened: await exists(firstTarget),
  numberedTargetAutoOpened: await exists(numberedTarget),
  firstTargetName: path.basename(firstTarget),
  numberedTargetName: path.basename(numberedTarget),
  firstNodeCount: firstCanvas.nodes?.length || 0,
  firstEdgeCount: firstCanvas.edges?.length || 0,
  numberedNodeCount: numberedCanvas.nodes?.length || 0,
  numberedEdgeCount: numberedCanvas.edges?.length || 0,
  firstFiles,
  tableFiles,
  tableInternalLocatorLossObserved: tableFiles.length === 2 && new Set(tableFiles).size === 1 && tableFiles[0] === 'Data Board.table.json',
  canvasNodesAreBoundedFiles,
  relationProjectionObserved,
  depthLayoutAndColorsObserved: firstCanvas.nodes?.some(node => node.x === 0 && node.color === '6') && firstCanvas.nodes?.some(node => node.x === 360 && node.color === '5'),
  sourcesUnchanged: JSON.stringify(initialHashes) === JSON.stringify(finalHashes),
  responsive1280: Boolean(wideDialog?.withinViewport),
  responsive480: Boolean(narrowDialog?.withinViewport),
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`),
}
if (actual.positiveCenterTypes.length !== 5 || !actual.genericJsonRejected || !actual.opmlRejected || !actual.canvasRejected || !actual.opmlActionDisabled || !actual.canvasActionDisabled || !actual.internalActionDisabled || !actual.markdownActionEnabled || !actual.tableActionEnabled || !actual.disclosureComplete1280 || !actual.disclosureComplete480 || !actual.cancelPreventedWrite || !actual.firstTargetAutoOpened || !actual.numberedTargetAutoOpened || actual.firstTargetName !== 'Graph Center 思维导图.canvas' || actual.numberedTargetName !== 'Data Board 思维导图 1.canvas' || actual.firstNodeCount !== 2 || actual.firstEdgeCount !== 1 || actual.numberedNodeCount !== 2 || actual.numberedEdgeCount !== 1 || !actual.tableInternalLocatorLossObserved || !actual.canvasNodesAreBoundedFiles || !actual.relationProjectionObserved || !actual.depthLayoutAndColorsObserved || !actual.sourcesUnchanged || !actual.responsive1280 || !actual.responsive480 || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) throw new Error(`M4C-5 runtime gate failed: ${JSON.stringify(actual)}`)

const evidence = { schemaVersion: 1, stage: 'M4C-5', status: 'passed', sourceCommit, actual, sourceFileCount: sourceFiles.length, initialHashes, finalHashes, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['graph-canvas-disclosure-1280.jpg', 'graph-canvas-first-target-1280.jpg', 'graph-canvas-disclosure-480.jpg', 'graph-canvas-numbered-target-480.jpg']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4C-5', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4C-5 graph Canvas eligibility and snapshot disclosure audit passed with ${runtimeErrors.length} runtime errors across ${sourceFiles.length} protected source files.`)
