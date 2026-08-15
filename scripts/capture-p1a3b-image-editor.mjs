import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14513'
const output = path.resolve('docs/evidence/p1a3b-image-editor')
const library = process.env.LONGEDIT_IMAGE_EDITOR_LIBRARY
const sourcePath = process.env.LONGEDIT_IMAGE_EDITOR_SOURCE
const targetPath = process.env.LONGEDIT_IMAGE_EDITOR_TARGET
if (!library || !sourcePath || !targetPath) throw new Error('P1-A3B audit paths are missing')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target) throw new Error('LongEdit WebView target was not found')
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
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description) => { for (let index = 0; index < 300; index += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const metrics = () => evaluate(`(() => {
  const panel = document.querySelector('.image-editor')?.getBoundingClientRect()
  const stage = document.querySelector('.media-stage')?.getBoundingClientRect()
  const crop = [...document.querySelectorAll('.crop-grid input')].map(input => Number(input.value))
  const size = [...document.querySelectorAll('.dimension-grid input')].map(input => Number(input.value))
  return { viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth - innerWidth,
    panel: panel && { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
    stage: stage && { x: stage.x, y: stage.y, width: stage.width, height: stage.height }, crop, size,
    quality: Number(document.querySelector('.quality-control input')?.value),
    privacy: document.querySelector('.privacy-note')?.textContent?.trim(),
    saveEnabled: !document.querySelector('[data-testid="image-save-copy"]')?.disabled,
    errorVisible: Boolean(document.querySelector('.editor-state.error,.edit-message.error')) }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(sourcePath)})`)
await waitFor(`document.querySelector('.media-stage img')?.naturalWidth === 960`, 'source image')
await evaluate(`document.querySelector('[data-testid="image-edit-toggle"]')?.click()`)
await waitFor(`document.querySelectorAll('.crop-grid input').length === 4`, 'crop controls')
await evaluate(`(() => {
  const set = (input, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true })) }
  const crop = document.querySelectorAll('.crop-grid input'); [120, 60, 600, 360].forEach((value, index) => set(crop[index], value))
})()`)
await delay(100)
await evaluate(`(() => {
  const size = document.querySelectorAll('.dimension-grid input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(size[0], '300'); size[0].dispatchEvent(new Event('input', { bubbles: true }))
  const format = document.querySelector('#image-output-format'); format.value = 'jpg'; format.dispatchEvent(new Event('change', { bubbles: true }))
})()`)
await waitFor(`document.querySelector('.quality-control input')`, 'JPEG quality control')
await evaluate(`(() => { const input = document.querySelector('.quality-control input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '72'); input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await delay(250)
const wide = await metrics(); await capture('image-editor-wide.png')
const saveReport = await evaluate(`(async () => {
  const identity = await window.__TAURI_INTERNALS__.invoke('inspect_image_edit_source', { libraryRoot: ${JSON.stringify(library)}, path: ${JSON.stringify(sourcePath)} })
  return await window.__TAURI_INTERNALS__.invoke('save_image_transform_copy', { libraryRoot: ${JSON.stringify(library)}, sourcePath: ${JSON.stringify(sourcePath)}, targetPath: ${JSON.stringify(targetPath)}, expectedSourceDigest: identity.sourceDigest,
    transform: { quarterTurns: 0, flipHorizontal: false, flipVertical: false, crop: { x: 120, y: 60, width: 600, height: 360 }, width: 300, height: 180, jpegQuality: 72, normalizeOrientation: true } })
})()`)
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false }); await delay(250)
const narrow = await metrics(); await capture('image-editor-narrow.png')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(targetPath)})`)
await waitFor(`document.querySelector('.media-stage img')?.naturalWidth === 300 && document.querySelector('.media-stage img')?.naturalHeight === 180`, 'saved copy reopen')

const passed = wide.overflow <= 2 && wide.panel?.width >= 280 && wide.crop.join('x') === '120x60x600x360' && wide.size.join('x') === '300x180'
  && wide.quality === 72 && wide.privacy?.includes('EXIF') && wide.saveEnabled && !wide.errorVisible
  && narrow.overflow <= 2 && narrow.panel?.width >= 500 && narrow.panel?.y > narrow.stage?.y && !narrow.errorVisible
  && saveReport.status === 'saved_verified' && saveReport.outputWidth === 300 && saveReport.outputHeight === 180
  && saveReport.jpegQuality === 72 && saveReport.orientationNormalized && saveReport.metadataRemoved
  && saveReport.sourceUnchanged && saveReport.targetReopened && runtimeErrors.length === 0
if (!passed) throw new Error(`P1-A3B runtime gate failed: ${JSON.stringify({ wide, narrow, saveReport, runtimeErrors })}`)

const safeReport = {
  status: saveReport.status,
  sourceDigest: saveReport.sourceDigest,
  outputDigest: saveReport.outputDigest,
  sourceWidth: saveReport.sourceWidth,
  sourceHeight: saveReport.sourceHeight,
  outputWidth: saveReport.outputWidth,
  outputHeight: saveReport.outputHeight,
  outputMimeType: saveReport.outputMimeType,
  outputBytes: saveReport.outputBytes,
  jpegQuality: saveReport.jpegQuality,
  orientationNormalized: saveReport.orientationNormalized,
  metadataRemoved: saveReport.metadataRemoved,
  sourceUnchanged: saveReport.sourceUnchanged,
  targetReopened: saveReport.targetReopened,
}
const evidence = { schemaVersion: 1, stage: 'P1-A3B', wide, narrow, saveReport: safeReport, runtimeErrorCount: runtimeErrors.length, sourceUserContentIncluded: false, passed }
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['image-editor-wide.png', 'image-editor-narrow.png']) {
  const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'P1-A3B', status: 'accepted', screenshots, sourceUserContentIncluded: false }, null, 2)}\n`)
socket.close()
console.log('P1-A3B image editor runtime capture passed.')
