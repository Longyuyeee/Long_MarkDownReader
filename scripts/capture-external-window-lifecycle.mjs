import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14420'
const executable = path.resolve(process.env.LONGEDIT_EXTERNAL_WINDOW_EXECUTABLE || '')
const textFile = path.resolve(process.env.LONGEDIT_EXTERNAL_WINDOW_TEXT || '')
const jsonFile = path.resolve(process.env.LONGEDIT_EXTERNAL_WINDOW_JSON || '')
const output = path.resolve(process.env.LONGEDIT_EXTERNAL_WINDOW_OUTPUT || '')
const sourceCommit = process.env.LONGEDIT_EXTERNAL_WINDOW_SOURCE_COMMIT || ''
if (!executable || !textFile || !jsonFile || !output || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
  throw new Error('External-window audit inputs are incomplete')
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const listTargets = async () => (await fetch(`${endpoint}/json`).then(response => response.json()))
  .filter(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))

const connect = async target => {
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
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception')
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'WebView log error')
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
    return result.result.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  return { socket, send, evaluate, runtimeErrors }
}

const waitForTarget = async predicate => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const target = (await listTargets()).find(predicate)
    if (target) return target
    await delay(100)
  }
  throw new Error('Timed out waiting for an independent external WebView target')
}

const launchSecondary = async file => {
  const child = spawn(executable, [file], { cwd: path.dirname(executable), windowsHide: true, stdio: 'ignore' })
  const [code] = await Promise.race([
    once(child, 'exit'),
    delay(15_000).then(() => { throw new Error(`Secondary process did not hand off ${path.basename(file)}`) }),
  ])
  if (code !== 0) throw new Error(`Secondary process exited with ${code}`)
}

const inspect = client => client.evaluate(`(() => ({
  hash: location.hash,
  role: document.querySelector('.app-container')?.dataset.windowRole || '',
  library: Boolean(document.querySelector('.library-mode')),
  text: Boolean(document.querySelector('.text-workspace')),
  json: Boolean(document.querySelector('.json-workspace')),
  tabsVisible: [...document.querySelectorAll('.workspace-tabs')].some(item => getComputedStyle(item).display !== 'none'),
  updaterVisible: Boolean(document.querySelector('.update-modal')),
  body: document.body?.innerText?.slice(0, 1500) || '',
}))()`)

await fs.mkdir(output, { recursive: true })
const initialTarget = await waitForTarget(() => true)
const main = await connect(initialTarget)
for (let attempt = 0; attempt < 300; attempt += 1) {
  if ((await inspect(main)).library) break
  if (attempt === 299) throw new Error('Main library window did not become ready')
  await delay(100)
}
const mainBefore = await inspect(main)
if (mainBefore.role !== 'main' || !mainBefore.library) throw new Error(`Unexpected main window: ${JSON.stringify(mainBefore)}`)

await launchSecondary(textFile)
const textTarget = await waitForTarget(target => target.id !== initialTarget.id && target.url.includes('/text?'))
const text = await connect(textTarget)
for (let attempt = 0; attempt < 300; attempt += 1) {
  if ((await inspect(text)).body.includes('EXTERNAL_WINDOW_TEXT_MARKER')) break
  if (attempt === 299) throw new Error('External TXT workspace did not load its source')
  await delay(100)
}
const textState = await inspect(text)
if (textState.role !== 'external' || !textState.text || textState.tabsVisible || textState.updaterVisible) {
  throw new Error(`External TXT window contract failed: ${JSON.stringify(textState)}`)
}

await launchSecondary(jsonFile)
const jsonTarget = await waitForTarget(target => ![initialTarget.id, textTarget.id].includes(target.id) && target.url.includes('/json?'))
const json = await connect(jsonTarget)
for (let attempt = 0; attempt < 300; attempt += 1) {
  if ((await inspect(json)).body.includes('EXTERNAL_WINDOW_JSON_MARKER')) break
  if (attempt === 299) throw new Error('External JSON workspace did not load its source')
  await delay(100)
}
const jsonState = await inspect(json)
const mainAfter = await inspect(main)
if (jsonState.role !== 'external' || !jsonState.json || jsonState.tabsVisible || jsonState.updaterVisible) {
  throw new Error(`External JSON window contract failed: ${JSON.stringify(jsonState)}`)
}
if (mainAfter.hash !== mainBefore.hash || !mainAfter.library || mainAfter.role !== 'main') {
  throw new Error(`External launch hijacked the main window: ${JSON.stringify({ mainBefore, mainAfter })}`)
}
const targetsAfter = await listTargets()
if (targetsAfter.length < 3) throw new Error(`Expected three simultaneous WebViews, found ${targetsAfter.length}`)

const capture = async (client, file) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(screenshot.data, 'base64'))
}
await capture(main, 'main-window-preserved.png')
await capture(text, 'external-text-window.png')
await capture(json, 'external-json-window.png')

const runtimeErrors = [...main.runtimeErrors, ...text.runtimeErrors, ...json.runtimeErrors]
if (runtimeErrors.length) throw new Error(`Runtime errors observed: ${runtimeErrors.join(' | ')}`)
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'UX-51',
  status: 'debug-tauri-multi-window-passed',
  sourceCommit,
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  checks: {
    mainWindowPreserved: true,
    secondaryProcessHandoff: true,
    independentTextWindow: true,
    independentJsonWindow: true,
    simultaneousWindowCount: targetsAfter.length,
    externalTabsHidden: true,
    updaterLimitedToMainWindow: true,
    runtimeErrorCount: 0,
  },
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}, null, 2)}\n`)
main.socket.close(); text.socket.close(); json.socket.close()
console.log(`UX-51 external-window lifecycle passed with ${targetsAfter.length} simultaneous WebViews.`)
