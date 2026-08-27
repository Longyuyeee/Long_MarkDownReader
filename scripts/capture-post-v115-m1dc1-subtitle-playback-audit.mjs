import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14537'
const library = process.env.LONGEDIT_M1DC1_LIBRARY
const output = process.env.LONGEDIT_M1DC1_OUTPUT
if (!library || !output) throw new Error('M1D-C1 audit paths are missing')

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
const subtitleState = () => evaluate(`(() => {
  const video = document.querySelector('.media-stage video')
  const select = document.querySelector('[data-testid="video-subtitle-select"]')
  const tracks = [...video.textTracks]
  return {
    decoded: video.videoWidth === 1280 && video.videoHeight === 720,
    selected: select?.value || null,
    options: [...(select?.options || [])].map(option => ({ value: option.value, text: option.textContent.trim() })),
    textTrackCount: tracks.length,
    trackElementCount: video.querySelectorAll('track').length,
    modes: tracks.map(track => track.mode),
    cueCounts: tracks.map(track => track.cues?.length || 0),
    activeTexts: tracks.flatMap(track => [...(track.activeCues || [])].map(cue => cue.text)),
    statusText: document.querySelector('.media-status')?.innerText || '',
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
  }
})()`)
const seek = async seconds => {
  await evaluate(`new Promise(resolve => {
    const video = document.querySelector('.media-stage video'); video.pause()
    if (Math.abs(video.currentTime - ${seconds}) < .01) return resolve()
    video.addEventListener('seeked', resolve, { once: true }); video.currentTime = ${seconds}
  })`)
  await delay(150)
}
const selectTrack = async id => {
  await evaluate(`(() => {
    const select = document.querySelector('[data-testid="video-subtitle-select"]')
    select.value = ${JSON.stringify(id)}; select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await delay(150)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')

const files = {
  video: path.join(library, 'm1dc1-subtitle-playback.webm'),
  vtt: path.join(library, 'm1dc1-subtitle-playback.vtt'),
  srt: path.join(library, 'm1dc1-subtitle-playback.srt'),
  invalidVideo: path.join(library, 'm1dc1-invalid.webm'),
  invalidVtt: path.join(library, 'm1dc1-invalid.vtt'),
  betweenText: path.join(library, 'm1dc1-between.txt'),
}
const generated = await evaluate(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
  const context = canvas.getContext('2d'); const stream = canvas.captureStream(30)
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('WebM MediaRecorder is unavailable')
  const chunks = []; const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1800000 })
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise(resolve => recorder.onstop = resolve); recorder.start(200)
  for (let frame = 0; frame < 64; frame += 1) {
    context.fillStyle = '#101820'; context.fillRect(0, 0, 1280, 720)
    context.fillStyle = frame < 32 ? '#2ecc71' : '#3498db'; context.fillRect(100, 100, 1080, 520)
    context.fillStyle = '#0b1118'; context.font = 'bold 64px sans-serif'; context.fillText('LongEdit subtitle playback', 170, 315)
    context.font = 'bold 34px monospace'; context.fillText('FRAME ' + String(frame).padStart(2, '0'), 170, 405)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop())
  const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer()); let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return { base64: btoa(binary), mimeType }
})()`)
const videoBytes = Buffer.from(generated.base64, 'base64')
await fs.writeFile(files.video, videoBytes)
await fs.writeFile(files.invalidVideo, videoBytes)
await fs.writeFile(files.vtt, 'WEBVTT\n\n00:00:00.200 --> 00:00:01.200\nVTT first cue\n\n00:00:01.300 --> 00:00:02.200\nVTT second cue\n', 'utf8')
await fs.writeFile(files.srt, '1\n00:00:00,200 --> 00:00:01,200\nSRT first cue\n\n2\n00:00:01,300 --> 00:00:02,200\nSRT second cue\n', 'utf8')
await fs.writeFile(files.invalidVtt, 'not-webvtt\n\n00:00:00.200 --> 00:00:01.200\nUnsafe false positive\n', 'utf8')
await fs.writeFile(files.betweenText, 'Cross-format reopen checkpoint.\n', 'utf8')
const hashesBefore = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([id, file]) => [id, await sha256(file)])))

await navigate(files.video)
await waitFor(`document.querySelector('.media-stage video')?.videoWidth === 1280 && document.querySelector('[data-testid="video-subtitle-select"]')?.options.length === 3`, 'video with two subtitle tracks')
await delay(400)
console.log('M1D-C1 track probe:', await evaluate(`(() => {
  const video = document.querySelector('.media-stage video'); const elements = [...video.querySelectorAll('track')]
  return {
    trackElements: elements.length,
    textTracks: video.textTracks.length,
    cueStates: [...video.textTracks].map(track => ({ cueCount: track.cues?.length ?? null, mode: track.mode, label: track.label })),
    vttCueAvailable: typeof VTTCue === 'function',
    notice: document.querySelector('.playback-notice')?.innerText || '',
  }
})()`))
await waitFor(`document.querySelector('.media-stage video').textTracks.length === 2 && document.querySelector('.media-stage video').textTracks[0].mode === 'showing' && document.querySelector('.media-stage video').textTracks[0].cues?.length === 2`, 'active parsed VTT cues')
await seek(0.6)
await waitFor(`[...document.querySelector('.media-stage video').textTracks].some(track => [...(track.activeCues || [])].some(cue => cue.text === 'VTT first cue'))`, 'active VTT first cue')
const vttActive = await subtitleState()
await capture('vtt-active-cue.jpg')

await selectTrack('srt')
await seek(1.6)
await waitFor(`[...document.querySelector('.media-stage video').textTracks].some(track => [...(track.activeCues || [])].some(cue => cue.text === 'SRT second cue'))`, 'active SRT second cue')
const srtActive = await subtitleState()
await capture('srt-active-cue.jpg')

await selectTrack('off')
const off = await subtitleState()

await selectTrack('vtt')
await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(250)
const narrow = await subtitleState()
await capture('subtitle-narrow.jpg')

await navigate(files.betweenText)
await waitFor(`!document.querySelector('.media-stage video') && document.body.innerText.includes('m1dc1-between.txt')`, 'cross-format text checkpoint')
await navigate(files.video)
await waitFor(`document.querySelector('.media-stage video')?.videoWidth === 1280 && document.querySelector('[data-testid="video-subtitle-select"]')?.options.length === 3`, 'reopened subtitle video')
await waitFor(`document.querySelector('.media-stage video').textTracks[0].mode === 'showing' && document.querySelector('.media-stage video').textTracks[0].cues?.length === 2`, 'reopened active subtitle cues')
const reopened = await subtitleState()

const malformedRejected = await evaluate(`window.__TAURI_INTERNALS__.invoke('discover_video_subtitles', {
  libraryRoot: ${JSON.stringify(library)}, path: ${JSON.stringify(files.invalidVideo)}
}).then(() => ({ rejected: false, message: '' })).catch(error => ({ rejected: true, message: String(error) }))`)
const hashesAfter = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([id, file]) => [id, await sha256(file)])))
const sourceUnchanged = Object.keys(hashesBefore).every(id => hashesBefore[id] === hashesAfter[id])
const passed = vttActive.decoded
  && vttActive.selected === 'vtt' && vttActive.activeTexts.includes('VTT first cue')
  && srtActive.selected === 'srt' && srtActive.activeTexts.includes('SRT second cue')
  && off.selected === 'off' && off.modes.every(mode => mode === 'disabled') && off.activeTexts.length === 0
  && reopened.textTrackCount === 2 && reopened.cueCounts[0] === 2
  && malformedRejected.rejected && /WEBVTT/.test(malformedRejected.message)
  && sourceUnchanged && narrow.pageOverflow <= 0 && runtimeErrors.length === 0
if (!passed) throw new Error(`M1D-C1 real subtitle playback failed: ${JSON.stringify({ vttActive, srtActive, off, narrow, reopened, malformedRejected, sourceUnchanged, runtimeErrors })}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'M1D-C1-external-subtitle-sidecar-playback',
  status: 'passed',
  expected: {
    sameStemVttAndSrtDiscovered: true,
    trackSelectionAndOffState: true,
    timedActiveCueRendering: true,
    malformedSubtitleRejected: true,
    reopenStable: true,
    sourceUnchanged: true,
  },
  baselineDifference: {
    previousTextTrackCount: 0,
    previousSubtitleControlVisible: false,
    currentTextTrackCount: vttActive.textTrackCount,
    currentSubtitleControlVisible: vttActive.options.length === 3,
  },
  actual: { vttActive, srtActive, off, narrow, reopened, malformedRejected, sourceUnchanged, runtimeErrorCount: runtimeErrors.length },
  deferred: ['external-window-sidecar-discovery', 'embedded-subtitle-demux', 'subtitle-source-editing', 'video-transcoding'],
  passed,
}, null, 2)}\n`)
socket.close()
console.log('M1D-C1 real VTT/SRT subtitle playback audit passed.')
