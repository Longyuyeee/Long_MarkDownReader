import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M2A2_AUDIT_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M2A2_LIBRARY)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const hashDirectory = async root => {
  const files = []
  const walk = async dir => { for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); entry.isDirectory() ? await walk(full) : files.push(full) } }
  await walk(root)
  const digest = crypto.createHash('sha256')
  for (const file of files.sort()) { digest.update(path.relative(root, file).replaceAll('\\', '/')); digest.update(await fs.readFile(file)) }
  return digest.digest('hex')
}
const beforeSha256 = await hashDirectory(library)
let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) { const targets = await fetch(`${endpoint}/json`).then(r => r.json()); target = targets.find(item => item.type === 'page' && /127\.0\.0\.1:9000|localhost:9000/.test(item.url)); if (!target) await delay(100) }
if (!target?.webSocketDebuggerUrl) throw new Error('WebView target missing')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let id = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception'); if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text); const request = pending.get(message.id); if (!request) return; pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })) })
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
const wait = async (expression, description) => { for (let attempt = 0; attempt < 600; attempt += 1) { if (await evaluate(expression)) return; await delay(50) } throw new Error(`Timeout: ${description}`) }
const capture = async name => { const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true }); await fs.writeFile(path.join(output, name), Buffer.from(image.data, 'base64')) }
const resize = async (width, height) => { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await delay(250) }
await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await resize(1280, 820)
await wait(`document.querySelector('.library-mode')!==null`, 'library initialization')
const startedAt = Date.now()
await evaluate(`location.hash='#/workspace'`)
await wait(`document.querySelector('[data-testid="m2a2-workspace-primary"]')?.getAttribute('data-primary-state')==='ready'`, 'primary workspace ready')
const primaryReadyMs = Date.now() - startedAt
await wait(`document.querySelector('[data-testid="m2a2-attention-queue"]')?.getAttribute('data-analysis-state')==='ready'`, 'secondary analysis ready')
const analysisReadyMs = Date.now() - startedAt
const workspace = await evaluate(`(() => ({queues:document.querySelectorAll('[data-testid="m2a2-attention-queue"]').length,workspacePulses:document.querySelectorAll('[data-testid="knowledge-network-pulse"]').length,broken:document.querySelectorAll('[data-issue-kind="broken-link"]').length,ambiguous:document.querySelectorAll('[data-issue-kind="ambiguous-link"]').length,duplicates:document.querySelectorAll('[data-issue-kind="duplicate"]').length,annotations:document.querySelectorAll('[data-issue-kind="annotation"]').length,primaryText:document.querySelector('[data-testid="m2a2-workspace-primary"]')?.innerText||'',overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}))()`)
if (workspace.queues !== 1 || workspace.workspacePulses !== 0 || workspace.broken !== 1 || workspace.ambiguous !== 1 || workspace.duplicates !== 1 || workspace.annotations !== 1 || workspace.overflow) throw new Error(`Workspace issue consolidation failed: ${JSON.stringify(workspace)}`)
await capture('workspace-1280.jpg')
await evaluate(`document.querySelector('[data-testid="m2a2-attention-queue"]')?.scrollIntoView({block:'start'})`)
await delay(250)
await capture('attention-queue-1280.jpg')
const responsive = {}
for (const [width, height] of [[760,680],[480,700]]) { await resize(width,height); responsive[width] = await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1&&document.querySelector('[data-testid="m2a2-attention-queue"]')!==null`); if (!responsive[width]) throw new Error(`${width}px workspace overflow`); await capture(`workspace-${width}.jpg`) }
await resize(1280,820)
await evaluate(`location.hash='#/graph?focus=overview'`)
await wait(`document.querySelector('.graph-container')!==null&&!document.querySelector('.graph-loading')`, 'graph ready')
await evaluate(`document.querySelector('.health-entry')?.click()`)
await wait(`document.querySelector('.health-panel [data-testid="knowledge-network-pulse"]')!==null`, 'graph governance pulse')
const graphPulseCount = await evaluate(`document.querySelectorAll('.health-panel [data-testid="knowledge-network-pulse"]').length`)
await capture('graph-governance-1280.jpg')
const afterSha256 = await hashDirectory(library)
const actual = { primaryReadyBeforeAnalysis: primaryReadyMs <= analysisReadyMs, singleAttentionQueue: workspace.queues === 1, brokenLinkCount: workspace.broken, ambiguousLinkCount: workspace.ambiguous, duplicateGroupCount: workspace.duplicates, unreferencedAnnotationCount: workspace.annotations, workspacePulseCount: workspace.workspacePulses, graphPulseCount, runtimeErrors: runtimeErrors.length, sourceChanges: beforeSha256 === afterSha256 ? 0 : 1, primaryReadyMs, analysisReadyMs, beforeSha256, afterSha256, responsive760: responsive[760], responsive480: responsive[480] }
await fs.writeFile(path.join(output, 'desktop-evidence.json'), `${JSON.stringify({ schemaVersion:1, stage:'M2A2', expectedVsPrevious:{ previousBlockingRequests:5, currentPrimaryRequests:2, currentBackgroundAnalyses:2, expectedIssueSurface:'single actionable queue' }, actual, evidenceFiles:['workspace-1280.jpg','attention-queue-1280.jpg','workspace-760.jpg','workspace-480.jpg','graph-governance-1280.jpg'], sourceUserContentIncluded:false, releaseCandidate:false }, null, 2)}\n`)
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)
socket.close()
console.log('M2A2 real Tauri workspace governance audit passed')
