import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14340'
const appOrigin = process.env.LONGEDIT_UX34_APP_ORIGIN || 'http://127.0.0.1:14200'
const canvasPath = path.resolve(process.env.LONGEDIT_UX34_CANVAS || '')
const drawioPath = path.resolve(process.env.LONGEDIT_UX34_DRAWIO || '')
const output = path.resolve(process.env.LONGEDIT_UX34_AUDIT_OUTPUT || 'docs/evidence/ux34-drawio-canvas-stability')
const sourceCommit = process.env.LONGEDIT_UX34_SOURCE_COMMIT || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || !canvasPath || !drawioPath) throw new Error('UX-34 requires a source commit and two isolated fixtures')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.startsWith(appOrigin))
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
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  }
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
    runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  }
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) request.reject(new Error(`${message.error.message} (${message.error.code})`))
  else request.resolve(message.result)
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
const waitFor = async (expression, description, attempts = 500) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const navigate = async (filePath, selector, description) => {
  const route = `#/library?path=${encodeURIComponent(filePath)}`
  await evaluate(`location.hash = ${JSON.stringify(route)}`)
  await waitFor(`location.hash === ${JSON.stringify(route)}`, `${description} route`)
  await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, `${description} surface`)
  await waitFor(`document.querySelector('.page-loader') === null || getComputedStyle(document.querySelector('.page-loader')).opacity === '0'`, `${description} loader dismissal`)
  await delay(180)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')

const boundary = await evaluate(`(() => {
  const dispatch = message => {
    const event = new ErrorEvent('error', { message, error: new Error(message), cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }
  const crashScreen = document.querySelector('#crash-screen')
  const undeliveredPrevented = dispatch('ResizeObserver loop completed with undelivered notifications.')
  const undeliveredDisplayed = getComputedStyle(crashScreen).display !== 'none'
  const limitPrevented = dispatch('ResizeObserver loop limit exceeded')
  const limitDisplayed = getComputedStyle(crashScreen).display !== 'none'
  const unrelatedPrevented = dispatch('UX34 unrelated runtime failure')
  const unrelatedDisplayed = getComputedStyle(crashScreen).display !== 'none'
  crashScreen.style.display = 'none'
  const crashInfo = document.querySelector('#crash-info')
  if (crashInfo) crashInfo.textContent = ''
  return {
    undeliveredPrevented,
    undeliveredDisplayed,
    limitPrevented,
    limitDisplayed,
    unrelatedPrevented,
    unrelatedDisplayed,
  }
})()`)
if (!boundary.undeliveredPrevented || boundary.undeliveredDisplayed ||
    !boundary.limitPrevented || boundary.limitDisplayed ||
    boundary.unrelatedPrevented || !boundary.unrelatedDisplayed) {
  throw new Error(`Recoverable layout boundary failed: ${JSON.stringify(boundary)}`)
}

const cycles = []
for (let cycle = 1; cycle <= 6; cycle += 1) {
  await navigate(drawioPath, '.drawio-workspace .diagram-canvas', `Drawio cycle ${cycle}`)
  const drawio = await evaluate(`(() => {
    document.querySelector('.drawio-workspace .cell')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return {
      pages: document.querySelectorAll('.pages-pane > button').length,
      cells: document.querySelectorAll('.drawio-workspace .cell').length,
      errorVisible: document.querySelector('.drawio-workspace .state.error') !== null,
    }
  })()`)
  if (drawio.pages < 1 || drawio.cells < 1 || drawio.errorVisible) throw new Error(`Drawio cycle ${cycle} failed: ${JSON.stringify(drawio)}`)

  await send('Emulation.setDeviceMetricsOverride', { width: cycle % 2 ? 1260 : 1280, height: cycle % 2 ? 800 : 820, deviceScaleFactor: 1, mobile: false })
  await navigate(canvasPath, '.canvas-page .canvas-viewport', `Canvas cycle ${cycle}`)
  const canvas = await evaluate(`(() => {
    const viewport = document.querySelector('.canvas-viewport')
    const node = document.querySelector('.canvas-node')
    if (!viewport || !node) return null
    const viewportRect = viewport.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -120, clientX: viewportRect.left + 120, clientY: viewportRect.top + 120 }))
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: nodeRect.left + 20, clientY: nodeRect.top + 20 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: nodeRect.left + 32, clientY: nodeRect.top + 28 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: nodeRect.left + 32, clientY: nodeRect.top + 28 }))
    return {
      nodes: document.querySelectorAll('.canvas-node').length,
      worldTransform: document.querySelector('.canvas-world')?.style.transform || '',
      crashFallbackVisible: document.querySelector('.crash-fallback') !== null,
    }
  })()`)
  if (!canvas || canvas.nodes < 1 || !canvas.worldTransform.includes('scale(') || canvas.crashFallbackVisible) {
    throw new Error(`Canvas cycle ${cycle} failed: ${JSON.stringify(canvas)}`)
  }
  await delay(220)
  cycles.push({ cycle, drawio, canvas })
}

await navigate(drawioPath, '.drawio-workspace .diagram-canvas', 'final Drawio return')
await delay(300)
const blockingSurface = await evaluate(`(() => {
  const startupCrash = document.querySelector('#crash-screen')
  return document.querySelector('.crash-fallback') !== null ||
    (startupCrash !== null && getComputedStyle(startupCrash).display !== 'none')
})()`)
if (blockingSurface || runtimeErrors.length) throw new Error(`UX-34 runtime remained noisy: ${JSON.stringify({ blockingSurface, runtimeErrors })}`)

const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false })
await fs.writeFile(path.join(output, 'drawio-canvas-route-stability.jpg'), Buffer.from(screenshot.data, 'base64'))
await fs.writeFile(path.join(output, 'stability-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'UX-34',
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 with isolated repository fixtures',
  sourceCommit,
  routeCycles: cycles.length,
  viewportChanges: 6,
  canvasZoomInteractions: 6,
  canvasDragInteractions: 6,
  boundary,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: blockingSurface,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
  cycles,
}, null, 2)}\n`)
socket.close()
console.log('UX-34 Drawio/Canvas desktop stability evidence captured.')
