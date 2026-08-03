import fs from 'node:fs/promises'
import path from 'node:path'
import {
  UI4B_EDITOR_SURFACES,
  UI4_CORE_SCENARIOS,
  UI4_DISPLAY_SCALES,
  UI4_PHYSICAL_VIEWPORT,
  ui4bManagedFileHash,
  ui4LogicalViewport,
} from './ui4b-editor-visual-matrix.mjs'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const outputRoot = path.resolve(process.env.LONGEDIT_UI4B_AUDIT_OUTPUT || 'docs/evidence/ui4b-editors')
const requestedScenario = process.env.LONGEDIT_UI4B_AUDIT_SCENARIO
const sourceCommit = process.env.LONGEDIT_UI4B_SOURCE_COMMIT || ''
const sampleMap = JSON.parse(process.env.LONGEDIT_UI4B_SAMPLE_MAP || '{}')
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const scenario = UI4_CORE_SCENARIOS.find(item => item.id === requestedScenario)
if (!scenario) throw new Error('LONGEDIT_UI4B_AUDIT_SCENARIO must identify one core preset')
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('LONGEDIT_UI4B_SOURCE_COMMIT must be a full Git revision')
for (const surface of UI4B_EDITOR_SURFACES) {
  if (!sampleMap[surface.sampleKey]) throw new Error(`Missing UI-4B sample path: ${surface.sampleKey}`)
}

const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.includes('127.0.0.1:9000'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView CDP target was not found')

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

const waitFor = async (expression, description, attempts = 240) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

const setViewport = async scale => {
  const logical = ui4LogicalViewport(scale)
  try {
    const { windowId } = await send('Browser.getWindowForTarget', { targetId: target.id })
    await send('Browser.setWindowBounds', { windowId, bounds: { ...UI4_PHYSICAL_VIEWPORT, windowState: 'normal' } })
  } catch {
    // Device metrics remain available on WebView2 builds without window-bound control.
  }
  await send('Emulation.setDeviceMetricsOverride', {
    ...logical,
    deviceScaleFactor: scale.factor,
    mobile: false,
    screenWidth: UI4_PHYSICAL_VIEWPORT.width,
    screenHeight: UI4_PHYSICAL_VIEWPORT.height,
  })
  await delay(300)
  return logical
}

const navigate = async surface => {
  const filePath = sampleMap[surface.sampleKey]
  const hash = ui4bManagedFileHash(filePath)
  await evaluate(`location.hash = ${JSON.stringify(hash)}`)
  await waitFor(`document.querySelector('.page-loader') === null`, 'route loader dismissal')
  await waitFor(`document.querySelector(${JSON.stringify(surface.selector)}) !== null`, surface.selector)
  await waitFor(`document.querySelector(${JSON.stringify(surface.readySelector)}) !== null`, surface.readySelector)
  await waitFor(`!document.querySelector(${JSON.stringify(`${surface.selector} .error, ${surface.selector} [role="alert"]`)})`, `${surface.id} error-free state`)
  await delay(surface.id === 'pdf' || surface.id === 'diagram' ? 900 : 500)
  return hash
}

const inspectGeometry = async (surface, sampleName) => evaluate(`(() => {
  const root = document.querySelector(${JSON.stringify(surface.selector)})
  const rect = root?.getBoundingClientRect()
  const firstVisible = selector => [...(root?.querySelectorAll(selector) || [])].find(node => {
    const candidate = node.getBoundingClientRect()
    return candidate.width > 0 && candidate.height > 0
  })
  const toolbar = firstVisible('header, [role="toolbar"], .pdf-toolbar, .workbook-toolbar, .studio-toolbar')
  const toolbarRect = toolbar?.getBoundingClientRect()
  const status = firstVisible('footer, .status-bar, .statusbar, .canvas-statusbar, .docx-status')
  const statusRect = status?.getBoundingClientRect()
  const visible = rect && rect.width > 0 && rect.height > 0
  const withinViewport = rect && rect.left >= -2 && rect.top >= -2 && rect.right <= window.innerWidth + 2 && rect.bottom <= window.innerHeight + 2
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    root: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    toolbar: toolbarRect ? { x: toolbarRect.x, y: toolbarRect.y, width: toolbarRect.width, height: toolbarRect.height } : null,
    rootVisible: Boolean(visible),
    rootWithinViewport: Boolean(withinViewport),
    pageOverflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    toolbarClipped: Boolean(rect && toolbarRect && (toolbarRect.left < rect.left - 2 || toolbarRect.right > rect.right + 2 || toolbarRect.top < rect.top - 2)),
    toolbarOverflow: Boolean(toolbar && toolbar.scrollWidth > toolbar.clientWidth + 2),
    statusClipped: Boolean(rect && statusRect && statusRect.bottom > rect.bottom + 2),
    sampleIdentityVisible: Boolean(root?.textContent?.includes(${JSON.stringify(sampleName)})),
    title: document.title,
    route: location.hash,
    theme: document.body.dataset.theme,
    style: document.body.dataset.style,
    motion: document.body.dataset.motion,
  }
})()`)

const capture = async fileName => {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(outputRoot, fileName), Buffer.from(screenshot.data, 'base64'))
}

await fs.mkdir(outputRoot, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')

const entries = []
for (const scale of UI4_DISPLAY_SCALES) {
  const logicalViewport = await setViewport(scale)
  for (const surface of UI4B_EDITOR_SURFACES) {
    const expectedRoute = await navigate(surface)
    await waitFor(
      `document.body.dataset.theme === ${JSON.stringify(scenario.theme)}
        && document.body.dataset.style === ${JSON.stringify(scenario.style)}
        && document.body.dataset.motion === ${JSON.stringify(scenario.motion)}`,
      `${scenario.id} semantic body tokens`,
    )
    const sampleFile = path.basename(sampleMap[surface.sampleKey])
    const sampleName = sampleFile.replace(/\.[^.]+$/, '')
    const geometry = await inspectGeometry(surface, sampleName)
    if (!geometry.rootVisible || !geometry.rootWithinViewport || !geometry.sampleIdentityVisible || geometry.pageOverflowX || geometry.toolbarClipped || geometry.toolbarOverflow || geometry.statusClipped) {
      throw new Error(`Geometry gate failed for ${scenario.id}/${surface.id}/${scale.percent}: ${JSON.stringify(geometry)}`)
    }
    if (geometry.route !== expectedRoute && geometry.route !== '#/library') throw new Error(`Managed file route drift for ${surface.id}: ${geometry.route}`)
    const file = `${scenario.id}-${surface.id}-${scale.id}.jpg`
    await capture(file)
    entries.push({
      scenarioId: scenario.id,
      surfaceId: surface.id,
      sampleFile,
      requestedRoute: expectedRoute,
      scalePercent: scale.percent,
      physicalViewport: UI4_PHYSICAL_VIEWPORT,
      logicalViewport,
      file,
      geometry,
    })
  }
}

const manifestPath = path.join(outputRoot, 'audit-manifest.json')
let previousEntries = []
try {
  const previous = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  if (previous.sourceCommit === sourceCommit) previousEntries = previous.entries || []
} catch {
  // The first core preset creates the manifest.
}
const retained = previousEntries.filter(entry => entry.scenarioId !== scenario.id)
const mergedEntries = [...retained, ...entries].sort((left, right) => {
  const scenarioOrder = UI4_CORE_SCENARIOS.findIndex(item => item.id === left.scenarioId) - UI4_CORE_SCENARIOS.findIndex(item => item.id === right.scenarioId)
  if (scenarioOrder) return scenarioOrder
  const scaleOrder = UI4_DISPLAY_SCALES.findIndex(item => item.percent === left.scalePercent) - UI4_DISPLAY_SCALES.findIndex(item => item.percent === right.scalePercent)
  if (scaleOrder) return scaleOrder
  return UI4B_EDITOR_SURFACES.findIndex(item => item.id === left.surfaceId) - UI4B_EDITOR_SURFACES.findIndex(item => item.id === right.surfaceId)
})

await fs.writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  navigation: 'managed-file-route',
  sourceCommit,
  physicalViewport: UI4_PHYSICAL_VIEWPORT,
  scenarios: UI4_CORE_SCENARIOS.map(({ id, name, theme, style, motion }) => ({ id, name, theme, style, motion })),
  scales: UI4_DISPLAY_SCALES.map(({ id, percent, factor }) => ({ id, percent, factor })),
  surfaces: UI4B_EDITOR_SURFACES.map(({ id, name, sampleKey }) => ({ id, name, sampleKey })),
  entries: mergedEntries,
}, null, 2)}\n`)

await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`UI-4B captured ${entries.length} editor screenshots for ${scenario.id}`)
