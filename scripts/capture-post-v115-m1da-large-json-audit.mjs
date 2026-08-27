import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14534'
const library = process.env.LONGEDIT_M1DA_LIBRARY
const output = process.env.LONGEDIT_M1DA_OUTPUT
if (!library || !output) throw new Error('M1D-A audit paths are missing')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const createLargeJson = async (file, targetBytes, marker) => {
  const records = []
  const payload = 'LongEdit-progressive-json-'.padEnd(246, 'x')
  for (let index = 0; index < 30_000; index += 1) {
    records.push(JSON.stringify({ id: index, name: `record-${String(index).padStart(5, '0')}`, state: index % 2 ? 'active' : 'queued', payload }))
  }
  const prefix = `{"items":[\n${records.join(',\n')}\n],"marker":"${marker}","padding":"`
  const suffix = '"}\n'
  const paddingBytes = Math.max(0, targetBytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))
  await fs.writeFile(file, `${prefix}${'p'.repeat(paddingBytes)}${suffix}`)
}

const files = [
  { id: 'json10', name: 'M1DA-10MiB-real.json', bytes: 10 * 1024 * 1024, marker: 'M1DA_TEN_MIB_END_MARKER' },
  { id: 'json50', name: 'M1DA-50MiB-real.json', bytes: 50 * 1024 * 1024, marker: 'M1DA_FIFTY_MIB_END_MARKER' },
]
const smallJson = path.join(library, 'M1DA-small-editable.json')
await fs.writeFile(smallJson, `${JSON.stringify({ name: 'LongEdit small JSON control', items: [{ id: 1, enabled: true }, { id: 2, enabled: false }] }, null, 2)}\n`)
const smallHashBefore = await sha256(smallJson)
for (const fixture of files) {
  fixture.file = path.join(library, fixture.name)
  await createLargeJson(fixture.file, fixture.bytes, fixture.marker)
  fixture.before = await sha256(fixture.file)
}

const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit WebView target was not found')
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
  clearTimeout(request.timer)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => {
    pending.delete(id)
    reject(new Error(`CDP command ${method} exceeded 30000 ms`))
  }, 30_000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const waitFor = async (expression, description, attempts = 900) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({ href: location.href, text: document.body?.innerText?.slice(0, 1200), errors: ${JSON.stringify(runtimeErrors)} })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const navigate = file => evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(file)})`)
const elapsed = async action => {
  const started = performance.now()
  await action()
  return Math.round(performance.now() - started)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')

const smallOpenMs = await elapsed(async () => {
  await navigate(smallJson)
  await waitFor(`document.querySelector('.analysis-header strong')?.textContent?.includes('语法有效')`, 'small JSON full analysis')
})
const small = await evaluate(`(() => ({
  rangeMode: Boolean(document.querySelector('[data-testid="json-range-toolbar"]')),
  analysisStatus: document.querySelector('.analysis-header strong')?.textContent?.trim(),
  treeDisabled: document.querySelector('.view-switch button:nth-child(2)')?.disabled,
  saveDisabledWhileClean: document.querySelector('[data-testid="json-save"]')?.disabled,
  pageOverflow: document.documentElement.scrollWidth - innerWidth,
}))()`)
await evaluate(`document.querySelector('.view-switch button:nth-child(2)')?.click()`)
await waitFor(`document.querySelector('.tree-pane .tree-row')`, 'small JSON tree')
small.treeRows = await evaluate(`document.querySelectorAll('.tree-pane .tree-row').length`)

const auditFile = async fixture => {
  const openMs = await elapsed(async () => {
    await navigate(fixture.file)
    await waitFor(`document.querySelector('[data-testid="json-range-toolbar"]') && document.querySelector('.cm-content')?.textContent?.length > 1000`, `${fixture.id} first range`)
  })
  const first = await evaluate(`(() => ({
    loadedChars: document.querySelector('.cm-content')?.textContent?.length || 0,
    rangeLabel: document.querySelector('.range-progress span')?.textContent?.trim(),
    readOnlyLabel: document.querySelector('.json-statusbar span')?.textContent?.trim(),
    treeDisabled: document.querySelector('.view-switch button:nth-child(2)')?.disabled,
    saveDisabled: document.querySelector('[data-testid="json-save"]')?.disabled,
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
  }))()`)
  const firstLabel = first.rangeLabel
  const nextMs = await elapsed(async () => {
    await evaluate(`document.querySelector('[data-testid="json-range-next"]')?.click()`)
    await waitFor(`document.querySelector('.range-progress span')?.textContent?.trim() !== ${JSON.stringify(firstLabel)}`, `${fixture.id} next range`)
  })
  const nextLabel = await evaluate(`document.querySelector('.range-progress span')?.textContent?.trim()`)
  const previousMs = await elapsed(async () => {
    await evaluate(`document.querySelector('[data-testid="json-range-previous"]')?.click()`)
    await waitFor(`document.querySelector('.range-progress span')?.textContent?.trim() === ${JSON.stringify(firstLabel)}`, `${fixture.id} previous range`)
  })
  const previousLabel = await evaluate(`document.querySelector('.range-progress span')?.textContent?.trim()`)
  await evaluate(`document.querySelector('.range-search-pane input')?.focus()`)
  await send('Input.insertText', { text: fixture.marker })
  const searchMs = await elapsed(async () => {
    await evaluate(`document.querySelector('[data-testid="json-range-search"]')?.click()`)
    await waitFor(`document.querySelector('.range-search-progress strong')?.textContent?.trim() === '100%' && document.querySelectorAll('.range-search-result').length > 0`, `${fixture.id} streaming search`, 1200)
  })
  const search = await evaluate(`(() => ({
    progress: document.querySelector('.range-search-progress strong')?.textContent?.trim(),
    count: document.querySelectorAll('.range-search-result').length,
    preview: document.querySelector('.range-search-result code')?.textContent?.trim(),
  }))()`)
  const jumpMs = await elapsed(async () => {
    await evaluate(`document.querySelector('.range-search-result')?.click()`)
    await waitFor(`document.querySelector('.cm-content')?.textContent?.includes(${JSON.stringify(fixture.marker)})`, `${fixture.id} search result jump`)
  })
  await capture(`${fixture.id}-desktop.jpg`)
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
  await delay(300)
  const narrow = await evaluate(`(() => ({
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    workspaceWidth: document.querySelector('.json-workspace')?.getBoundingClientRect().width,
    searchVisible: Boolean(document.querySelector('.range-search-pane input')),
    toolbarHeight: document.querySelector('[data-testid="json-range-toolbar"]')?.getBoundingClientRect().height,
  }))()`)
  await capture(`${fixture.id}-narrow.jpg`)
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  return { openMs, first, nextMs, nextLabel, previousMs, previousLabel, searchMs, search, jumpMs, narrow }
}

const actual = {}
for (const fixture of files) actual[fixture.id] = await auditFile(fixture)
for (const fixture of files) fixture.after = await sha256(fixture.file)
actual.small = { openMs: smallOpenMs, ...small }
actual.sourceUnchanged = files.every(fixture => fixture.before === fixture.after)
  && smallHashBefore === await sha256(smallJson)
actual.runtimeErrorCount = runtimeErrors.length

const passed = files.every(fixture => {
  const result = actual[fixture.id]
  return result.openMs < 10_000
    && result.first.loadedChars > 1_000
    && result.first.loadedChars < 2 * 1024 * 1024
    && result.first.readOnlyLabel === '大文件渐进只读'
    && result.first.treeDisabled === true
    && result.first.saveDisabled === true
    && result.first.pageOverflow <= 0
    && result.nextLabel !== result.first.rangeLabel
    && result.previousLabel === result.first.rangeLabel
    && result.search.progress === '100%'
    && result.search.count >= 1
    && result.search.preview.includes(fixture.marker)
    && result.narrow.pageOverflow <= 0
    && result.narrow.searchVisible === true
})
  && actual.small.openMs < 10_000
  && actual.small.rangeMode === false
  && actual.small.analysisStatus === '语法有效'
  && actual.small.treeDisabled === false
  && actual.small.saveDisabledWhileClean === true
  && actual.small.treeRows > 0
  && actual.small.pageOverflow <= 0
  && actual.sourceUnchanged
  && actual.runtimeErrorCount === 0

if (!passed) throw new Error(`M1D-A real desktop gate failed: ${JSON.stringify(actual)}`)
const evidenceActual = structuredClone(actual)
for (const fixture of files) {
  evidenceActual[fixture.id].search = {
    progress: actual[fixture.id].search.progress,
    count: actual[fixture.id].search.count,
    matchedUniqueMarker: actual[fixture.id].search.preview.includes(fixture.marker),
  }
}
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'M1D-A-large-json-progressive-read-search',
  status: 'passed',
  expected: {
    firstRangeVisibleWithinMs: 10_000,
    boundedLoadedCharsBelow: 2 * 1024 * 1024,
    fullFileTailSearch: true,
    sourceBytesUnchanged: true,
    responsiveWidths: [1280, 960],
  },
  actual: evidenceActual,
  passed,
}, null, 2)}\n`)
socket.close()
console.log('M1D-A real large JSON progressive audit passed.')
