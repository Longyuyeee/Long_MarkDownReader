import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14535'
const library = process.env.LONGEDIT_M1DB_LIBRARY
const output = process.env.LONGEDIT_M1DB_OUTPUT
if (!library || !output) throw new Error('M1D-B audit paths are missing')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const pngDimensions = async file => {
  const bytes = await fs.readFile(file)
  if (bytes.toString('ascii', 1, 4) !== 'PNG' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Saved frame is not an independently readable PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length }
}

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
const waitFor = async (expression, description, attempts = 900) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) }
  const state = await evaluate(`({ href: location.href, text: document.body?.innerText?.slice(0, 1000), errors: ${JSON.stringify(runtimeErrors)} })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const navigate = file => evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(file)})`)
const elapsed = async action => { const started = performance.now(); await action(); return Math.round(performance.now() - started) }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')

const generateVideo = async (width, height, label) => evaluate(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${width}; canvas.height = ${height}
  const context = canvas.getContext('2d'); const stream = canvas.captureStream(30)
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('WebM MediaRecorder is unavailable')
  const chunks = []; const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: ${width >= 3000 ? 5_000_000 : 2_500_000} })
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise(resolve => recorder.onstop = resolve); recorder.start(200)
  for (let frame = 0; frame < 50; frame += 1) {
    context.fillStyle = frame % 2 ? '#124e78' : '#176b4d'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f6c453'; context.fillRect(${Math.round(width * .08)}, ${Math.round(height * .18)}, ${Math.round(width * .84)}, ${Math.round(height * .64)})
    context.fillStyle = '#101318'; context.font = 'bold ${Math.max(42, Math.round(height / 12))}px sans-serif'; context.fillText(${JSON.stringify(label)}, ${Math.round(width * .13)}, ${Math.round(height * .48)})
    context.font = 'bold ${Math.max(28, Math.round(height / 20))}px monospace'; context.fillText('FRAME ' + String(frame).padStart(2, '0'), ${Math.round(width * .13)}, ${Math.round(height * .62)})
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop())
  const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer())
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return { base64: btoa(binary), mimeType }
})()`)

const fixtures = [
  { id: 'video1080', file: path.join(library, 'M1DB-1080p-30fps.webm'), target: path.join(library, 'M1DB-1080p-frame.png'), width: 1920, height: 1080, label: 'LongEdit M1D-B 1080p' },
  { id: 'video4k', file: path.join(library, 'M1DB-4K-30fps.webm'), target: path.join(library, 'M1DB-4K-frame.png'), width: 3840, height: 2160, label: 'LongEdit M1D-B 4K' },
]
for (const fixture of fixtures) {
  const generated = await generateVideo(fixture.width, fixture.height, fixture.label)
  fixture.mimeType = generated.mimeType
  await fs.writeFile(fixture.file, Buffer.from(generated.base64, 'base64'))
  fixture.sourceHashBefore = await sha256(fixture.file)
}

const auditVideo = async fixture => {
  const openMs = await elapsed(async () => {
    await navigate(fixture.file)
    await waitFor(`document.querySelector('.media-stage video')?.videoWidth === ${fixture.width} && Number.isFinite(document.querySelector('.media-stage video')?.duration)`, `${fixture.id} metadata and duration`, 1200)
  })
  const initial = await evaluate(`(() => ({
    duration: document.querySelector('.media-stage video')?.duration,
    framePrevious: Boolean(document.querySelector('[data-testid="video-frame-previous"]')),
    frameNext: Boolean(document.querySelector('[data-testid="video-frame-next"]')),
    captureEnabled: !document.querySelector('[data-testid="video-capture-frame"]')?.disabled,
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
  }))()`)
  await evaluate(`(() => { const select = document.querySelector('.frame-step-rate select'); select.value = '30'; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await evaluate(`new Promise(resolve => { const video = document.querySelector('.media-stage video'); const done = () => resolve(video.currentTime); video.addEventListener('seeked', done, { once: true }); video.currentTime = Math.min(1.1, video.duration / 2) })`)
  const beforeStep = await evaluate(`document.querySelector('.media-stage video')?.currentTime`)
  const nextMs = await elapsed(async () => {
    await evaluate(`document.querySelector('[data-testid="video-frame-next"]')?.click()`)
    await waitFor(`document.querySelector('.media-stage video')?.currentTime > ${beforeStep + 0.015}`, `${fixture.id} next frame`)
    await waitFor(`!document.querySelector('[data-testid="video-frame-next"]')?.disabled`, `${fixture.id} next frame transaction`)
  })
  const afterNext = await evaluate(`document.querySelector('.media-stage video')?.currentTime`)
  const previousMs = await elapsed(async () => {
    await evaluate(`document.querySelector('[data-testid="video-frame-previous"]')?.click()`)
    await waitFor(`document.querySelector('.media-stage video')?.currentTime < ${afterNext - 0.015}`, `${fixture.id} previous frame`)
    await waitFor(`!document.querySelector('[data-testid="video-frame-previous"]')?.disabled`, `${fixture.id} previous frame transaction`)
  })
  const afterPrevious = await evaluate(`document.querySelector('.media-stage video')?.currentTime`)
  const saveReport = await evaluate(`(async () => {
    const video = document.querySelector('.media-stage video'); video.pause()
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0)
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    return window.__TAURI_INTERNALS__.invoke('save_video_frame_png', {
      libraryRoot: ${JSON.stringify(library)}, sourcePath: ${JSON.stringify(fixture.file)}, targetPath: ${JSON.stringify(fixture.target)},
      expectedSourceSize: ${await fs.stat(fixture.file).then(value => value.size)}, expectedSourceModified: ${Math.floor((await fs.stat(fixture.file)).mtimeMs / 1000)},
      pngBase64: btoa(binary), expectedWidth: video.videoWidth, expectedHeight: video.videoHeight, mediaTime: video.currentTime,
    })
  })()`)
  const overwriteError = await evaluate(`window.__TAURI_INTERNALS__.invoke('save_video_frame_png', {
    libraryRoot: ${JSON.stringify(library)}, sourcePath: ${JSON.stringify(fixture.file)}, targetPath: ${JSON.stringify(fixture.target)},
    expectedSourceSize: ${await fs.stat(fixture.file).then(value => value.size)}, expectedSourceModified: ${Math.floor((await fs.stat(fixture.file)).mtimeMs / 1000)},
    pngBase64: 'invalid', expectedWidth: ${fixture.width}, expectedHeight: ${fixture.height}, mediaTime: 1,
  }).then(() => '', error => String(error))`)
  const screenshot = await pngDimensions(fixture.target)
  const rememberedTime = Math.min(1.2, Math.max(1.01, initial.duration - 0.7))
  await evaluate(`new Promise(resolve => { const video = document.querySelector('.media-stage video'); video.pause(); video.addEventListener('seeked', resolve, { once: true }); video.currentTime = ${rememberedTime} })`)
  await delay(250)
  await evaluate(`location.hash = '#/library'`)
  await waitFor(`document.querySelector('.library-mode')`, `${fixture.id} leave viewer`)
  await navigate(fixture.file)
  await waitFor(`document.querySelector('.media-stage video')?.videoWidth === ${fixture.width} && Math.abs(document.querySelector('.media-stage video')?.currentTime - ${rememberedTime}) < .12`, `${fixture.id} position restore`, 1200)
  const restoredTime = await evaluate(`document.querySelector('.media-stage video')?.currentTime`)
  const storagePrivacy = await evaluate(`(() => {
    const entries = Object.entries(localStorage).filter(([key]) => key.startsWith('longedit.media-position.v1.'))
    return { count: entries.length, containsPath: entries.some(([key, value]) => /[A-Z]:\\\\|M1DB-/.test(key + value)) }
  })()`)
  await capture(`${fixture.id}-desktop.jpg`)
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
  await delay(250)
  const narrow = await evaluate(`({ pageOverflow: document.documentElement.scrollWidth - innerWidth, toolbarOverflow: document.querySelector('.media-actions')?.scrollWidth - document.querySelector('.media-actions')?.clientWidth })`)
  await capture(`${fixture.id}-narrow.jpg`)
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  return {
    openMs, initial, nextMs, previousMs,
    nextDelta: afterNext - beforeStep,
    previousDelta: afterNext - afterPrevious,
    screenshot, saveReport: { ...saveReport, targetPath: undefined, outputDigest: Boolean(saveReport.outputDigest) },
    overwriteRejected: overwriteError.includes('不会覆盖'), rememberedTime, restoredTime, storagePrivacy, narrow,
  }
}

const actual = {}
for (const fixture of fixtures) actual[fixture.id] = await auditVideo(fixture)
for (const fixture of fixtures) fixture.sourceHashAfter = await sha256(fixture.file)
actual.sourceUnchanged = fixtures.every(fixture => fixture.sourceHashBefore === fixture.sourceHashAfter)
actual.runtimeErrorCount = runtimeErrors.length

const passed = fixtures.every(fixture => {
  const result = actual[fixture.id]
  return result.openMs < 10_000
    && result.initial.framePrevious && result.initial.frameNext && result.initial.captureEnabled
    && Math.abs(result.nextDelta - 1 / 30) < 0.025
    && Math.abs(result.previousDelta - 1 / 30) < 0.025
    && result.screenshot.width === fixture.width && result.screenshot.height === fixture.height
    && result.saveReport.status === 'saved_verified' && result.saveReport.sourceIdentityUnchanged && result.saveReport.targetReopened
    && result.overwriteRejected
    && Math.abs(result.restoredTime - result.rememberedTime) < 0.12
    && result.storagePrivacy.count > 0 && !result.storagePrivacy.containsPath
    && result.initial.pageOverflow <= 0 && result.narrow.pageOverflow <= 0
  }) && actual.sourceUnchanged && actual.runtimeErrorCount === 0
if (!passed) throw new Error(`M1D-B real desktop gate failed: ${JSON.stringify(actual)}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'M1D-B-video-frame-and-capture-tools',
  status: 'passed',
  expected: { frameStepSeconds: 1 / 30, screenshotMatchesSourcePixels: true, positionRestored: true, sourceUnchanged: true },
  actual,
  passed,
}, null, 2)}\n`)
socket.close()
console.log('M1D-B real video frame tools audit passed.')
