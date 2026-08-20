import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14520'
const output = path.resolve('docs/evidence/p2b-image-color-adjustments')
const library = process.env.LONGEDIT_IMAGE_EDITOR_LIBRARY
const sourcePath = process.env.LONGEDIT_IMAGE_EDITOR_SOURCE
const targetPath = process.env.LONGEDIT_IMAGE_EDITOR_TARGET
if (!library || !sourcePath || !targetPath) throw new Error('P2-B audit paths are missing')

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
const waitFor = async (expression, description) => {
  for (let index = 0; index < 1200; index += 1) { if (await evaluate(expression)) return; await delay(100) }
  const state = await evaluate(`({ href: location.href, title: document.title, text: document.body?.innerText?.slice(0, 500), html: document.body?.innerHTML?.slice(0, 500) })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const metrics = () => evaluate(`(() => {
  const panel = document.querySelector('.image-editor')?.getBoundingClientRect()
  const stage = document.querySelector('.media-stage')?.getBoundingClientRect()
  const image = document.querySelector('.media-stage img')
  const adjustments = Object.fromEntries([...document.querySelectorAll('.quality-control')].map(label => [label.textContent.trim().split(/\\s/)[0], Number(label.querySelector('input')?.value)]))
  return { viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth - innerWidth,
    panel: panel && { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
    stage: stage && { x: stage.x, y: stage.y, width: stage.width, height: stage.height },
    filter: image?.style.filter || '', adjustments,
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
await waitFor(`document.querySelectorAll('.quality-control input').length === 3`, 'color controls')
await evaluate(`(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  const controls = [...document.querySelectorAll('.quality-control')]
  const set = (name, value) => { const input = controls.find(label => label.textContent.includes(name))?.querySelector('input'); setter.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true })) }
  set('亮度', 20); set('对比度', 15); set('饱和度', 0)
})()`)
await delay(250)
const wide = await metrics(); await capture('color-adjustments-wide.png')
const saveReport = await evaluate(`(async () => {
  const identity = await window.__TAURI_INTERNALS__.invoke('inspect_image_edit_source', { libraryRoot: ${JSON.stringify(library)}, path: ${JSON.stringify(sourcePath)} })
  return await window.__TAURI_INTERNALS__.invoke('save_image_transform_copy', { libraryRoot: ${JSON.stringify(library)}, sourcePath: ${JSON.stringify(sourcePath)}, targetPath: ${JSON.stringify(targetPath)}, expectedSourceDigest: identity.sourceDigest,
    transform: { quarterTurns: 0, flipHorizontal: false, flipVertical: false, crop: null, width: null, height: null, jpegQuality: null, brightness: 20, contrast: 15, saturation: 0, normalizeOrientation: true } })
})()`)
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false }); await delay(250)
const narrow = await metrics()
await evaluate(`[...document.querySelectorAll('.image-editor section')].find(section => section.textContent.includes('色彩调整'))?.scrollIntoView({ block: 'start' })`)
await delay(150); await capture('color-adjustments-narrow.png')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(targetPath)})`)
await waitFor(`document.querySelector('.media-stage img')?.naturalWidth === 960 && document.querySelector('.media-stage img')?.naturalHeight === 540`, 'saved copy reopen')

const expectedAdjustments = wide.adjustments['亮度'] === 20 && wide.adjustments['对比度'] === 15 && wide.adjustments['饱和度'] === 0
const passed = wide.overflow <= 2 && wide.panel?.width >= 280 && expectedAdjustments
  && wide.filter.includes('brightness(120%)') && wide.filter.includes('contrast(115%)') && wide.filter.includes('saturate(0%)')
  && wide.saveEnabled && !wide.errorVisible && narrow.overflow <= 2 && narrow.panel?.width >= 500 && narrow.panel?.y > narrow.stage?.y
  && saveReport.status === 'saved_verified' && saveReport.brightness === 20 && saveReport.contrast === 15 && saveReport.saturation === 0
  && saveReport.sourceUnchanged && saveReport.targetReopened && runtimeErrors.length === 0
if (!passed) throw new Error(`P2-B runtime gate failed: ${JSON.stringify({ wide, narrow, saveReport, runtimeErrors })}`)

const safeReport = { status: saveReport.status, sourceDigest: saveReport.sourceDigest, outputDigest: saveReport.outputDigest,
  outputWidth: saveReport.outputWidth, outputHeight: saveReport.outputHeight, outputMimeType: saveReport.outputMimeType,
  brightness: saveReport.brightness, contrast: saveReport.contrast, saturation: saveReport.saturation,
  metadataRemoved: saveReport.metadataRemoved, sourceUnchanged: saveReport.sourceUnchanged, targetReopened: saveReport.targetReopened }
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'P2-B', wide, narrow, saveReport: safeReport, runtimeErrorCount: runtimeErrors.length, sourceUserContentIncluded: false, passed }, null, 2)}\n`)
const screenshots = []
for (const file of ['color-adjustments-wide.png', 'color-adjustments-narrow.png']) {
  const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'P2-B', status: 'accepted', screenshots, sourceUserContentIncluded: false }, null, 2)}\n`)
socket.close()
console.log('P2-B image color adjustment desktop capture passed.')
