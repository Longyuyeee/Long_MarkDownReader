import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14370'
const appOrigin = process.env.LONGEDIT_UX37A_APP_ORIGIN || 'http://127.0.0.1:14200'
const output = path.resolve(process.env.LONGEDIT_UX37A_AUDIT_OUTPUT || 'docs/evidence/ux37a-opml-canvas')
const sourceCommit = process.env.LONGEDIT_UX37A_SOURCE_COMMIT || ''
const libraryRoot = process.env.LONGEDIT_UX37A_LIBRARY || ''
const fixturePath = process.env.LONGEDIT_UX37A_FIXTURE || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !libraryRoot || !fixturePath) throw new Error('UX-37A environment is incomplete')

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
const center = async (selector, index = 0) => evaluate(`(() => {
  const node = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
  if (!node) return null
  const rect = node.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
})()`)
const click = async (point, modifiers = 0, clickCount = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', modifiers, clickCount })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', modifiers, clickCount })
}
const key = async (value, code, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: value, code, windowsVirtualKeyCode: value === 'ArrowRight' ? 39 : 0, modifiers })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, modifiers })
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelectorAll('.library-file-tree .n-tree-node').length > 0`, 'isolated file tree')
await evaluate(`location.hash = '#/mindmap?path=' + encodeURIComponent(${JSON.stringify(fixturePath)})`)
await waitFor(`document.querySelector('.map-panel') && document.querySelectorAll('.map-node').length >= 3`, 'OPML canvas')
await delay(500)

const signatureBefore = await evaluate(`window.__TAURI_INTERNALS__.invoke('read_opml_file', { libraryRoot: ${JSON.stringify(libraryRoot)}, path: ${JSON.stringify(fixturePath)} }).then(value => value.signature)`)
const layouts = await evaluate(`[...document.querySelectorAll('.tool-select select')][0] ? [...document.querySelectorAll('.tool-select select')][0].options.length : 0`)
const themes = await evaluate(`[...document.querySelectorAll('.tool-select select')][1] ? [...document.querySelectorAll('.tool-select select')][1].options.length : 0`)
await capture('tree-colorful-canvas.jpg')

await evaluate(`(() => {
  const select = [...document.querySelectorAll('.tool-select select')][0]
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  setter.call(select, 'radial')
  select.dispatchEvent(new Event('change', { bubbles: true }))
})()`)
await delay(350)
await capture('radial-layout.jpg')

const zoomBefore = await evaluate(`document.querySelector('.zoom-readout')?.textContent`)
const panelPoint = await center('.map-panel')
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: panelPoint.x, y: panelPoint.y, deltaX: 0, deltaY: -120 })
await delay(150)
const zoomAfter = await evaluate(`document.querySelector('.zoom-readout')?.textContent`)

const first = await center('.map-node', 0)
const second = await center('.map-node', 1)
await click(first)
await click(second, 2)
const selectedCount = await evaluate(`document.querySelectorAll('.map-node.selected').length`)
const beforeDrag = await evaluate(`[...document.querySelectorAll('.map-node.selected')].map(node => ({ left: node.style.left, top: node.style.top }))`)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: second.x, y: second.y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: second.x + 70, y: second.y + 45, button: 'left', buttons: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: second.x + 70, y: second.y + 45, button: 'left', clickCount: 1 })
await delay(180)
const afterDrag = await evaluate(`[...document.querySelectorAll('.map-node.selected')].map(node => ({ left: node.style.left, top: node.style.top }))`)
await key('ArrowRight', 'ArrowRight')
const afterKeyboard = await evaluate(`[...document.querySelectorAll('.map-node.selected')].map(node => node.style.left)`)
await evaluate(`[...document.querySelectorAll('.header-actions button')].find(button => button.title === '撤销')?.click()`)
await evaluate(`[...document.querySelectorAll('.header-actions button')].find(button => button.title === '重做')?.click()`)
await evaluate(`[...document.querySelectorAll('.mindmap-toolbar button')].find(button => button.title === '适合窗口')?.click()`)
await delay(200)
await capture('multi-select-dragged.jpg')

const renamePoint = await center('.map-node', 0)
await click(renamePoint, 0, 2)
await waitFor(`document.querySelector('.map-title-editor')`, 'direct node rename editor')
const directRenameVisible = await evaluate(`Boolean(document.querySelector('.map-title-editor'))`)
await key('Enter', 'Enter')

await delay(1800)
const signatureAfter = await evaluate(`window.__TAURI_INTERNALS__.invoke('read_opml_file', { libraryRoot: ${JSON.stringify(libraryRoot)}, path: ${JSON.stringify(fixturePath)} }).then(value => value.signature)`)
const dirtyVisible = await evaluate(`document.querySelector('.statusbar')?.textContent?.includes('有未保存更改') === true`)
const evidence = {
  schemaVersion: 1,
  stage: 'UX-37A',
  sourceCommit,
  layoutOptionCount: layouts,
  themeOptionCount: themes,
  zoomChanged: zoomBefore !== zoomAfter,
  selectedCount,
  multiNodeDragChanged: JSON.stringify(beforeDrag) !== JSON.stringify(afterDrag),
  keyboardMoveObserved: Array.isArray(afterKeyboard) && JSON.stringify(afterKeyboard) !== JSON.stringify(afterDrag.map(position => position.left)),
  directRenameVisible,
  dirtyDraftVisible: dirtyVisible,
  sourceSignatureUnchangedWithoutSave: signatureBefore === signatureAfter,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.n-modal-mask, .error-boundary'))`),
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)

const screenshotFiles = ['tree-colorful-canvas.jpg', 'radial-layout.jpg', 'multi-select-dragged.jpg']
const screenshots = []
for (const file of screenshotFiles) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'UX-37A',
  status: 'captured-pending-visual-review',
  productSourceCommit: sourceCommit,
  evidenceFile: 'interaction-evidence.json',
  evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'),
  screenshots,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}, null, 2)}\n`)
socket.close()
console.log(`UX-37A interaction capture completed with ${runtimeErrors.length} runtime errors.`)
