import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4C2_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4C2_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4C2_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4C-2 audit environment is incomplete')

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
const waitFor = async (expression, description, attempts = 900) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,2500)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const sha256Bytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const sha256 = async file => sha256Bytes(await fs.readFile(file))
const openManaged = file => evaluate(`location.hash=${JSON.stringify(`#/library?path=${encodeURIComponent(file)}`)}`)
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const clickEntry = async () => {
  const clicked = await evaluate(`(() => { const e = document.querySelector('[data-testid="m4c2-project-to-canvas"]'); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`)
  if (!clicked) throw new Error('Cannot click the M4C-2 OPML projection entry')
}
const clickDialogAction = async label => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('.n-dialog__action button')].find(x => x.textContent?.includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click dialog action ${label}`)
}
const disclosureComplete = async () => {
  const text = await evaluate(`document.querySelector('[data-testid="m4c2-opml-canvas-projection-disclosure"]')?.innerText || ''`)
  return text.includes('来源：maps/Conversion Outline.opml')
    && text.includes('候选目标：maps/Conversion Outline 画布.canvas')
    && text.includes('绝不覆盖来源或已有目标')
    && text.includes('带新序号的目标')
    && text.includes('自动打开实际创建的文件')
    && text.includes('投影规则与损失')
    && text.includes('每个 outline 会成为可编辑文本节点')
    && text.includes('父子层级成为 contains 连线')
    && text.includes('指向源 OPML 的文件节点')
    && text.includes('包括当前折叠的主题')
    && text.includes('head 元数据、自定义 outline 属性和折叠状态不会成为 Canvas 字段')
    && text.includes('当前主题、布局和手工位置不会复刻')
    && text.includes('按层级与原顺序重新排布')
    && text.includes('独立快照')
    && text.includes('不会自动同步')
    && text.includes('原 OPML 文件保持不变')
}
const geometry = async () => evaluate(`(() => { const e = document.querySelector('.mindmap-page'); const d = document.querySelector('.n-dialog'); const c = document.querySelector('[data-testid="m4c2-opml-canvas-projection-disclosure"]'); const er = e?.getBoundingClientRect(); const dr = d?.getBoundingClientRect(); return { innerWidth, innerHeight, workspace: er ? { left: er.left, right: er.right, top: er.top, bottom: er.bottom } : null, dialog: dr ? { left: dr.left, right: dr.right, top: dr.top, bottom: dr.bottom } : null, disclosureOverflowY: c ? getComputedStyle(c).overflowY : '' } })()`)
const geometryPasses = value => Boolean(value.workspace && value.dialog && value.workspace.left >= 0 && value.workspace.right <= value.innerWidth + 1 && value.workspace.top >= 0 && value.workspace.bottom <= value.innerHeight + 1 && value.dialog.left >= 0 && value.dialog.right <= value.innerWidth && value.dialog.top >= 0 && value.dialog.bottom <= value.innerHeight && value.disclosureOverflowY === 'auto')
const readProjection = async file => {
  const target = JSON.parse(await fs.readFile(file, 'utf8'))
  const nodes = target.nodes || []
  const edges = target.edges || []
  const raw = JSON.stringify(target)
  return {
    target,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    sourceFileNodeObserved: nodes.some(node => node.id === 'opml-source' && node.type === 'file' && node.file === 'maps/Conversion Outline.opml'),
    titleNoteProjectionObserved: nodes.some(node => node.id === 'opml-graph' && node.type === 'text' && node.text === '知识图谱\n\n增强关系发现'),
    collapsedTopicProjected: nodes.some(node => node.id === 'opml-root') && nodes.some(node => node.id === 'opml-opml'),
    containsHierarchyObserved: edges.length === 4 && edges.every(edge => edge.relationType === 'contains') && edges.some(edge => edge.fromNode === 'opml-root' && edge.toNode === 'opml-editors'),
    lossFieldsAbsent: !raw.includes('ownerName') && !raw.includes('LongEdit') && !raw.includes('category') && !raw.includes('product') && !raw.includes('_collapsed'),
  }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const sourcePath = path.join(library, 'maps', 'Conversion Outline.opml')
const firstTargetPath = path.join(library, 'maps', 'Conversion Outline 画布.canvas')
const numberedTargetPath = path.join(library, 'maps', 'Conversion Outline 画布 1.canvas')
const initialHash = await sha256(sourcePath)

await openManaged(sourcePath)
await waitFor(`document.querySelector('.mindmap-page') && document.querySelector('[data-testid="m4c2-project-to-canvas"]') && document.body.innerText.includes('4 个主题')`, 'OPML projection entry')
await clickEntry()
await waitFor(`document.querySelector('[data-testid="m4c2-opml-canvas-projection-disclosure"]')`, 'OPML projection disclosure at 1280')
await delay(350)
const disclosureComplete1280 = await disclosureComplete()
const geometry1280 = await geometry()
const responsive1280 = geometryPasses(geometry1280)
await capture('opml-projection-disclosure-1280.jpg')
await clickDialogAction('创建并打开')
await waitFor(`document.querySelector('.canvas-page') && document.querySelector('.canvas-title')?.textContent?.trim() === 'Conversion Outline 画布' && document.body.innerText.includes('开放 JSON Canvas')`, 'first Canvas target auto-open')
const firstTargetAutoOpened = true
await waitFor(`!document.querySelector('.n-dialog')`, 'first projection confirmation departure')
await capture('opml-first-target-auto-opened-1280.jpg')
const firstProjection = await readProjection(firstTargetPath)
await waitFor(`!document.querySelector('.n-message')`, 'first projection notification cleanup')

await openManaged(sourcePath)
await waitFor(`document.querySelector('.mindmap-page') && document.querySelector('[data-testid="m4c2-project-to-canvas"]')`, 'OPML projection entry for collision')
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await clickEntry()
await waitFor(`document.querySelector('[data-testid="m4c2-opml-canvas-projection-disclosure"]')`, 'OPML projection disclosure at 480')
await delay(350)
const disclosureComplete480 = await disclosureComplete()
const geometry480 = await geometry()
const responsive480 = geometryPasses(geometry480)
await capture('opml-numbered-projection-disclosure-480.jpg')
await clickDialogAction('创建并打开')
await waitFor(`document.querySelector('.canvas-page') && document.querySelector('.canvas-title')?.textContent?.trim() === 'Conversion Outline 画布 1'`, 'numbered Canvas target auto-open')
const numberedTargetAutoOpened = true
await waitFor(`!document.querySelector('.n-dialog')`, 'numbered projection confirmation departure')
await capture('opml-numbered-target-auto-opened-480.jpg')
const numberedProjection = await readProjection(numberedTargetPath)

const finalHash = await sha256(sourcePath)
const sourceUnchanged = finalHash === initialHash
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const actual = {
  disclosureComplete1280,
  disclosureComplete480,
  firstTargetAutoOpened,
  numberedTargetAutoOpened,
  firstTargetReread: firstProjection.nodeCount === 5 && firstProjection.edgeCount === 4,
  numberedTargetReread: numberedProjection.nodeCount === 5 && numberedProjection.edgeCount === 4,
  firstTargetName: path.win32.basename(firstTargetPath),
  numberedTargetName: path.win32.basename(numberedTargetPath),
  targetNodeCount: firstProjection.nodeCount,
  targetEdgeCount: firstProjection.edgeCount,
  sourceFileNodeObserved: firstProjection.sourceFileNodeObserved,
  titleNoteProjectionObserved: firstProjection.titleNoteProjectionObserved,
  collapsedTopicProjected: firstProjection.collapsedTopicProjected,
  containsHierarchyObserved: firstProjection.containsHierarchyObserved,
  lossFieldsAbsent: firstProjection.lossFieldsAbsent,
  sourceUnchanged,
  sourceFilesUnchangedAfterAudit: sourceUnchanged,
  responsive1280,
  responsive480,
  geometry1280,
  geometry480,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
}
if (!actual.disclosureComplete1280 || !actual.disclosureComplete480 || !actual.firstTargetAutoOpened || !actual.numberedTargetAutoOpened || !actual.firstTargetReread || !actual.numberedTargetReread || actual.firstTargetName !== 'Conversion Outline 画布.canvas' || actual.numberedTargetName !== 'Conversion Outline 画布 1.canvas' || actual.targetNodeCount !== 5 || actual.targetEdgeCount !== 4 || !actual.sourceFileNodeObserved || !actual.titleNoteProjectionObserved || !actual.collapsedTopicProjected || !actual.containsHierarchyObserved || !actual.lossFieldsAbsent || !actual.sourceUnchanged || !actual.responsive1280 || !actual.responsive480 || runtimeErrors.length || blockingErrorSurfaceObserved) throw new Error(`M4C-2 runtime gate failed: ${JSON.stringify(actual)}`)

const evidence = { schemaVersion: 1, stage: 'M4C-2', status: 'passed', sourceCommit, actual, initialHashes: { opml: initialHash }, finalHashes: { opml: finalHash }, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['opml-projection-disclosure-1280.jpg', 'opml-first-target-auto-opened-1280.jpg', 'opml-numbered-projection-disclosure-480.jpg', 'opml-numbered-target-auto-opened-480.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4C-2', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4C-2 OPML Canvas projection audit passed with ${runtimeErrors.length} runtime errors.`)
