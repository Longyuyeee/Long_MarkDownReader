import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9341'
const library = path.resolve(process.env.LONGEDIT_R5G_LIBRARY || '')
const output = path.resolve(process.env.LONGEDIT_R5G_OUTPUT || 'docs/evidence/r5g-desktop-artifact-smoke')
const debugExecutable = path.resolve(process.env.LONGEDIT_R5G_DEBUG_EXECUTABLE || '')
const releaseExecutable = path.resolve(process.env.LONGEDIT_R5G_RELEASE_EXECUTABLE || '')
if (!library || !debugExecutable || !releaseExecutable) throw new Error('R5G library and executable paths are required')

const textFile = path.join(library, 'r5g-notes.txt')
const jsonFile = path.join(library, 'r5g-config.json')
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page')
if (!target?.webSocketDebuggerUrl) throw new Error('R5G Tauri WebView CDP target was not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const waitForFile = async (file, marker, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await fs.readFile(file, 'utf8')).includes(marker)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const navigate = async (hash, selector, description) => {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`)
  await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, description)
  await waitFor(`document.querySelector('.page-loader') === null`, `${description} transition`)
  await delay(150)
  const crash = await evaluate(`document.querySelector('.crash-fallback') !== null`)
  if (crash) throw new Error(`${description} showed the global crash fallback`)
}
const setEditorText = async text => {
  const point = await evaluate(`(() => {
    const editor = document.querySelector('.cm-content')
    if (!editor) return null
    const rect = editor.getBoundingClientRect()
    return { x: rect.left + Math.min(24, rect.width / 2), y: rect.top + Math.min(24, rect.height / 2) }
  })()`)
  if (!point) throw new Error('CodeMirror input surface is missing')
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await send('Input.insertText', { text })
  await waitFor(
    `document.querySelector('.cm-content')?.innerText?.replace(/\\r/g, '') === ${JSON.stringify(text)}`,
    'CodeMirror document replacement',
  )
}
const saveShortcut = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 })
}
const capture = async fileName => {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 88,
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(output, fileName), Buffer.from(screenshot.data, 'base64'))
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
await waitFor(`typeof window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__ === 'function'`, 'route performance export')

const checks = [
  { id: 'current-release-executable-built', status: 'passed' },
  { id: 'current-debug-webview-bootstrap', status: 'passed' },
]

const textRoute = `#/library?path=${encodeURIComponent(textFile)}`
await navigate(textRoute, '.library-embedded-editor .text-workspace', 'embedded TXT editor')
await waitFor(`document.querySelector('.cm-content')?.textContent?.includes('R5G_TEXT_INITIAL') === true`, 'initial TXT content')
const savedText = 'R5G_TEXT_SAVED\nright-side-workspace=true'
await setEditorText(savedText)
await saveShortcut()
await waitForFile(textFile, 'R5G_TEXT_SAVED', 'TXT disk save')
await capture('txt-save-reopen.jpg')
await navigate('#/workspace', '.workspace-home', 'workspace between TXT reopen')
await navigate(textRoute, '.library-embedded-editor .text-workspace', 'reopened embedded TXT editor')
await waitFor(`document.querySelector('.cm-content')?.textContent?.includes('R5G_TEXT_SAVED') === true`, 'reopened TXT content')
checks.push({ id: 'txt-read-edit-save-reopen', status: 'passed' })

const jsonRoute = `#/library?path=${encodeURIComponent(jsonFile)}`
await navigate(jsonRoute, '.library-embedded-editor .json-workspace', 'embedded JSON editor')
await waitFor(`document.querySelector('.cm-content')?.textContent?.includes('R5G_JSON_INITIAL') === true`, 'initial JSON content')
const savedJson = '{\n  "marker": "R5G_JSON_SAVED",\n  "managed": true\n}'
await setEditorText(savedJson)
await waitFor(`document.querySelector('.analysis-pane')?.textContent?.includes('璇硶閿欒') === false`, 'valid JSON analysis')
await saveShortcut()
await waitForFile(jsonFile, 'R5G_JSON_SAVED', 'JSON disk save')
await capture('json-save-reopen.jpg')
await navigate('#/workspace', '.workspace-home', 'workspace between JSON reopen')
await navigate(jsonRoute, '.library-embedded-editor .json-workspace', 'reopened embedded JSON editor')
await waitFor(`document.querySelector('.cm-content')?.textContent?.includes('R5G_JSON_SAVED') === true`, 'reopened JSON content')
checks.push({ id: 'json-read-edit-save-reopen', status: 'passed' })

const routes = [
  ['#/workspace', '.workspace-home', '/workspace'],
  ['#/library', '.library-mode', '/library'],
  ['#/text', '.text-workspace', '/text'],
  ['#/json', '.json-workspace', '/json'],
  ['#/pdf', '.pdf-view', '/pdf'],
  ['#/workbook', '.workbook-view', '/workbook'],
  ['#/diagram', '.diagram-studio', '/diagram'],
  ['#/mindmap', '.mindmap-page', '/mindmap'],
  ['#/graph', '.graph-container', '/graph'],
  ['#/canvas', '.canvas-page', '/canvas'],
  ['#/release-capabilities', '.release-capabilities', '/release-capabilities'],
]
const routeResults = []
for (const [hash, selector, route] of routes) {
  await navigate(hash, selector, `${route} route`)
  routeResults.push({
    route,
    status: 'passed',
    crashFallbackVisible: false,
    routeWrapperMounted: true,
  })
}
checks.push({ id: 'representative-right-side-routes', status: 'passed' })

const performanceEvidence = await evaluate(`window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__()`)
if (!performanceEvidence?.routes?.length || !performanceEvidence?.measures?.length) {
  throw new Error('Desktop route performance export was empty')
}
checks.push({ id: 'desktop-route-performance-export', status: 'passed' })

const debugStats = await fs.stat(debugExecutable)
const releaseStats = await fs.stat(releaseExecutable)
const capturedAt = new Date().toISOString()
await fs.writeFile(path.join(output, 'route-performance-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5G',
  capturedAt,
  evidenceLevel: 'real-tauri-debug-webview2',
  sourceUserContentIncluded: false,
  routes: performanceEvidence.routes,
  measures: performanceEvidence.measures,
}, null, 2)}\n`)
await fs.writeFile(path.join(output, 'route-mount-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5G',
  capturedAt,
  evidenceLevel: 'real-tauri-debug-webview2',
  sourceUserContentIncluded: false,
  routes: routeResults,
}, null, 2)}\n`)
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5G',
  appVersion: '0.7.0',
  capturedAt,
  environment: 'Current Tauri Debug WebView2 via Chrome DevTools Protocol',
  releaseCandidate: false,
  promotionEligible: false,
  signedArtifactRuntimeProven: false,
  sourceUserContentIncluded: false,
  checks,
  artifacts: [
    {
      kind: 'debug-runtime-smoke',
      fileName: path.basename(debugExecutable),
      size: debugStats.size,
      sha256: await sha256(debugExecutable),
      runtimeSmokeExecuted: true,
    },
    {
      kind: 'release-no-bundle',
      fileName: path.basename(releaseExecutable),
      size: releaseStats.size,
      sha256: await sha256(releaseExecutable),
      runtimeSmokeExecuted: false,
    },
  ],
  evidenceFiles: [
    'txt-save-reopen.jpg',
    'json-save-reopen.jpg',
    'route-performance-evidence.json',
    'route-mount-evidence.json',
  ],
}, null, 2)}\n`)

await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`R5G desktop artifact smoke passed ${checks.length} checks across ${routeResults.length} routes`)
