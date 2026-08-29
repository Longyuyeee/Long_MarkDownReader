import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9340'
const output = path.resolve(process.env.LONGEDIT_R5F_OUTPUT || 'docs/evidence/r5f-safe-tauri-runtime')
const packageJson = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'))
const policy = JSON.parse(await fs.readFile(path.resolve('shared/r5f-safe-tauri-runtime-policy.json'), 'utf8'))
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url?.includes('127.0.0.1:4175'))
  || targets.find(item => item.type === 'page')
if (!target?.webSocketDebuggerUrl) throw new Error('R5F browser CDP target was not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
const runtimeEvents = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!message.id && ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(message.method)) {
    runtimeEvents.push(message)
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'browser preview bootstrap')

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
if (routes.map(([, , route]) => route).join('|') !== policy.representativeRoutes.join('|')) {
  throw new Error('R5F capture route list drifted from policy')
}

const routeResults = []
for (const [hash, selector, route] of routes) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`)
  await delay(2000)
  const state = await evaluate(`({
    appMounted: document.querySelector('#app')?.children.length > 0,
    routeWrapperMounted: document.querySelector(${JSON.stringify(selector)}) !== null,
    crashFallbackVisible: document.querySelector('.crash-fallback') !== null,
    crashDetails: document.querySelector('.crash-fallback pre')?.innerText || '',
    bodyText: document.body?.innerText?.slice(0, 500) || '',
    hash: location.hash,
  })`)
  if (!state.appMounted || !state.routeWrapperMounted || state.crashFallbackVisible) {
    throw new Error(`${route} failed browser preview route mount: ${JSON.stringify({ state, runtimeEvents: runtimeEvents.slice(-10) })}`)
  }
  routeResults.push({
    route,
    status: 'passed',
    appMounted: state.appMounted,
    routeWrapperMounted: state.routeWrapperMounted,
    crashFallbackVisible: state.crashFallbackVisible,
  })
}

const capturedAt = new Date().toISOString()
const baseUrl = await evaluate('location.origin + location.pathname')
await fs.writeFile(path.join(output, 'route-mount-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5F',
  appVersion: packageJson.version,
  capturedAt,
  baseUrl,
  evidenceLevel: 'browser-preview-route-mount-smoke',
  sourceUserContentIncluded: false,
  desktopFileIoProven: false,
  routes: routeResults,
}, null, 2)}\n`)
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5F',
  appVersion: packageJson.version,
  capturedAt,
  baseUrl,
  evidenceLevel: 'browser-preview-route-mount-smoke',
  routeCount: routeResults.length,
  passedRouteCount: routeResults.length,
  failedRouteCount: 0,
  sourceUserContentIncluded: false,
  desktopFileIoProven: false,
  releaseCandidate: false,
  promotionEligible: false,
  summary: 'All representative right-side workspace routes mounted without the global crash fallback in the current production browser preview.',
}, null, 2)}\n`)

socket.close()
console.log(`R5F browser preview smoke passed ${routeResults.length} routes for v${packageJson.version}`)
