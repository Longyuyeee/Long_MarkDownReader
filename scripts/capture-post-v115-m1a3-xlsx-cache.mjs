import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14414'
const output = path.resolve(process.env.LONGEDIT_M1A3_AUDIT_OUTPUT || 'docs/evidence/post-v115-m1a3-xlsx-cache')
const sourceCommit = process.env.LONGEDIT_M1A3_SOURCE_COMMIT || ''
const files = JSON.parse(process.env.LONGEDIT_M1A3_FILES || '[]')
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || files.length !== 3) throw new Error('M1A3 environment is incomplete')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView target was not found')
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const waitFor = async (expression, description, attempts = 400) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
const results = []
for (const item of files) {
  const openStarted = performance.now()
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(item.path)})`)
  await waitFor(`document.querySelector('.workbook-view .sheet-scroll') && document.querySelector('.workbook-title')?.textContent?.includes(${JSON.stringify(item.name)})`, `${item.cells} workbook open`)
  const openMs = Math.round(performance.now() - openStarted)

  const bottomStarted = performance.now()
  await evaluate(`(() => { const scroller = document.querySelector('.sheet-scroll'); const rowHeight = document.querySelector('.sheet-row')?.getBoundingClientRect().height || 20; scroller.scrollTop = Math.max(0, (${item.rows} - 12) * rowHeight); scroller.dispatchEvent(new Event('scroll')) })()`)
  await waitFor(`Math.max(0, ...[...document.querySelectorAll('.sheet-row .row-number')].map(node => Number(node.textContent))) >= ${item.rows - 4} && !document.querySelector('.workbook-status')?.textContent?.includes('正在载入行数据')`, `${item.cells} bottom page`)
  const bottomPageMs = Math.round(performance.now() - bottomStarted)
  results.push({ cells: item.cells, rows: item.rows, columns: item.columns, openMs, bottomPageMs, baselineBottomPageMs: item.baselineBottomPageMs, improvementRatio: Number(((item.baselineBottomPageMs - bottomPageMs) / item.baselineBottomPageMs).toFixed(3)) })
}

const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const largest = results.at(-1)
const largestExpected = files.at(-1)
const evidence = {
  schemaVersion: 1,
  stage: 'M1A3',
  sourceCommit,
  expected: {
    tiers: files.map(({ cells, maximumOpenMs, maximumBottomPageMs }) => ({ cells, maximumOpenMs, maximumBottomPageMs })),
    largestTierMinimumImprovementRatio: largestExpected.minimumImprovementRatio,
    runtimeErrorCount: 0
  },
  beforeActual: {
    sourceStage: 'M1A2',
    bottomPageMs: files.map(({ cells, baselineBottomPageMs }) => ({ cells, bottomPageMs: baselineBottomPageMs }))
  },
  afterActual: { tiers: results, runtimeErrorCount: runtimeErrors.length, blockingErrorSurfaceObserved },
  sourceUserContentIncluded: false,
  releaseCandidate: false
}
evidence.differenceResolved = results.every(item => {
  const expected = files.find(candidate => candidate.cells === item.cells)
  return item.openMs <= expected.maximumOpenMs && item.bottomPageMs <= expected.maximumBottomPageMs
}) && largest.improvementRatio >= largestExpected.minimumImprovementRatio && runtimeErrors.length === 0 && !blockingErrorSurfaceObserved
await fs.writeFile(path.join(output, 'cache-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
if (!evidence.differenceResolved) throw new Error(`M1A3 cache gate failed: ${JSON.stringify(evidence.afterActual)}`)
console.log(`M1A3 cache capture accepted: ${results.map(item => `${item.cells}:${item.openMs}/${item.bottomPageMs}ms (${Math.round(item.improvementRatio * 100)}%)`).join(', ')}`)
