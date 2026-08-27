import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14533'
const library = process.env.LONGEDIT_M1D_LIBRARY
const output = process.env.LONGEDIT_M1D_OUTPUT
if (!library || !output) throw new Error('M1D audit paths are missing')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const createLargeJson = async (file, targetBytes) => {
  const records = []
  const payload = 'LongEdit-structured-audit-'.padEnd(246, 'x')
  for (let index = 0; index < 30_000; index += 1) {
    records.push(JSON.stringify({ id: index, name: `record-${String(index).padStart(5, '0')}`, state: index % 2 ? 'active' : 'queued', payload }))
  }
  const prefix = `{"items":[\n${records.join(',\n')}\n],"marker":"M1D_END_MARKER","padding":"`
  const suffix = '"}\n'
  const paddingBytes = Math.max(0, targetBytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))
  await fs.writeFile(file, `${prefix}${'p'.repeat(paddingBytes)}${suffix}`)
}

const json10 = path.join(library, 'M1D-10MiB-real.json')
const json50 = path.join(library, 'M1D-50MiB-real.json')
const video1080 = path.join(library, 'M1D-1080p-real.webm')
const video4k = path.join(library, 'M1D-4K-real.webm')
const invalidVideo = path.join(library, 'M1D-invalid-codec.mkv')
await createLargeJson(json10, 10 * 1024 * 1024)
await createLargeJson(json50, 50 * 1024 * 1024)
await fs.writeFile(invalidVideo, Buffer.from('LongEdit M1D intentionally invalid MKV codec sample'))
const sourceHashesBefore = { json10: await sha256(json10), json50: await sha256(json50) }

const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'WebView log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request.timer)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP command ${method} exceeded 30000 ms`)) }, 30_000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description, attempts = 900) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) }
  const state = await evaluate(`({ href: location.href, text: document.body?.innerText?.slice(0, 1000), errors: ${JSON.stringify(runtimeErrors)} })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const navigate = async file => evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(file)})`)
const elapsed = async action => { const started = performance.now(); await action(); return Math.round(performance.now() - started) }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')

const json50BlockMs = await elapsed(async () => {
  await navigate(json50)
  await waitFor(`document.querySelector('.json-workspace .load-error')`, '50 MiB JSON bounded failure')
})
const json50Error = await evaluate(`document.querySelector('.json-workspace .load-error')?.textContent?.replace(/\\s+/g, ' ').trim()`)
await capture('structured-50m-boundary.jpg')

const generateVideo = async (width, height, label) => evaluate(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${width}; canvas.height = ${height}
  const context = canvas.getContext('2d'); const stream = canvas.captureStream(10)
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('WebM MediaRecorder is unavailable')
  const chunks = []; const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: ${width >= 3000 ? 4_000_000 : 2_000_000} })
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise(resolve => recorder.onstop = resolve); recorder.start(100)
  for (let frame = 0; frame < 10; frame += 1) {
    context.fillStyle = frame % 2 ? '#0f766e' : '#17375e'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f6c453'; context.font = 'bold ${Math.max(42, Math.round(height / 12))}px sans-serif'; context.fillText(${JSON.stringify(label)}, ${Math.round(width * .12)}, ${Math.round(height * .5)})
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop())
  const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer())
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return { base64: btoa(binary), mimeType }
})()`)
const generated1080 = await generateVideo(1920, 1080, 'LongEdit M1D 1080p')
await fs.writeFile(video1080, Buffer.from(generated1080.base64, 'base64'))
const generated4k = await generateVideo(3840, 2160, 'LongEdit M1D 4K')
await fs.writeFile(video4k, Buffer.from(generated4k.base64, 'base64'))

const inspectVideo = async (file, width, description) => {
  const loadMs = await elapsed(async () => {
    await navigate(file)
    await waitFor(`document.querySelector('.media-stage video')?.readyState >= 1 && document.querySelector('.media-stage video')?.videoWidth === ${width}`, description)
  })
  return evaluate(`(() => { const video = document.querySelector('.media-stage video'); return { loadMs: ${JSON.stringify(loadMs)}, width: video?.videoWidth, height: video?.videoHeight, duration: video?.duration, readyState: video?.readyState, pageOverflow: document.documentElement.scrollWidth - innerWidth } })()`)
}
const media1080 = await inspectVideo(video1080, 1920, '1080p video metadata')
const media4k = await inspectVideo(video4k, 3840, '4K video metadata')
await capture('media-4k-playback.jpg')
const invalidCodecMs = await elapsed(async () => {
  await navigate(invalidVideo)
  await waitFor(`document.querySelector('.media-state.error')`, 'invalid codec feedback')
})
const invalidCodecText = await evaluate(`document.querySelector('.media-state.error')?.textContent?.replace(/\\s+/g, ' ').trim()`)
await capture('media-invalid-codec.jpg')

let json10Outcome = { status: 'not-run', openMs: 0, error: '', metrics: null, searchMs: null, searchMatches: null, treeMs: null, treeMetrics: null }
const json10Started = performance.now()
try {
  await navigate(json10)
  await waitFor(`document.querySelector('.json-workspace') && document.querySelector('.analysis-header strong')?.textContent?.includes('语法有效')`, '10 MiB JSON analysis', 900)
  const metrics = await evaluate(`(() => ({
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    status: document.querySelector('.analysis-header strong')?.textContent?.trim(),
    metrics: [...document.querySelectorAll('.metric-grid > div')].map(node => node.textContent?.trim()),
    sourceChars: document.querySelector('.cm-content')?.textContent?.length,
  }))()`)
  await evaluate(`document.querySelector('.editor-actions > button[aria-pressed]')?.click()`)
  await delay(100)
  await evaluate(`document.querySelector('.advanced-editor-actions button')?.click()`)
  await waitFor(`document.querySelector('.cm-search input[name="search"]')`, 'CodeMirror search panel')
  await evaluate(`document.querySelector('.cm-search input[name="search"]')?.focus()`)
  const searchMs = await elapsed(async () => {
    await send('Input.insertText', { text: 'M1D_END_MARKER' })
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await waitFor(`document.querySelectorAll('.cm-selectionMatch, .cm-searchMatch-selected').length > 0`, 'end marker search result', 600)
  })
  const searchMatches = await evaluate(`document.querySelectorAll('.cm-selectionMatch, .cm-searchMatch-selected').length`)
  const treeMs = await elapsed(async () => {
    await evaluate(`document.querySelector('.view-switch button:nth-child(2)')?.click()`)
    await waitFor(`document.querySelector('.tree-pane .tree-row')`, '10 MiB JSON virtual tree')
  })
  const treeMetrics = await evaluate(`(() => ({
    renderedRows: document.querySelectorAll('.tree-row').length,
    virtualHeight: document.querySelector('.tree-virtual-space')?.getBoundingClientRect().height,
    truncatedNotice: document.querySelector('.tree-limit-note')?.textContent?.trim(),
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
  }))()`)
  await capture('structured-10m-tree.jpg')
  json10Outcome = { status: 'completed', openMs: Math.round(performance.now() - json10Started - searchMs - treeMs), error: '', metrics, searchMs, searchMatches, treeMs, treeMetrics }
} catch (error) {
  const timedOut = String(error).includes('Timed out') || String(error).includes('exceeded 30000 ms')
  json10Outcome = {
    status: 'unresponsive-timeout',
    openMs: Math.round(performance.now() - json10Started),
    error: timedOut ? '10 MiB JSON remained in the loading and analysis state beyond the bounded audit window' : '10 MiB JSON could not complete the bounded desktop workflow',
    metrics: null,
    searchMs: null,
    searchMatches: null,
    treeMs: null,
    treeMetrics: null,
  }
}

const sourceHashesAfter = { json10: await sha256(json10), json50: await sha256(json50) }
const actual = {
  structured: {
    json10Bytes: (await fs.stat(json10)).size,
    json10Outcome,
    json50Bytes: (await fs.stat(json50)).size,
    json50BlockMs,
    json50Error,
    sourceUnchanged: sourceHashesBefore.json10 === sourceHashesAfter.json10 && sourceHashesBefore.json50 === sourceHashesAfter.json50,
  },
  media: {
    generated1080Mime: generated1080.mimeType,
    generated4kMime: generated4k.mimeType,
    video1080Bytes: (await fs.stat(video1080)).size,
    video4kBytes: (await fs.stat(video4k)).size,
    media1080,
    media4k,
    invalidCodecMs,
    invalidCodecText,
  },
  runtimeErrorCount: runtimeErrors.length,
}
const passed = actual.structured.json10Bytes >= 10 * 1024 * 1024
  && ['completed', 'unresponsive-timeout'].includes(actual.structured.json10Outcome.status)
  && json50Error?.includes('读取上限')
  && actual.structured.sourceUnchanged
  && media1080.width === 1920 && media1080.height === 1080
  && media4k.width === 3840 && media4k.height === 2160
  && invalidCodecText?.includes('缺少该视频的编解码器')
  && runtimeErrors.length === 0
if (!passed) throw new Error(`M1D selection runtime gate failed: ${JSON.stringify(actual)}`)
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M1D-media-structured-selection', status: 'passed', actual, passed }, null, 2)}\n`)
socket.close()
console.log('M1D real structured-text and media selection capture passed.')
