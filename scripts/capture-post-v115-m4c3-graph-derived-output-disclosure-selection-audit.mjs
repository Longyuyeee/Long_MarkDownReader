import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4C3_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4C3_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4C3_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4C-3 audit environment is incomplete')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) {
  try {
    const targets = await fetch(`${endpoint}/json`).then(response => response.json())
    target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
  } catch {}
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
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,1600)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const sha256Bytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const sha256 = async file => sha256Bytes(await fs.readFile(file))
const exists = async file => fs.access(file).then(() => true, () => false)
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const clickButton = async label => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('button')].find(x => x.textContent?.trim().includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click button ${label}`)
}
const openGraph = async (centerId) => {
  await evaluate(`location.hash=${JSON.stringify(`#/graph?mode=network&root=${encodeURIComponent(centerId)}`)}`)
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.textContent.includes('Graph Center') && document.body.innerText.includes('发送到可编辑画布') && document.body.innerText.includes('生成项目笔记')`, 'graph output actions', 900)
  await evaluate(`(() => { const e = document.querySelector('[data-testid="graph-selected-node"] .details-path'); if (e) { e.textContent = '临时审计资料库（路径已脱敏）'; e.removeAttribute('title') } })()`)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const centerPath = path.join(library, 'Graph Center.md')
const peerPath = path.join(library, 'Graph Peer.md')
const initialHashes = { center: await sha256(centerPath), peer: await sha256(peerPath) }
const graphSnapshot = await invoke('build_link_graph', { libraryRoot: library })
const centerNode = graphSnapshot.nodes?.find(node => node.title === 'Graph Center')
if (!centerNode?.id) throw new Error('Graph Center was not found in the real graph')

await openGraph(centerNode.id)
const noPrewriteDisclosureCanvas = !await evaluate(`Boolean(document.querySelector('.n-dialog__action'))`)
const responsive1280 = await evaluate(`(() => { const e = document.querySelector('.graph-container'); return Boolean(e && e.scrollWidth <= e.clientWidth + 1) })()`)
await capture('graph-canvas-current-action-1280.jpg')
await clickButton('发送到可编辑画布')
await waitFor(`document.querySelector('.canvas-page') && document.body.innerText.includes('Graph Center 思维导图')`, 'automatically opened graph Canvas', 900)
const canvasAutoOpened = true
await capture('graph-canvas-created-target-1280.jpg')
const canvasFirst = path.join(library, 'Graph Center 思维导图.canvas')
if (!await exists(canvasFirst)) throw new Error('Graph Canvas first target was not created')
const canvasNumbered = await invoke('create_canvas_from_graph', { libraryRoot: library, centerPath, depth: 1 })
const canvas = JSON.parse(await fs.readFile(canvasFirst, 'utf8'))
await fs.unlink(canvasFirst)
await fs.unlink(canvasNumbered)

await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await openGraph(centerNode.id)
const noPrewriteDisclosureProject = !await evaluate(`Boolean(document.querySelector('.n-dialog__action'))`)
const responsive480 = await evaluate(`(() => { const e = document.querySelector('.graph-container'); if (!e) return false; const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.width > 0 })()`)
await evaluate(`(() => { const e = [...document.querySelectorAll('[data-testid="graph-selected-node"] button')].find(x => x.textContent?.includes('生成项目笔记')); if (e) e.scrollIntoView({ block: 'center' }) })()`)
await delay(200)
await capture('graph-project-current-action-480.jpg')
await clickButton('生成项目笔记')
await waitFor(`document.body.innerText.includes('Graph Center 项目') && Boolean(document.querySelector('#vditor-lib .vditor-content, .editor-main'))`, 'automatically opened graph project note', 900)
const projectAutoOpened = true
await capture('graph-project-created-target-480.jpg')
const projectFirst = path.join(library, 'Graph Center 项目.md')
if (!await exists(projectFirst)) throw new Error('Graph project first target was not created')
const projectNumbered = await invoke('create_project_note_from_graph', { libraryRoot: library, centerPath, depth: 1 })
const project = await fs.readFile(projectFirst, 'utf8')

const finalHashes = { center: await sha256(centerPath), peer: await sha256(peerPath) }
const canvasFiles = canvas.nodes?.filter(node => node.type === 'file').map(node => node.file) || []
const actual = {
  noPrewriteDisclosureCanvas,
  noPrewriteDisclosureProject,
  canvasAutoOpened,
  projectAutoOpened,
  canvasFirstName: path.basename(canvasFirst),
  canvasNumberedName: path.basename(canvasNumbered),
  projectFirstName: path.basename(projectFirst),
  projectNumberedName: path.basename(projectNumbered),
  canvasNodeCount: canvas.nodes?.length ?? -1,
  canvasEdgeCount: canvas.edges?.length ?? -1,
  canvasRelativeFileNodes: canvasFiles.length === 2 && canvasFiles.every(file => !path.isAbsolute(file)),
  canvasRelationTypesPreserved: canvas.edges?.length === 2 && canvas.edges.every(edge => edge.relationType === 'links-to' && edge.toEnd === 'arrow'),
  projectTraceable: project.includes('longedit-generated: graph-project') && project.includes('longedit-center:') && project.includes('Graph Center.md') && project.includes('longedit-depth: 3'),
  projectTemplateObserved: project.includes('## 目标') && project.includes('## 下一步') && project.includes('- [ ] 明确项目目标与完成标准'),
  projectRelatedCount: (project.match(/^- \[\[(?!Graph Center\.md)/gm) || []).length,
  sourcesUnchanged: JSON.stringify(initialHashes) === JSON.stringify(finalHashes),
  responsive1280,
  responsive480,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`),
}
if (!actual.noPrewriteDisclosureCanvas || !actual.noPrewriteDisclosureProject || !actual.canvasAutoOpened || !actual.projectAutoOpened || actual.canvasFirstName !== 'Graph Center 思维导图.canvas' || actual.canvasNumberedName !== 'Graph Center 思维导图 1.canvas' || actual.projectFirstName !== 'Graph Center 项目.md' || actual.projectNumberedName !== 'Graph Center 项目 1.md' || actual.canvasNodeCount !== 2 || actual.canvasEdgeCount !== 2 || !actual.canvasRelativeFileNodes || !actual.canvasRelationTypesPreserved || !actual.projectTraceable || !actual.projectTemplateObserved || actual.projectRelatedCount !== 1 || !actual.sourcesUnchanged || !actual.responsive1280 || !actual.responsive480 || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) throw new Error(`M4C-3 runtime gate failed: ${JSON.stringify(actual)}`)

const evidence = { schemaVersion: 1, stage: 'M4C-3', status: 'passed', sourceCommit, actual, initialHashes, finalHashes, selectedNextStage: 'M4C-4-graph-project-note-disclosure', sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'selection-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['graph-canvas-current-action-1280.jpg', 'graph-canvas-created-target-1280.jpg', 'graph-project-current-action-480.jpg', 'graph-project-created-target-480.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) })
}
const evidenceBytes = await fs.readFile(path.join(output, 'selection-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4C-3', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'selection-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4C-3 graph output selection audit passed with ${runtimeErrors.length} runtime errors.`)
