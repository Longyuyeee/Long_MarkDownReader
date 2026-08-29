import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4C4_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4C4_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4C4_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4C-4 audit environment is incomplete')

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
const waitFor = async (expression, description, attempts = 900) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,1800)})`)
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
const clickDialogButton = async label => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('.n-dialog__action button')].find(x => x.textContent?.includes(${JSON.stringify(label)})); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click dialog button ${label}`)
}
const openGraph = async centerId => {
  await evaluate(`location.hash=${JSON.stringify(`#/graph?mode=network&root=${encodeURIComponent(centerId)}`)}`)
  await waitFor(`document.querySelector('[data-testid="graph-selected-node"]') && document.querySelector('[data-testid="m4c4-create-project-note"]')`, 'selected graph center and project-note action')
  await evaluate(`(() => { const e = document.querySelector('[data-testid="graph-selected-node"] .details-path'); if (e) { e.textContent = '临时审计资料库（路径已脱敏）'; e.removeAttribute('title') } })()`)
}
const scrollProjectActionIntoView = async () => {
  await evaluate(`document.querySelector('[data-testid="m4c4-create-project-note"]')?.scrollIntoView({ block: 'center' })`)
  await delay(200)
}
const dialogState = async () => evaluate(`(() => { const d = document.querySelector('.n-dialog'); const c = document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]'); if (!d || !c) return null; const r = d.getBoundingClientRect(); return { text: c.textContent || '', withinViewport: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, scrollReachable: c.scrollHeight >= c.clientHeight && Boolean(document.querySelector('.n-dialog__action button')) } })()`)
const routeHas = async file => waitFor(`decodeURIComponent(location.hash.replace(/\\+/g, ' ')).includes(${JSON.stringify(file)}) && Boolean(document.querySelector('#vditor-lib .vditor-content, .editor-main'))`, `opened ${file}`)
const relatedCount = markdown => Math.max(0, (markdown.match(/^- \[\[/gm) || []).length - 1)
const omittedCount = markdown => Number(markdown.match(/另有 (\d+) 个关联对象未写入/)?.[1] || 0)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

await fs.writeFile(path.join(library, 'Collision', 'Graph Collision 项目.md'), '# Existing collision sentinel\n', 'utf8')
const initialFiles = []
for (const directory of ['First', 'Collision']) {
  for (const name of await fs.readdir(path.join(library, directory))) if (name.endsWith('.md')) initialFiles.push(path.join(library, directory, name))
}
const initialHashes = Object.fromEntries(await Promise.all(initialFiles.map(async file => [path.relative(library, file).replaceAll('\\', '/'), await sha256(file)])))
const graph = await invoke('build_link_graph', { libraryRoot: library })
const firstNode = graph.nodes?.find(node => node.title === 'Graph First')
const collisionNode = graph.nodes?.find(node => node.title === 'Graph Collision')
if (!firstNode?.id || !collisionNode?.id) throw new Error('Graph project-note centers were not found')

const firstTarget = path.join(library, 'First', 'Graph First 项目.md')
await openGraph(firstNode.id)
await clickButton('生成项目笔记')
await waitFor(`Boolean(document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]'))`, 'wide project-note disclosure')
const wideDialog = await dialogState()
const disclosureComplete1280 = Boolean(wideDialog?.withinViewport && wideDialog.text.includes('First/Graph First.md') && wideDialog.text.includes('当前中心周围 3 层') && wideDialog.text.includes('First/Graph First 项目.md') && wideDialog.text.includes('绝不覆盖') && wideDialog.text.includes('最多写入 100 个') && wideDialog.text.includes('不会与图谱或中心来源自动同步') && wideDialog.text.includes('中心来源和其他关联文件保持不变'))
await capture('graph-project-disclosure-1280.jpg')
await clickDialogButton('取消')
await waitFor(`!document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]')`, 'wide disclosure close')
const cancelPreventedWrite = !await exists(firstTarget)
await clickButton('生成项目笔记')
await waitFor(`Boolean(document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]'))`, 'wide project-note disclosure reopen')
await clickDialogButton('生成并打开')
await routeHas('Graph First 项目.md')
const firstTargetAutoOpened = true
await capture('graph-project-first-target-1280.jpg')
const firstMarkdown = await fs.readFile(firstTarget, 'utf8')
await waitFor(`!document.querySelector('.n-message')`, 'first target success message close', 120)

await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await openGraph(collisionNode.id)
await scrollProjectActionIntoView()
await clickButton('生成项目笔记')
await waitFor(`Boolean(document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]'))`, 'narrow project-note disclosure')
const narrowDialog = await dialogState()
const disclosureComplete480 = Boolean(narrowDialog?.withinViewport && narrowDialog.scrollReachable && narrowDialog.text.includes('Collision/Graph Collision.md') && narrowDialog.text.includes('Collision/Graph Collision 项目.md') && narrowDialog.text.includes('带新序号') && narrowDialog.text.includes('超出数量会在笔记中明确记录'))
await evaluate(`(() => { const e = document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]'); if (e) e.scrollTop = e.scrollHeight })()`)
await delay(200)
await capture('graph-project-disclosure-480.jpg')
await clickDialogButton('生成并打开')
await routeHas('Graph Collision 项目 1.md')
await waitFor(`!document.querySelector('[data-testid="m4c4-graph-project-note-disclosure"]')`, 'narrow disclosure close after create', 120)
const numberedTargetAutoOpened = true
await capture('graph-project-numbered-target-480.jpg')
const numberedTarget = path.join(library, 'Collision', 'Graph Collision 项目 1.md')
const numberedMarkdown = await fs.readFile(numberedTarget, 'utf8')

const finalHashes = Object.fromEntries(await Promise.all(initialFiles.map(async file => [path.relative(library, file).replaceAll('\\', '/'), await sha256(file)])))
const sortedAndTruncated = firstMarkdown.includes('[[First/First Related 000.md|First Related 000]]') && firstMarkdown.includes('[[First/First Related 099.md|First Related 099]]') && !firstMarkdown.includes('First Related 100') && !firstMarkdown.includes('First Related 101') && numberedMarkdown.includes('[[Collision/Collision Related 000.md|Collision Related 000]]') && numberedMarkdown.includes('[[Collision/Collision Related 099.md|Collision Related 099]]') && !numberedMarkdown.includes('Collision Related 100') && !numberedMarkdown.includes('Collision Related 101')
const actual = {
  disclosureComplete1280,
  disclosureComplete480,
  cancelPreventedWrite,
  firstTargetAutoOpened,
  numberedTargetAutoOpened,
  firstTargetName: path.basename(firstTarget),
  numberedTargetName: path.basename(numberedTarget),
  firstTargetReread: await exists(firstTarget),
  numberedTargetReread: await exists(numberedTarget),
  firstRelatedCount: relatedCount(firstMarkdown),
  numberedRelatedCount: relatedCount(numberedMarkdown),
  firstOmittedCount: omittedCount(firstMarkdown),
  numberedOmittedCount: omittedCount(numberedMarkdown),
  sortedAndTruncated,
  traceableMetadata: [firstMarkdown, numberedMarkdown].every(markdown => markdown.includes('longedit-generated: graph-project') && markdown.includes('longedit-center:') && markdown.includes('longedit-depth: 3')),
  fixedTemplateObserved: [firstMarkdown, numberedMarkdown].every(markdown => markdown.includes('## 目标') && markdown.includes('## 关联资料') && markdown.includes('## 下一步') && markdown.includes('- [ ] 明确项目目标与完成标准')),
  centerBodyNotCopied: !firstMarkdown.includes('CENTER BODY MUST NOT COPY FIRST') && !numberedMarkdown.includes('CENTER BODY MUST NOT COPY COLLISION'),
  sourcesUnchanged: JSON.stringify(initialHashes) === JSON.stringify(finalHashes),
  responsive1280: Boolean(wideDialog?.withinViewport),
  responsive480: Boolean(narrowDialog?.withinViewport),
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`),
}
if (!actual.disclosureComplete1280 || !actual.disclosureComplete480 || !actual.cancelPreventedWrite || !actual.firstTargetAutoOpened || !actual.numberedTargetAutoOpened || actual.firstTargetName !== 'Graph First 项目.md' || actual.numberedTargetName !== 'Graph Collision 项目 1.md' || !actual.firstTargetReread || !actual.numberedTargetReread || actual.firstRelatedCount !== 100 || actual.numberedRelatedCount !== 100 || actual.firstOmittedCount !== 2 || actual.numberedOmittedCount !== 2 || !actual.sortedAndTruncated || !actual.traceableMetadata || !actual.fixedTemplateObserved || !actual.centerBodyNotCopied || !actual.sourcesUnchanged || !actual.responsive1280 || !actual.responsive480 || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) throw new Error(`M4C-4 runtime gate failed: ${JSON.stringify(actual)}`)

const evidence = { schemaVersion: 1, stage: 'M4C-4', status: 'passed', sourceCommit, actual, sourceFileCount: initialFiles.length, initialHashes, finalHashes, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['graph-project-disclosure-1280.jpg', 'graph-project-first-target-1280.jpg', 'graph-project-disclosure-480.jpg', 'graph-project-numbered-target-480.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4C-4', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4C-4 graph project-note disclosure audit passed with ${runtimeErrors.length} runtime errors across ${initialFiles.length} protected source files.`)
