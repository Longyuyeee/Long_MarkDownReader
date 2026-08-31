import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M6_1_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M6_1_LIBRARY)
const theme = process.env.LONGEDIT_M6_1_THEME || 'dark'
const motion = process.env.LONGEDIT_M6_1_MOTION || 'reduced'
if (!endpoint) throw new Error('M6-1 capture environment is incomplete')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const hashDirectory = async root => {
  const files = []
  const walk = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      entry.isDirectory() ? await walk(full) : files.push(full)
    }
  }
  await walk(root)
  const hash = crypto.createHash('sha256')
  for (const file of files.sort()) {
    hash.update(path.relative(root, file).replaceAll('\\', '/'))
    hash.update(await fs.readFile(file))
  }
  return hash.digest('hex')
}
const beforeSha256 = await hashDirectory(library)

let target
for (let attempt = 0; attempt < 240 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
  if (!target) await delay(100)
}
if (!target?.webSocketDebuggerUrl) throw new Error('M6-1 WebView target missing')
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
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'log error')
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'evaluation failed')
  return response.result.value
}
const waitFor = async (expression, description, attempts = 400) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(50)
  }
  throw new Error(`Timeout waiting for ${description}`)
}
const capture = async file => {
  const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(image.data, 'base64'))
}
const clickElementWithUserGesture = async selector => {
  const response = await send('Runtime.evaluate', {
    expression: `(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!(element instanceof HTMLButtonElement)||element.disabled)return false;element.scrollIntoView({block:'center',inline:'center'});element.click();return true})()`,
    returnByValue: true,
    userGesture: true,
  })
  if (response.exceptionDetails || response.result?.value !== true) throw new Error(`user-gesture click target unavailable: ${selector}`)
}
const pressEscape = async () => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
}
const snapshot = () => evaluate(`(()=>{const container=document.querySelector('[data-testid="graph-container"]');const canvas=document.querySelector('[data-testid="graph-canvas"]');const button=document.querySelector('[data-testid="graph-fullscreen"]');const minimap=document.querySelector('[data-testid="graph-minimap"]');const history=document.querySelector('[data-testid="graph-selection-history-panel"]');const rect=element=>{const value=element?.getBoundingClientRect();return value?{left:Math.round(value.left),top:Math.round(value.top),right:Math.round(value.right),bottom:Math.round(value.bottom),width:Math.round(value.width),height:Math.round(value.height)}:null};return {viewport:{width:innerWidth,height:innerHeight},documentFits:document.documentElement.scrollWidth<=innerWidth+1,fullscreenElementIsGraph:document.fullscreenElement===container,fullscreenActive:container?.dataset.fullscreenActive||'',fullscreenSupported:container?.dataset.fullscreenSupported||'',containerRect:rect(container),canvasRect:rect(canvas),selectedCount:Number(canvas?.dataset.selectedCount||0),cameraPose:canvas?.dataset.cameraPose||'',minimapVisible:Boolean(minimap&&getComputedStyle(minimap).display!=='none'),historyVisible:Boolean(history),historyCount:Number(history?.dataset.count||0),buttonLabel:button?.getAttribute('aria-label')||'',buttonPressed:button?.getAttribute('aria-pressed')||'',buttonDisabled:Boolean(button?.disabled)}})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion === 'reduced' ? 'reduce' : 'no-preference' }] })
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null`, 'library initialization')
await evaluate(`location.hash=${JSON.stringify(`#/graph?mode=network&root=${encodeURIComponent(path.join(library, 'NorthStar.md'))}`)}`)
await waitFor(`document.querySelector('[data-testid="graph-fullscreen"]')?.disabled===false`, 'supported graph fullscreen action')
await waitFor(`Number(document.querySelector('[data-testid="graph-canvas"]')?.dataset.selectedCount||0)>0`, 'initial graph selection')
await evaluate(`document.querySelector('[data-testid="graph-selection-history-entry"]')?.click()`)
await waitFor(`document.querySelector('[data-testid="graph-selection-history-panel"]')!==null`, 'selection history panel')

const viewports = [
  { width: 1280, height: 800 },
  { width: 1000, height: 700 },
  { width: 720, height: 680 },
]
const cycles = []
for (const viewport of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false })
  await delay(500)
  await evaluate(`document.querySelector('[data-testid="graph-fit-all"]')?.click()`)
  await delay(250)
  const before = await snapshot()
  await clickElementWithUserGesture('[data-testid="graph-fullscreen"]')
  await waitFor(`document.fullscreenElement===document.querySelector('[data-testid="graph-container"]')`, `graph fullscreen ${viewport.width}`)
  await delay(500)
  const inside = await snapshot()
  await capture(`graph-fullscreen-${theme}-${motion}-${viewport.width}x${viewport.height}.jpg`)
  await pressEscape()
  await waitFor(`document.fullscreenElement===null`, `graph fullscreen Escape exit ${viewport.width}`)
  await delay(350)
  const after = await snapshot()
  cycles.push({ viewport, before, inside, after })
  process.stdout.write(`${JSON.stringify({ viewport, before, inside, after })}\n`)
  if (!before.documentFits || before.fullscreenElementIsGraph || before.fullscreenActive !== 'false' || before.fullscreenSupported !== 'true' || before.buttonDisabled) throw new Error(`M6-1 invalid pre-fullscreen state at ${viewport.width}`)
  if (before.buttonLabel !== '图谱全屏') throw new Error(`M6-1 accessible entry label missing at ${viewport.width}`)
  if (!inside.documentFits || !inside.fullscreenElementIsGraph || inside.fullscreenActive !== 'true' || inside.buttonPressed !== 'true' || inside.buttonLabel !== '退出图谱全屏' || inside.containerRect?.top !== 0 || inside.containerRect?.width !== viewport.width || inside.containerRect?.height !== viewport.height) throw new Error(`M6-1 invalid fullscreen state at ${viewport.width}`)
  if (after.fullscreenElementIsGraph || after.fullscreenActive !== 'false' || after.buttonPressed !== 'false' || after.buttonLabel !== '图谱全屏') throw new Error(`M6-1 invalid exit state at ${viewport.width}`)
  if (before.selectedCount !== inside.selectedCount || inside.selectedCount !== after.selectedCount || !inside.minimapVisible || !inside.historyVisible || !after.minimapVisible || !after.historyVisible) throw new Error(`M6-1 graph state was not preserved at ${viewport.width}`)
}

await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false })
await delay(300)
await clickElementWithUserGesture('[data-testid="graph-fullscreen"]')
await waitFor(`document.fullscreenElement===document.querySelector('[data-testid="graph-container"]')`, 'route cleanup fullscreen entry')
await evaluate(`location.hash='#/library'`)
await waitFor(`document.querySelector('.library-mode')!==null`, 'library after fullscreen route leave')
await waitFor(`document.fullscreenElement===null`, 'fullscreen cleanup after route unmount')
const routeCleanup = { returnedToLibrary: true, fullscreenElementCleared: await evaluate(`document.fullscreenElement===null`) }
const afterSha256 = await hashDirectory(library)
const evidence = {
  schemaVersion: 1,
  stage: 'M6-1',
  capturedAt: new Date().toISOString(),
  session: { theme, motion },
  expected: {
    explicitSupportedEntry: true,
    fullscreenFillsEachViewport: true,
    fullscreenChangeOwnsState: true,
    escapeExits: true,
    graphStatePreserved: true,
    routeUnmountExits: true,
    sourceFilesUnchanged: true,
    runtimeErrors: 0,
  },
  actual: {
    cycles,
    routeCleanup,
    sourceFilesUnchanged: beforeSha256 === afterSha256,
    beforeSha256,
    afterSha256,
    runtimeErrors: runtimeErrors.length,
    runtimeErrorMessages: runtimeErrors,
  },
}
await fs.writeFile(path.join(output, `desktop-${theme}-${motion}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
if (!evidence.actual.sourceFilesUnchanged || evidence.actual.runtimeErrors) throw new Error(`M6-1 source/runtime boundary failed: ${JSON.stringify(evidence.actual.runtimeErrorMessages)}`)
