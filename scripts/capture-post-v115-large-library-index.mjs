import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_LARGE_INDEX_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_LARGE_INDEX_LIBRARY)
const phase = process.env.LONGEDIT_LARGE_INDEX_PHASE || 'baseline'
const manifestPath = path.join(library, 'fixture-manifest.json')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')

let target
for (let attempt = 0; attempt < 240 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && /127\.0\.0\.1:9000|localhost:9000/.test(item.url))
  if (!target) await delay(100)
}
if (!target?.webSocketDebuggerUrl) throw new Error('WebView target missing')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let id = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text)
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id
  pending.set(requestId, { resolve, reject })
  socket.send(JSON.stringify({ id: requestId, method, params }))
})
const evaluate = async expression => {
  const result = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result
  if (result.subtype === 'error') throw new Error(result.description || 'Browser evaluation failed')
  return result.value
}
const evaluateWithoutAwait = expression => send('Runtime.evaluate', { expression, awaitPromise: false, returnByValue: true })
const wait = async (expression, description, attempts = 1200) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(50)
  }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,1200)})`)
  throw new Error(`Timeout: ${description}; ${JSON.stringify(state)}`)
}
const invoke = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`)
const timedInvoke = async (command, args = {}) => {
  const started = performance.now()
  const value = await invoke(command, args)
  return { elapsedMs: Math.round(performance.now() - started), value }
}
const timedWaitForStatus = async (expectedState, attempts = 120) => {
  const started = performance.now()
  let value
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    value = await invoke('get_knowledge_index_status', { libraryRoot: library })
    if (value.state === expectedState) break
    await delay(25)
  }
  return { elapsedMs: Math.round(performance.now() - started), value }
}
const capture = async name => {
  const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true })
  await fs.writeFile(path.join(output, name), Buffer.from(image.data, 'base64'))
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await wait(`document.querySelector('.library-mode')!==null`, 'library first operable')
const firstOperableMs = await evaluate(`Math.round(performance.now())`)
const manifestSha256Before = await sha256(manifestPath)

if (phase === 'restart' || phase === 'restart-current') {
  const status = await timedInvoke('get_knowledge_index_status', { libraryRoot: library })
  const query = await timedInvoke('search_knowledge', { libraryRoot: library, query: 'longedit-needle-9876' })
  const current = phase === 'restart-current'
  const screenshotName = current ? 'current-restart-ready-query-1280.jpg' : 'restart-ready-query-1280.jpg'
  const evidenceName = current ? 'current-restart-evidence.json' : 'restart-evidence.json'
  await capture(screenshotName)
  await fs.writeFile(path.join(output, evidenceName), `${JSON.stringify({
    stage: 'large-library-index-restart',
    buildProfile: process.env.LONGEDIT_LARGE_INDEX_BUILD_PROFILE || 'debug',
    actual: {
      firstOperableMs,
      statusMs: status.elapsedMs,
      status: status.value,
      restartReadyQueryMs: query.elapsedMs,
      restartResultCount: query.value.length,
      manifestSha256Before,
      manifestSha256After: await sha256(manifestPath),
      runtimeErrors: runtimeErrors.length,
    },
    runtimeErrorMessages: runtimeErrors,
    evidenceFiles: [screenshotName],
  }, null, 2)}\n`)
  socket.close()
  console.log(`Large-library restart query completed in ${query.elapsedMs} ms`)
  process.exit(0)
}

await delay(1000)
for (let attempt = 0; attempt < 2400; attempt += 1) {
  const status = await invoke('get_knowledge_index_status', { libraryRoot: library })
  if (status.state !== 'building') break
  await delay(100)
}
await evaluate(`location.hash='#/settings'`)
await wait(`document.querySelector('.settings-view')!==null`, 'settings isolation route')
try { await invoke('delete_knowledge_index', { libraryRoot: library }) } catch {}
const initial = await timedInvoke('rebuild_knowledge_index', { libraryRoot: library })
const indexedQuery = await timedInvoke('search_knowledge', { libraryRoot: library, query: 'longedit-needle-9876' })
const modifiedFile = path.join(library, 'group-98', 'document-9876.md')
await fs.appendFile(modifiedFile, '\nlongedit-incremental-refresh-marker\n', 'utf8')
const staleStatus = await timedWaitForStatus('stale')
const fallbackQuery = await timedInvoke('search_knowledge', { libraryRoot: library, query: 'longedit-incremental-refresh-marker' })
const refresh = await timedInvoke('rebuild_knowledge_index', { libraryRoot: library })
const refreshedQuery = await timedInvoke('search_knowledge', { libraryRoot: library, query: 'longedit-incremental-refresh-marker' })
let cancelSupported = false
let cancelError = ''
let cancelAcknowledgementMs = 0
let cancelledBuildState = ''
let postCancelRebuildMs = 0
if (phase === 'current') {
  await invoke('delete_knowledge_index', { libraryRoot: library })
  await evaluateWithoutAwait(`
    window.__LONGEDIT_CANCEL_TEST_DONE__ = false;
    window.__LONGEDIT_CANCEL_TEST_RESULT__ = null;
    window.__TAURI_INTERNALS__.invoke('rebuild_knowledge_index', ${JSON.stringify({ libraryRoot: library })})
      .then(value => { window.__LONGEDIT_CANCEL_TEST_RESULT__ = value; window.__LONGEDIT_CANCEL_TEST_DONE__ = true })
      .catch(error => { window.__LONGEDIT_CANCEL_TEST_RESULT__ = { error: String(error) }; window.__LONGEDIT_CANCEL_TEST_DONE__ = true });
  `)
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = await invoke('get_knowledge_index_status', { libraryRoot: library })
    if (status.state === 'building') break
    await delay(25)
  }
  const cancelStarted = performance.now()
  try {
    const result = await Promise.race([
      invoke('cancel_knowledge_index', { libraryRoot: library }),
      delay(1000).then(() => { throw new Error('cancel command timed out') }),
    ])
    cancelSupported = result?.state === 'cancelled'
    cancelledBuildState = result?.state || ''
  } catch (error) { cancelError = String(error) }
  cancelAcknowledgementMs = Math.round(performance.now() - cancelStarted)
  await wait(`window.__LONGEDIT_CANCEL_TEST_DONE__ === true`, 'cancelled build completion', 1200)
  const postCancel = await timedInvoke('rebuild_knowledge_index', { libraryRoot: library })
  postCancelRebuildMs = postCancel.elapsedMs
} else {
  const cancelStarted = performance.now()
  try {
    const result = await Promise.race([
      invoke('cancel_knowledge_index', { libraryRoot: library }),
      delay(1000).then(() => { throw new Error('cancel command timed out') }),
    ])
    cancelSupported = result?.state === 'cancelled'
  } catch (error) { cancelError = String(error) }
  cancelAcknowledgementMs = Math.round(performance.now() - cancelStarted)
}
const isCurrent = phase === 'current'
const desktopScreenshot = isCurrent ? 'current-large-library-index-1280.jpg' : 'large-library-index-1280.jpg'
const compactScreenshot = isCurrent ? 'current-large-library-index-720.jpg' : 'large-library-index-720.jpg'
await capture(desktopScreenshot)
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
await delay(300)
const responsive720 = await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`)
await capture(compactScreenshot)
const manifestSha256After = await sha256(manifestPath)
const evidenceName = isCurrent ? 'current-evidence.json' : 'baseline-evidence.json'
await fs.writeFile(path.join(output, evidenceName), `${JSON.stringify({
  stage: isCurrent ? 'large-library-index-current' : 'large-library-index-baseline',
  buildProfile: process.env.LONGEDIT_LARGE_INDEX_BUILD_PROFILE || 'debug',
  sourceCommit: process.env.LONGEDIT_LARGE_INDEX_SOURCE_COMMIT,
  actual: {
    firstOperableMs,
    initialRebuildMs: initial.elapsedMs,
    initialStatus: initial.value,
    indexedQueryMs: indexedQuery.elapsedMs,
    indexedResultCount: indexedQuery.value.length,
    staleDetectionMs: staleStatus.elapsedMs,
    staleState: staleStatus.value.state,
    fallbackQueryMs: fallbackQuery.elapsedMs,
    fallbackResultCount: fallbackQuery.value.length,
    singleFileRefreshMs: refresh.elapsedMs,
    refreshedResultCount: refreshedQuery.value.length,
    cancelSupported,
    cancelAcknowledgementMs,
    cancelledBuildState,
    postCancelRebuildMs,
    cancelError,
    responsive720,
    runtimeErrors: runtimeErrors.length,
    manifestSha256Before,
    manifestSha256After,
  },
  runtimeErrorMessages: runtimeErrors,
  evidenceFiles: [desktopScreenshot, compactScreenshot],
}, null, 2)}\n`)
socket.close()
console.log(`Large-library baseline: build ${initial.elapsedMs} ms, indexed query ${indexedQuery.elapsedMs} ms, refresh ${refresh.elapsedMs} ms`)
