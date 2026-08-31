import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14382'
const output = path.resolve(process.env.LONGEDIT_M8_AUDIT_OUTPUT || 'docs/evidence/post-v119-m8-2-graph-usability')
const sourceCommit = process.env.LONGEDIT_M8_SOURCE_COMMIT || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M8-2 environment is incomplete')
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
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'unknown exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'unknown log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 400) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) }
  throw new Error(`Timed out waiting for ${description}`)
}
const mouse = (type, x, y, options = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...options })

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.25, mobile: false })
await waitFor(`document.querySelectorAll('.library-file-tree .n-tree-node').length >= 1`, 'virtualized library tree')
await evaluate(`location.hash = '#/graph'`)
await waitFor(`document.querySelector('[data-testid="graph-canvas"]') && document.querySelector('.graph-stats')?.textContent?.includes('540')`, '540-node graph')
await waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled === 'true'`, 'settled 540-node layout', 600)
await evaluate(`[...document.querySelectorAll('.graph-controls .control-btn')].find(button => button.title === '适合窗口')?.click()`)
await delay(500)

const initial = await evaluate(`(() => {
  const canvas = document.querySelector('[data-testid="graph-canvas"]')
  const rect = canvas.getBoundingClientRect()
  const legend = document.querySelector('[data-testid="graph-semantic-legend"]')
  return {
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    semanticLevel: canvas.dataset.semanticZoomLevel,
    communitySummaryCount: Number(canvas.dataset.communitySummaryCount),
    communityOverviewVisible: Boolean(document.querySelector('[data-testid="graph-community-overview"]')),
    backingWidth: canvas.width,
    backingHeight: canvas.height,
    expectedBackingWidth: Math.round(canvas.clientWidth * devicePixelRatio),
    expectedBackingHeight: Math.round(canvas.clientHeight * devicePixelRatio),
    legendCollapsed: legend?.classList.contains('collapsed') || false,
    helpText: legend?.textContent || '',
    cameraPose: canvas.dataset.cameraPose || ''
  }
})()`)

await evaluate(`(() => {
  const canvas = document.querySelector('[data-testid="graph-canvas"]')
  window.__m8CanvasResizeCount = 0
  window.__m8CanvasObserver = new MutationObserver(records => { window.__m8CanvasResizeCount += records.length })
  window.__m8CanvasObserver.observe(canvas, { attributes: true, attributeFilter: ['width', 'height', 'style'] })
})()`)
const center = { x: initial.rect.left + initial.rect.width / 2, y: initial.rect.top + initial.rect.height / 2 }
for (let index = 0; index < 6; index += 1) {
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: center.x, y: center.y, deltaX: 0, deltaY: index % 2 ? 90 : -90 })
  await delay(70)
}
await delay(400)
const backingMutationCount = await evaluate(`window.__m8CanvasObserver.disconnect(), window.__m8CanvasResizeCount`)

const cameraBeforePan = await evaluate(`document.querySelector('[data-testid="graph-canvas"]').dataset.cameraPose`)
await mouse('mousePressed', center.x, center.y, { button: 'middle', buttons: 4, clickCount: 1 })
await mouse('mouseMoved', center.x + 96, center.y + 58, { button: 'middle', buttons: 4 })
await mouse('mouseReleased', center.x + 96, center.y + 58, { button: 'middle', buttons: 0, clickCount: 1 })
await delay(200)
const cameraAfterPan = await evaluate(`document.querySelector('[data-testid="graph-canvas"]').dataset.cameraPose`)

let nodePoint = null
for (let row = 1; row < 12 && !nodePoint; row += 1) {
  for (let column = 1; column < 20 && !nodePoint; column += 1) {
    const x = initial.rect.left + initial.rect.width * column / 20
    const y = initial.rect.top + initial.rect.height * row / 12
    await mouse('mouseMoved', x, y, { button: 'none', buttons: 0 })
    await delay(18)
    if (await evaluate(`Boolean(document.querySelector('.node-tooltip'))`)) nodePoint = { x, y }
  }
}
if (!nodePoint) throw new Error('Unable to find a rendered node for click semantics')
const hashBeforeClick = await evaluate(`location.hash`)
await mouse('mousePressed', nodePoint.x, nodePoint.y, { button: 'left', buttons: 1, clickCount: 1 })
await mouse('mouseReleased', nodePoint.x, nodePoint.y, { button: 'left', buttons: 0, clickCount: 1 })
await delay(250)
const clickResult = await evaluate(`({ hash: location.hash, selectedCount: Number(document.querySelector('[data-testid="graph-canvas"]')?.dataset.selectedCount || 0), detailsVisible: Boolean(document.querySelector('[data-testid="graph-selected-node"]')) })`)

await evaluate(`document.querySelector('.graph-filter-control').open = true`)
await delay(100)
const overlay = await evaluate(`(() => {
  const legend = document.querySelector('[data-testid="graph-semantic-legend"]')
  const panel = document.querySelector('.graph-filter-control .filter-panel')
  return { legendVisibility: getComputedStyle(legend).visibility, filterVisible: Boolean(panel && getComputedStyle(panel).display !== 'none') }
})()`)
await evaluate(`document.querySelector('.graph-filter-control').open = false`)

const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
await fs.writeFile(path.join(output, 'large-orphan-graph.png'), Buffer.from(screenshot.data, 'base64'))
const evidence = {
  schemaVersion: 1,
  stage: 'M8-2',
  sourceCommit,
  nodeCount: 540,
  semanticLevel: initial.semanticLevel,
  communitySummaryCount: initial.communitySummaryCount,
  communityOverviewVisible: initial.communityOverviewVisible,
  backingStoreMatchesViewport: initial.backingWidth === initial.expectedBackingWidth && initial.backingHeight === initial.expectedBackingHeight,
  backingMutationCount,
  panChangedCamera: cameraBeforePan !== cameraAfterPan,
  singleClickStayedInGraph: clickResult.hash === hashBeforeClick,
  singleClickSelectedNode: clickResult.selectedCount === 1,
  singleClickDetailsVisible: clickResult.detailsVisible,
  legendCollapsed: initial.legendCollapsed,
  operationHelpVisible: initial.helpText.includes('拖动') && initial.helpText.includes('双击打开'),
  filterPanelVisible: overlay.filterVisible,
  legendHiddenWhileFilterOpen: overlay.legendVisibility === 'hidden',
  runtimeErrors,
  sourceUserContentIncluded: false,
  releaseCandidate: false
}
await fs.writeFile(path.join(output, 'desktop-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
if (initial.semanticLevel !== 'far' || initial.communitySummaryCount !== 0 || initial.communityOverviewVisible) throw new Error('Pathological singleton overview was not suppressed')
if (!evidence.backingStoreMatchesViewport || backingMutationCount !== 0) throw new Error('Canvas backing store was unstable during zoom')
if (!evidence.panChangedCamera || !evidence.singleClickStayedInGraph || !evidence.singleClickSelectedNode) throw new Error('Pan or single-click interaction contract failed')
if (!evidence.legendCollapsed || !evidence.operationHelpVisible || !evidence.legendHiddenWhileFilterOpen) throw new Error('Legend/help/filter overlay contract failed')
if (runtimeErrors.length) throw new Error(`Runtime errors observed: ${runtimeErrors.join(' | ')}`)
console.log(JSON.stringify(evidence, null, 2))
