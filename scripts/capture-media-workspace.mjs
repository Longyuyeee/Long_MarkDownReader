import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14430'
const output = path.resolve(process.env.LONGEDIT_MEDIA_OUTPUT || 'docs/evidence/ux43-media-workspace')
const imagePath = process.env.LONGEDIT_MEDIA_IMAGE || ''
const videoPath = process.env.LONGEDIT_MEDIA_VIDEO || ''
if (!imagePath || !videoPath) throw new Error('Media audit paths are missing')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
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
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description) => { for (let attempt = 0; attempt < 300; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const metrics = () => evaluate(`(() => { const workspace = document.querySelector('.media-workspace'); const rect = workspace?.getBoundingClientRect(); return { viewport: { width: innerWidth, height: innerHeight }, documentOverflow: document.documentElement.scrollWidth - innerWidth, workspace: rect && { width: rect.width, height: rect.height }, image: document.querySelector('.media-stage img') && { width: document.querySelector('.media-stage img').getBoundingClientRect().width, naturalWidth: document.querySelector('.media-stage img').naturalWidth }, video: document.querySelector('.media-stage video') && { readyState: document.querySelector('.media-stage video').readyState, width: document.querySelector('.media-stage video').videoWidth, height: document.querySelector('.media-stage video').videoHeight }, errorVisible: Boolean(document.querySelector('.media-state.error')) } })()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(imagePath)})`)
try {
  await waitFor(`document.querySelector('.media-stage img')?.naturalWidth === 960`, 'image preview')
} catch (error) {
  const state = await evaluate(`({ hash: location.hash, workspace: Boolean(document.querySelector('.media-workspace')), loading: Boolean(document.querySelector('.media-state')), text: document.querySelector('.media-workspace')?.innerText?.slice(0, 800), body: document.body.innerText.slice(0, 800) })`)
  throw new Error(`${error.message}: ${JSON.stringify(state)}`)
}
const imageInitial = await metrics()
await evaluate(`document.querySelector('button[title="向右旋转"]')?.click(); document.querySelector('button[title="放大"]')?.click()`)
await delay(200)
const imageEdited = await metrics()
await capture('image-preview.png')

const webmBase64 = await evaluate(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
  const context = canvas.getContext('2d'); const stream = canvas.captureStream(12)
  const preferred = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
  if (!preferred) throw new Error('WebM MediaRecorder is unavailable')
  const chunks = []; const recorder = new MediaRecorder(stream, { mimeType: preferred })
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise(resolve => recorder.onstop = resolve); recorder.start(100)
  for (let frame = 0; frame < 18; frame += 1) { context.fillStyle = frame % 2 ? '#17375e' : '#0f766e'; context.fillRect(0,0,640,360); context.fillStyle = '#f6c453'; context.font = 'bold 42px sans-serif'; context.fillText('LongEdit Media', 150, 170); context.fillStyle = '#ffffff'; context.font = '24px sans-serif'; context.fillText('WebM runtime audit', 205, 215); await new Promise(resolve => setTimeout(resolve, 60)) }
  recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop())
  const bytes = new Uint8Array(await new Blob(chunks, { type: preferred }).arrayBuffer())
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
})()`)
await fs.writeFile(videoPath, Buffer.from(webmBase64, 'base64'))
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(videoPath)})`)
await waitFor(`document.querySelector('.media-stage video')?.readyState >= 1`, 'video metadata')
const video = await metrics()
await capture('video-preview.png')

await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
await delay(250)
const narrow = await metrics()
await capture('video-narrow.png')

const passed = imageInitial.documentOverflow <= 2 && imageInitial.image?.naturalWidth === 960
  && imageEdited.image?.width !== imageInitial.image?.width
  && video.video?.readyState >= 1 && video.video?.width === 640
  && narrow.documentOverflow <= 2 && !narrow.errorVisible && runtimeErrors.length === 0
if (!passed) throw new Error(`Media runtime gate failed: ${JSON.stringify({ imageInitial, imageEdited, video, narrow, runtimeErrors })}`)
const evidence = { schemaVersion: 1, stage: 'UX-43', imageInitial, imageEdited, video, narrow, runtimeErrorCount: runtimeErrors.length, sourceUserContentIncluded: false, passed }
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['image-preview.png', 'video-preview.png', 'video-narrow.png']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-43', status: 'accepted', evidenceFile: 'runtime-evidence.json', screenshots, sourceUserContentIncluded: false }, null, 2)}\n`)
socket.close()
console.log('UX-43 media workspace runtime capture passed.')
