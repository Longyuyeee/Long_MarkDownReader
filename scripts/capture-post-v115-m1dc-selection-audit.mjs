import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14536'
const library = process.env.LONGEDIT_M1DC_LIBRARY
const output = process.env.LONGEDIT_M1DC_OUTPUT
if (!library || !output) throw new Error('M1D-C audit paths are missing')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
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
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const waitFor = async (expression, description, attempts = 600) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const navigate = file => evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(file)})`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')

const files = {
  video: path.join(library, 'm1dc-subtitle-baseline.webm'),
  vtt: path.join(library, 'm1dc-subtitle-baseline.vtt'),
  srt: path.join(library, 'm1dc-subtitle-baseline.srt'),
  yaml: path.join(library, 'm1dc-schema-baseline.yaml'),
  xml: path.join(library, 'm1dc-schema-baseline.xml'),
  toml: path.join(library, 'm1dc-schema-baseline.toml'),
}
const generated = await evaluate(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
  const context = canvas.getContext('2d'); const stream = canvas.captureStream(30)
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('WebM MediaRecorder is unavailable')
  const chunks = []; const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1800000 })
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise(resolve => recorder.onstop = resolve); recorder.start(200)
  for (let frame = 0; frame < 48; frame += 1) {
    context.fillStyle = '#13202c'; context.fillRect(0, 0, 1280, 720)
    context.fillStyle = '#58d68d'; context.fillRect(100, 100, 1080, 520)
    context.fillStyle = '#101318'; context.font = 'bold 66px sans-serif'; context.fillText('LongEdit subtitle baseline', 180, 320)
    context.font = 'bold 36px monospace'; context.fillText('FRAME ' + String(frame).padStart(2, '0'), 180, 410)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop())
  const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer()); let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return { base64: btoa(binary), mimeType }
})()`)
await fs.writeFile(files.video, Buffer.from(generated.base64, 'base64'))
await fs.writeFile(files.vtt, 'WEBVTT\n\n00:00:00.200 --> 00:00:01.200\nLongEdit VTT subtitle\n\n00:00:01.300 --> 00:00:02.200\nSecond cue\n', 'utf8')
await fs.writeFile(files.srt, '1\n00:00:00,200 --> 00:00:01,200\nLongEdit SRT subtitle\n\n2\n00:00:01,300 --> 00:00:02,200\nSecond cue\n', 'utf8')
await fs.writeFile(files.yaml, 'service:\n  port: "eighty"\n  enabled: "yes"\n', 'utf8')
await fs.writeFile(files.xml, '<service><port>eighty</port><enabled>yes</enabled></service>\n', 'utf8')
await fs.writeFile(files.toml, '[service]\nport = "eighty"\nenabled = "yes"\n', 'utf8')
const hashesBefore = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([id, file]) => [id, await sha256(file)])))

await navigate(files.video)
await waitFor(`document.querySelector('.media-stage video')?.videoWidth === 1280`, 'subtitle baseline video')
const subtitle = await evaluate(`(() => {
  const video = document.querySelector('.media-stage video')
  const controls = [...document.querySelectorAll('.media-actions button, .media-actions select')].map(element => (element.title || element.getAttribute('aria-label') || element.textContent || '').trim())
  return {
    decoded: video.videoWidth === 1280 && video.videoHeight === 720,
    textTrackCount: video.textTracks.length,
    trackElementCount: video.querySelectorAll('track').length,
    subtitleControlVisible: controls.some(label => /字幕|subtitle|caption/i.test(label)),
    vttRegisteredInTree: document.body.innerText.includes('.vtt'),
    srtRegisteredInTree: document.body.innerText.includes('.srt'),
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
  }
})()`)
await capture('subtitle-current-baseline.jpg')

const structured = await evaluate(`Promise.all([
  window.__TAURI_INTERNALS__.invoke('analyze_yaml_source', { content: ${JSON.stringify(await fs.readFile(files.yaml, 'utf8'))} }),
  window.__TAURI_INTERNALS__.invoke('analyze_xml_source', { content: ${JSON.stringify(await fs.readFile(files.xml, 'utf8'))} }),
  window.__TAURI_INTERNALS__.invoke('analyze_toml_source', { content: ${JSON.stringify(await fs.readFile(files.toml, 'utf8'))} }),
]).then(([yaml, xml, toml]) => ({
  yaml: { valid: yaml.valid, diagnosticCount: yaml.diagnostics?.length || 0 },
  xml: { valid: xml.valid, diagnosticCount: xml.diagnostics?.length || 0 },
  toml: { valid: toml.valid, diagnosticCount: toml.diagnostics?.length || 0 },
}))`)
await navigate(files.yaml)
await waitFor(`document.body.innerText.includes('语法有效')`, 'YAML valid semantic-invalid baseline')
const yamlUi = await evaluate(`({
  syntaxValidVisible: document.body.innerText.includes('语法有效'),
  schemaControlVisible: /Schema|模式约束|结构约束/.test(document.body.innerText),
  pageOverflow: document.documentElement.scrollWidth - innerWidth,
})`)
await capture('yaml-current-baseline.jpg')

const vtt = await fs.readFile(files.vtt, 'utf8')
const srt = await fs.readFile(files.srt, 'utf8')
const sidecars = {
  vttValid: /^WEBVTT\r?\n[\s\S]*\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}/.test(vtt),
  srtValid: /^1\r?\n\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}/.test(srt),
  vttCueCount: (vtt.match(/ --> /g) || []).length,
  srtCueCount: (srt.match(/ --> /g) || []).length,
}
const hashesAfter = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([id, file]) => [id, await sha256(file)])))
const sourceUnchanged = Object.keys(hashesBefore).every(id => hashesBefore[id] === hashesAfter[id])
const currentGapReproduced = sidecars.vttValid && sidecars.srtValid
  && subtitle.decoded && subtitle.textTrackCount === 0 && !subtitle.subtitleControlVisible
  && structured.yaml.valid && structured.xml.valid && structured.toml.valid
  && structured.yaml.diagnosticCount === 0 && structured.xml.diagnosticCount === 0 && structured.toml.diagnosticCount === 0
  && yamlUi.syntaxValidVisible && !yamlUi.schemaControlVisible
const passed = currentGapReproduced && sourceUnchanged && subtitle.pageOverflow <= 0 && yamlUi.pageOverflow <= 0 && runtimeErrors.length === 0
if (!passed) throw new Error(`M1D-C real selection baseline failed: ${JSON.stringify({ subtitle, structured, yamlUi, sidecars, sourceUnchanged, runtimeErrors })}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'M1D-C-subtitle-and-structured-schema-selection',
  status: 'passed-selection-baseline',
  expected: {
    subtitleSidecarSelectable: true,
    semanticTypeMismatchLocated: true,
    sourceUnchanged: true,
  },
  actual: {
    subtitle,
    structured,
    yamlUi,
    sidecars,
    sourceUnchanged,
    runtimeErrorCount: runtimeErrors.length,
  },
  difference: {
    subtitleSidecarSelectable: false,
    semanticTypeMismatchLocated: false,
  },
  decision: {
    selectedNextStage: 'M1D-C1-external-subtitle-sidecar-playback',
    reason: 'Valid VTT and SRT sidecars are currently invisible during otherwise successful video playback; bounded sidecar playback is smaller and more directly observable than introducing a multi-language schema engine.',
    deferred: ['structured-schema-provider-and-mapping-audit', 'embedded-subtitle-demux', 'subtitle-source-editing', 'video-transcoding'],
  },
  passed,
}, null, 2)}\n`)
socket.close()
console.log('M1D-C real subtitle and structured-schema selection baseline passed.')
