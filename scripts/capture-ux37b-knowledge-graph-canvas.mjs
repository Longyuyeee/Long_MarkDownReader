import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14380'
const output = path.resolve(process.env.LONGEDIT_UX37B_AUDIT_OUTPUT || 'docs/evidence/ux37b-knowledge-graph-canvas')
const sourceCommit = process.env.LONGEDIT_UX37B_SOURCE_COMMIT || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('UX-37B environment is incomplete')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView CDP target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async name => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, name), Buffer.from(screenshot.data, 'base64'))
}
const mouse = (type, x, y, options = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...options })
const key = async (value, code, windowsVirtualKeyCode, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: value, code, windowsVirtualKeyCode, modifiers })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode, modifiers })
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelectorAll('.library-file-tree .n-tree-node').length >= 6`, 'isolated file tree')
await evaluate(`location.hash = '#/graph'`)
await waitFor(`document.querySelector('canvas[data-layout-mode]') && document.querySelector('.graph-stats')?.textContent?.includes('6')`, 'knowledge graph canvas')
await delay(700)
await evaluate(`document.querySelector('.details-close')?.click()`)
await waitFor(`!document.querySelector('.node-details')`, 'closed node details')
await evaluate(`[...document.querySelectorAll('.graph-controls .control-btn')].find(button => button.title === '适合窗口')?.click()`)
await delay(250)

const optionCounts = await evaluate(`(() => {
  const selects = [...document.querySelectorAll('.graph-options label select')]
  return { layouts: selects[0]?.options.length || 0, themes: selects[1]?.options.length || 0 }
})()`)
await capture('automatic-colorful-network.jpg')

await evaluate(`(() => {
  const selects = [...document.querySelectorAll('.graph-options label select')]
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  setter.call(selects[0], 'radial')
  selects[0].dispatchEvent(new Event('change', { bubbles: true }))
  setter.call(selects[1], 'professional')
  selects[1].dispatchEvent(new Event('change', { bubbles: true }))
})()`)
await waitFor(`document.querySelector('canvas')?.dataset.layoutMode === 'radial'`, 'radial layout')
await delay(500)
await evaluate(`[...document.querySelectorAll('.graph-controls .control-btn')].find(button => button.title === '适合窗口')?.click()`)
await delay(250)
await capture('radial-professional-network.jpg')

const canvasRect = await evaluate(`(() => {
  const rect = document.querySelector('canvas').getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
})()`)
const zoomBefore = await evaluate(`document.querySelector('.graph-stats')?.textContent`)
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: canvasRect.left + canvasRect.width / 2, y: canvasRect.top + canvasRect.height / 2, deltaX: 0, deltaY: -120 })
await delay(150)
const zoomAfter = await evaluate(`document.querySelector('.graph-stats')?.textContent`)

const start = { x: canvasRect.left + 24, y: canvasRect.bottom - 34 }
const end = { x: canvasRect.right - 24, y: canvasRect.top + 24 }
await mouse('mousePressed', start.x, start.y, { modifiers: 8, clickCount: 1 })
await mouse('mouseMoved', end.x, end.y, { modifiers: 8, buttons: 1 })
await mouse('mouseReleased', end.x, end.y, { modifiers: 8, clickCount: 1 })
await waitFor(`Number(document.querySelector('canvas')?.dataset.selectedCount) >= 4`, 'box selection')
const boxSelectedCount = await evaluate(`Number(document.querySelector('canvas').dataset.selectedCount)`)

const canvasHash = () => evaluate(`document.querySelector('canvas').toDataURL()`)
const beforeKeyboard = await canvasHash()
await key('ArrowRight', 'ArrowRight', 39)
await delay(150)
const afterKeyboard = await canvasHash()

const center = { x: canvasRect.left + canvasRect.width / 2, y: canvasRect.top + canvasRect.height / 2 }
const beforeDrag = await canvasHash()
await mouse('mousePressed', center.x, center.y, { clickCount: 1 })
await mouse('mouseMoved', center.x + 54, center.y + 32, { buttons: 1 })
await mouse('mouseReleased', center.x + 54, center.y + 32, { clickCount: 1 })
await delay(180)
const afterDrag = await canvasHash()
const selectedAfterDrag = await evaluate(`Number(document.querySelector('canvas').dataset.selectedCount)`)

const historyButtons = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('.graph-controls .control-btn')]
  const undo = buttons.find(button => button.title === '撤销画布调整')
  const redo = buttons.find(button => button.title === '重做画布调整')
  undo?.click()
  redo?.click()
  return { undo: Boolean(undo), redo: Boolean(redo) }
})()`)
await delay(180)
await capture('multi-selection-moved.jpg')

const evidence = {
  schemaVersion: 1,
  stage: 'UX-37B',
  sourceCommit,
  nodeCount: 6,
  layoutOptionCount: optionCounts.layouts,
  themeOptionCount: optionCounts.themes,
  radialLayoutObserved: true,
  zoomChanged: zoomBefore !== zoomAfter,
  boxSelectedCount,
  groupedDragPreservedSelection: selectedAfterDrag >= 4,
  groupedDragChanged: beforeDrag !== afterDrag,
  keyboardMoveObserved: beforeKeyboard !== afterKeyboard,
  undoControlObserved: historyButtons.undo,
  redoControlObserved: historyButtons.redo,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.n-modal-mask, .error-boundary'))`),
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)

const screenshotFiles = ['automatic-colorful-network.jpg', 'radial-professional-network.jpg', 'multi-selection-moved.jpg']
const screenshots = []
for (const file of screenshotFiles) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'UX-37B',
  status: 'captured-pending-visual-review',
  productSourceCommit: sourceCommit,
  evidenceFile: 'interaction-evidence.json',
  evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'),
  screenshots,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}, null, 2)}\n`)
socket.close()
console.log(`UX-37B interaction capture completed with ${runtimeErrors.length} runtime errors.`)
