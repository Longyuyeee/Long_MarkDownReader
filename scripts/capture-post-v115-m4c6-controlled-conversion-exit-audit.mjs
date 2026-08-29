import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14534'
const output = path.resolve(process.env.LONGEDIT_M4C6_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4C6_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4C6_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4C-6 audit environment is incomplete')

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
const invoke = async (command, args = {}) => { const result = await evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))`); if (!result?.ok) throw new Error(`${command} failed: ${result?.error || 'unknown error'}`); return result.value }
const waitFor = async (expression, description, attempts = 900) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,2200)})`); throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`) }
const sha256Bytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const sha256 = async file => sha256Bytes(await fs.readFile(file))
const exists = async file => fs.access(file).then(() => true, () => false)
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const openManaged = file => evaluate(`location.hash=${JSON.stringify(`#/library?path=${encodeURIComponent(file)}`)}`)
const click = async selector => { const clicked = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`); if (!clicked) throw new Error(`Cannot click ${selector}`) }
const clickButton = async label => { const clicked = await evaluate(`(() => { const e=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim().includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`); if (!clicked) throw new Error(`Cannot click button ${label}`) }
const clickDialog = async label => { const clicked = await evaluate(`(() => { const e=[...document.querySelectorAll('.n-dialog__action button')].find(x=>x.textContent?.includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`); if (!clicked) throw new Error(`Cannot click dialog action ${label}`) }
const dialogText = testId => evaluate(`document.querySelector('[data-testid=${JSON.stringify(testId)}]')?.innerText || ''`)
const dialogGeometry = () => evaluate(`(() => { const d=document.querySelector('.n-dialog'); if(!d)return null; const r=d.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,innerWidth,innerHeight,minimumReadableWidth:Math.min(420,innerWidth-24)} })()`)
const dialogIsUsable = async () => {
  // Wait for Naive UI's scale-in transition before measuring or capturing.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const r = await dialogGeometry()
    if (r && r.left >= -1 && r.right <= r.innerWidth + 1 && r.top >= -1 && r.bottom <= r.innerHeight + 1 && r.width >= r.minimumReadableWidth - 1) return true
    await delay(100)
  }
  return false
}
const setViewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
const cleanMessage = () => waitFor(`!document.querySelector('.n-message')`, 'success notification cleanup', 120)
const leaveDialog = testId => waitFor(`!document.querySelector('[data-testid=${JSON.stringify(testId)}]')`, `${testId} departure`, 120)
const routeHasCanvas = file => waitFor(`decodeURIComponent(location.hash.replace(/\\+/g,' ')).includes(${JSON.stringify(file)}) && Boolean(document.querySelector('.canvas-viewport'))`, `opened ${file}`)
const routeHasMarkdown = file => waitFor(`decodeURIComponent(location.hash.replace(/\\+/g,' ')).includes(${JSON.stringify(file)}) && Boolean(document.querySelector('#vditor-lib .vditor-content, .editor-main'))`, `opened ${file}`)
const openGraph = async node => { await evaluate(`location.hash='#/'`); await waitFor(`document.querySelector('.library-mode') && !document.querySelector('[data-testid="graph-container"]')`, 'Library shell before graph'); await evaluate(`location.hash=${JSON.stringify(`#/graph?mode=network&root=${encodeURIComponent(node.id)}`)}`); await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.dataset.nodeId===${JSON.stringify(node.id)}`, `selected ${node.title}`); await evaluate(`(() => { const e=document.querySelector('[data-testid="graph-selected-node"] .details-path'); if(e){e.textContent='临时审计资料库（路径已脱敏）';e.removeAttribute('title')} })()`) }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await setViewport(1280, 820)
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const csvSource = path.join(library, 'imports', 'Conversion.csv')
const opmlSource = path.join(library, 'maps', 'Outline.opml')
const projectSource = path.join(library, 'Project Center.md')
const projectPeer = path.join(library, 'Project Peer.md')
const canvasSource = path.join(library, 'Canvas Center.md')
const canvasPeer = path.join(library, 'Canvas Peer.md')
const bases = {
  table: path.join(library, 'imports', 'Conversion.table.json'),
  opml: path.join(library, 'maps', 'Outline 画布.canvas'),
  project: path.join(library, 'Project Center 项目.md'),
  canvas: path.join(library, 'Canvas Center 思维导图.canvas'),
}
await fs.writeFile(bases.table, '{"schemaVersion":1,"kind":"longedit.table","data":{"columns":[],"rows":[]},"views":[],"activeView":""}', 'utf8')
await fs.writeFile(bases.opml, '{"nodes":[],"edges":[]}', 'utf8')
await fs.writeFile(bases.project, '# Existing project target\n', 'utf8')
await fs.writeFile(bases.canvas, '{"nodes":[],"edges":[]}', 'utf8')
const protectedFiles = [csvSource, opmlSource, projectSource, projectPeer, canvasSource, canvasPeer, ...Object.values(bases)]
const initialHashes = Object.fromEntries(await Promise.all(protectedFiles.map(async file => [path.relative(library, file).replaceAll('\\','/'), await sha256(file)])))

const targets = {
  table: path.join(library, 'imports', 'Conversion 1.table.json'),
  opml: path.join(library, 'maps', 'Outline 画布 1.canvas'),
  project: path.join(library, 'Project Center 项目 1.md'),
  canvas: path.join(library, 'Canvas Center 思维导图 1.canvas'),
}
const actual = { disclosures: {}, cancelPreventedWrites: {}, autoOpenedNumberedTargets: {}, targetReread: {}, responsive: {} }

// CSV -> Table, wide viewport.
await openManaged(csvSource)
await waitFor(`document.querySelector('.table-view') && document.querySelector('[data-testid="m4c1-create-table-copy"]')`, 'CSV conversion entry')
await click('[data-testid="m4c1-create-table-copy"]'); await waitFor(`document.querySelector('[data-testid="m4c1-table-conversion-disclosure"]')`, 'CSV disclosure')
let text = await dialogText('m4c1-table-conversion-disclosure')
actual.disclosures.csvTable = text.includes('来源：imports/Conversion.csv') && text.includes('候选目标：imports/Conversion.table.json') && text.includes('绝不覆盖来源或已有目标') && text.includes('转换规则与损失') && text.includes('编码、BOM 和换行格式不会作为 Table JSON 的物理序列化格式保留') && text.includes('原 CSV 文件保持不变')
actual.responsive.csvTable = await dialogIsUsable(); await capture('csv-table-disclosure-1280.jpg')
await clickDialog('取消'); await leaveDialog('m4c1-table-conversion-disclosure'); actual.cancelPreventedWrites.csvTable = !await exists(targets.table)
await click('[data-testid="m4c1-create-table-copy"]'); await waitFor(`document.querySelector('[data-testid="m4c1-table-conversion-disclosure"]')`, 'CSV disclosure reopen'); await clickDialog('创建并打开')
await waitFor(`document.querySelector('.table-title strong')?.textContent?.trim()==='Conversion 1.table.json'`, 'numbered Table target'); await leaveDialog('m4c1-table-conversion-disclosure'); actual.autoOpenedNumberedTargets.csvTable = true; await capture('csv-table-numbered-target-1280.jpg')
const tableTarget = await invoke('read_table_file', { libraryRoot: library, path: targets.table })
const tableJson = JSON.parse(await fs.readFile(targets.table, 'utf8'))
actual.targetReread.csvTable = tableTarget.format === 'longedit-table' && tableTarget.rows?.length === 2 && tableTarget.headers?.length === 3 && tableTarget.rows?.[0]?.[1] === '001' && !('encoding' in tableJson) && !('hasBom' in tableJson) && !('lineEnding' in tableJson)
await cleanMessage()

// OPML -> Canvas, narrow viewport.
await setViewport(480, 700); await openManaged(opmlSource)
await waitFor(`document.querySelector('.mindmap-page') && document.querySelector('[data-testid="m4c2-project-to-canvas"]')`, 'OPML projection entry')
await click('[data-testid="m4c2-project-to-canvas"]'); await waitFor(`document.querySelector('[data-testid="m4c2-opml-canvas-projection-disclosure"]')`, 'OPML disclosure')
text = await dialogText('m4c2-opml-canvas-projection-disclosure')
actual.disclosures.opmlCanvas = text.includes('来源：maps/Outline.opml') && text.includes('候选目标：maps/Outline 画布.canvas') && text.includes('带新序号的目标') && text.includes('投影规则与损失') && text.includes('head 元数据、自定义 outline 属性和折叠状态不会成为 Canvas 字段') && text.includes('独立快照') && text.includes('原 OPML 文件保持不变')
actual.responsive.opmlCanvas = await dialogIsUsable(); await capture('opml-canvas-disclosure-480.jpg')
await clickDialog('取消'); await leaveDialog('m4c2-opml-canvas-projection-disclosure'); actual.cancelPreventedWrites.opmlCanvas = !await exists(targets.opml)
await click('[data-testid="m4c2-project-to-canvas"]'); await waitFor(`document.querySelector('[data-testid="m4c2-opml-canvas-projection-disclosure"]')`, 'OPML disclosure reopen'); await clickDialog('创建并打开')
await routeHasCanvas('Outline 画布 1.canvas'); await leaveDialog('m4c2-opml-canvas-projection-disclosure'); actual.autoOpenedNumberedTargets.opmlCanvas = true; await capture('opml-canvas-numbered-target-480.jpg')
const opmlCanvas = JSON.parse(await fs.readFile(targets.opml, 'utf8'))
const opmlRaw = JSON.stringify(opmlCanvas)
actual.targetReread.opmlCanvas = opmlCanvas.nodes?.length === 5 && opmlCanvas.edges?.length === 4 && opmlCanvas.edges.every(edge => edge.relationType === 'contains') && opmlCanvas.nodes.some(node => node.type === 'file' && node.file === 'maps/Outline.opml') && !opmlRaw.includes('ownerName') && !opmlRaw.includes('_collapsed')
await cleanMessage()

const graph = await invoke('build_link_graph', { libraryRoot: library })
const projectNode = graph.nodes.find(node => !node.parentId && path.basename(node.path) === 'Project Center.md')
const canvasNode = graph.nodes.find(node => !node.parentId && path.basename(node.path) === 'Canvas Center.md')
if (!projectNode || !canvasNode) throw new Error('Graph centers were not found')

// Graph -> project note, wide viewport.
await setViewport(1280, 820); await openGraph(projectNode)
await clickButton('生成项目笔记'); await waitFor(`document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]')`, 'project-note disclosure')
text = await dialogText('m4c4-graph-project-note-disclosure')
actual.disclosures.graphProject = text.includes('中心来源：Project Center.md') && text.includes('候选目标：Project Center 项目.md') && text.includes('绝不覆盖') && text.includes('最多写入 100 个') && text.includes('不会与图谱或中心来源自动同步') && text.includes('中心来源和其他关联文件保持不变')
actual.responsive.graphProject = await dialogIsUsable(); await capture('graph-project-disclosure-1280.jpg')
await clickDialog('取消'); await leaveDialog('m4c4-graph-project-note-disclosure'); actual.cancelPreventedWrites.graphProject = !await exists(targets.project)
await clickButton('生成项目笔记'); await waitFor(`document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]')`, 'project-note disclosure reopen'); await clickDialog('生成并打开')
await routeHasMarkdown('Project Center 项目 1.md'); await leaveDialog('m4c4-graph-project-note-disclosure'); actual.autoOpenedNumberedTargets.graphProject = true; await capture('graph-project-numbered-target-1280.jpg')
const projectMarkdown = await fs.readFile(targets.project, 'utf8')
actual.targetReread.graphProject = projectMarkdown.includes('longedit-generated: graph-project') && projectMarkdown.includes('longedit-center: "Project Center.md"') && projectMarkdown.includes('[[Project Peer.md|Project Peer]]') && projectMarkdown.includes('## 下一步') && !projectMarkdown.includes('PROJECT BODY MUST NOT COPY')
await cleanMessage()

// Graph -> Canvas, narrow viewport.
await setViewport(480, 700); await openGraph(canvasNode)
await evaluate(`document.querySelector('[data-testid="m4c5-send-to-canvas"]')?.scrollIntoView({block:'center'})`); await clickButton('发送到可编辑画布'); await waitFor(`document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]')`, 'graph Canvas disclosure')
text = await dialogText('m4c5-graph-canvas-disclosure')
actual.disclosures.graphCanvas = text.includes('中心来源：Canvas Center.md') && text.includes('候选目标：Canvas Center 思维导图.canvas') && text.includes('绝不覆盖') && text.includes('关系类型和有向/无向箭头') && text.includes('内部 locator') && text.includes('按关系深度重新排布') && text.includes('不会自动双向同步')
actual.responsive.graphCanvas = await dialogIsUsable(); await capture('graph-canvas-disclosure-480.jpg')
await clickDialog('取消'); await leaveDialog('m4c5-graph-canvas-disclosure'); actual.cancelPreventedWrites.graphCanvas = !await exists(targets.canvas)
await clickButton('发送到可编辑画布'); await waitFor(`document.querySelector('[data-testid="m4c5-graph-canvas-disclosure"]')`, 'graph Canvas disclosure reopen'); await clickDialog('创建并打开')
await routeHasCanvas('Canvas Center 思维导图 1.canvas'); await leaveDialog('m4c5-graph-canvas-disclosure'); actual.autoOpenedNumberedTargets.graphCanvas = true; await capture('graph-canvas-numbered-target-480.jpg')
const graphCanvas = JSON.parse(await fs.readFile(targets.canvas, 'utf8'))
actual.targetReread.graphCanvas = graphCanvas.nodes?.length === 2 && graphCanvas.edges?.length === 1 && graphCanvas.nodes.every(node => node.type === 'file' && !path.isAbsolute(node.file) && !('locator' in node)) && graphCanvas.edges.every(edge => typeof edge.relationType === 'string' && ['arrow','none'].includes(edge.toEnd))

const finalHashes = Object.fromEntries(await Promise.all(protectedFiles.map(async file => [path.relative(library, file).replaceAll('\\','/'), await sha256(file)])))
actual.protectedFilesUnchanged = JSON.stringify(initialHashes) === JSON.stringify(finalHashes)
actual.runtimeErrorCount = runtimeErrors.length
actual.blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback,.error-boundary'))`)
actual.workflowCount = 4
const allTrue = object => Object.values(object).every(Boolean)
if (!allTrue(actual.disclosures) || !allTrue(actual.cancelPreventedWrites) || !allTrue(actual.autoOpenedNumberedTargets) || !allTrue(actual.targetReread) || !allTrue(actual.responsive) || !actual.protectedFilesUnchanged || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved || actual.workflowCount !== 4) throw new Error(`M4C-6 exit gate failed: ${JSON.stringify(actual)}`)

const evidence = { schemaVersion: 1, stage: 'M4C-6', status: 'passed', sourceCommit, actual, protectedFileCount: protectedFiles.length, initialHashes, finalHashes, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'exit-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['csv-table-disclosure-1280.jpg','csv-table-numbered-target-1280.jpg','opml-canvas-disclosure-480.jpg','opml-canvas-numbered-target-480.jpg','graph-project-disclosure-1280.jpg','graph-project-numbered-target-1280.jpg','graph-canvas-disclosure-480.jpg','graph-canvas-numbered-target-480.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) }) }
const evidenceBytes = await fs.readFile(path.join(output, 'exit-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4C-6', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'exit-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4C-6 controlled conversion exit audit passed with ${runtimeErrors.length} runtime errors across ${protectedFiles.length} protected files.`)
