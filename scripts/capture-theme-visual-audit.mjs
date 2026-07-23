import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const outputRoot = path.resolve(process.env.LONGEDIT_THEME_AUDIT_OUTPUT || 'docs/evidence/t8-1b')
const requestedScenario = process.env.LONGEDIT_THEME_AUDIT_SCENARIO
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

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
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`))
  else resolve(message.result)
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})

const evaluate = async expression => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}

const waitFor = async (expression, description, attempts = 80) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

const setViewport = async (width, height) => {
  try {
    const { windowId } = await send('Browser.getWindowForTarget', { targetId: target.id })
    await send('Browser.setWindowBounds', {
      windowId,
      bounds: { width, height, windowState: 'normal' },
    })
  } catch {
    // WebView2 versions that do not expose Browser bounds still support device metrics.
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await delay(250)
}

const navigate = async (hash, selector) => {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`)
  await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, selector)
  await delay(400)
}

const capture = async (fileName, width, height) => {
  await setViewport(width, height)
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 90,
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(outputRoot, fileName), Buffer.from(screenshot.data, 'base64'))
}

await fs.mkdir(outputRoot, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')

const scenarios = [
  { id: 'cloud-paper', name: '云白纸张', theme: 'white', style: 'airy', motion: 'reduced' },
  { id: 'forest-green', name: '森林绿柔和', theme: 'green', style: 'soft', motion: 'calm' },
  { id: 'dark-neon', name: '暗夜绿光', theme: 'dark', style: 'neo', motion: 'swift' },
  { id: 'purple-dream', name: '紫梦幻境', theme: 'purple', style: 'glass', motion: 'expressive' },
]
const selectedScenarios = scenarios.filter(scenario => scenario.id === requestedScenario)
if (selectedScenarios.length !== 1) throw new Error('LONGEDIT_THEME_AUDIT_SCENARIO must identify one scenario preset')
const evidence = []

for (const scenario of selectedScenarios) {
  await setViewport(1440, 900)
  await navigate('#/settings', '.settings-view')
  await waitFor(`document.querySelector('.theme-preset-card.active') !== null`, 'settings configuration initialization')
  await waitFor(
    `document.body.dataset.theme === ${JSON.stringify(scenario.theme)}
      && document.body.dataset.style === ${JSON.stringify(scenario.style)}
      && document.body.dataset.motion === ${JSON.stringify(scenario.motion)}`,
    `${scenario.id} semantic body tokens`,
  )
  const activePreset = await evaluate(`document.querySelector('.theme-preset-card.active .preset-name')?.textContent?.trim()`)
  if (activePreset !== scenario.name) throw new Error(`Active preset card mismatch: ${scenario.id} -> ${activePreset}`)
  await evaluate(`(() => {
    const heading = [...document.querySelectorAll('.section-title')]
      .find(item => item.textContent?.includes('外观主题'))
    heading?.scrollIntoView({ block: 'start' })
    return true
  })()`)
  await delay(300)
  const settingsFile = `${scenario.id}-settings-1440x900.jpg`
  await capture(settingsFile, 1440, 900)

  await setViewport(1024, 768)
  await navigate('#/workspace', '.workspace-home')
  const workspaceFile = `${scenario.id}-workspace-1024x768.jpg`
  await capture(workspaceFile, 1024, 768)

  await setViewport(760, 900)
  await navigate('#/graph?mode=mindmap', '.graph-container')
  await waitFor(`document.querySelector('.view-switch button.active')?.textContent?.includes('思维导图') === true`, 'mind-map graph mode')
  const graphFile = `${scenario.id}-mindmap-760x900.jpg`
  await capture(graphFile, 760, 900)

  const state = await evaluate(`({
    theme: document.body.dataset.theme,
    style: document.body.dataset.style,
    motion: document.body.dataset.motion,
    route: location.hash,
    title: document.title
  })`)
  if (state.theme !== scenario.theme || state.style !== scenario.style || state.motion !== scenario.motion) {
    throw new Error(`Preset state drifted after navigation: ${scenario.id} -> ${JSON.stringify(state)}`)
  }
  evidence.push({
    ...scenario,
    files: [settingsFile, workspaceFile, graphFile],
    finalState: state,
  })
}

const manifestPath = path.join(outputRoot, 'audit-manifest.json')
let previousScenarios = []
try {
  previousScenarios = JSON.parse(await fs.readFile(manifestPath, 'utf8')).scenarios || []
} catch {
  // The first isolated scenario creates the manifest.
}
const scenarioIds = new Set(evidence.map(item => item.id))
const mergedScenarios = [...previousScenarios.filter(item => !scenarioIds.has(item.id)), ...evidence]
  .sort((left, right) => scenarios.findIndex(item => item.id === left.id) - scenarios.findIndex(item => item.id === right.id))
await fs.writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  sourceUrl: target.url,
  scenarios: mergedScenarios,
}, null, 2)}\n`)

await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`Theme visual audit captured ${evidence.length * 3} screenshots in ${outputRoot}`)
