import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14521'
const output = path.resolve('docs/evidence/p2c-image-navigation')
const sourcePath = process.env.LONGEDIT_IMAGE_NAVIGATION_SOURCE
if (!sourcePath) throw new Error('P2-C source path is missing')

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
  const state = await evaluate(`({ href: location.href, text: document.body?.innerText?.slice(0, 500), crash: document.querySelector('#crash-info')?.textContent })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const metrics = () => evaluate(`(() => {
  const stage = document.querySelector('.media-stage')
  const image = document.querySelector('.media-stage img')
  const rect = stage?.getBoundingClientRect(); const imageRect = image?.getBoundingClientRect()
  return { viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth - innerWidth,
    scale: Number(document.querySelector('.scale-value')?.textContent?.replace('%','')) / 100,
    stage: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop, scrollWidth: stage.scrollWidth, scrollHeight: stage.scrollHeight },
    image: imageRect && { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height },
    cursor: getComputedStyle(stage).cursor, runtimeState: document.querySelector('.media-state.error')?.textContent || '' }
})()`)
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra })
const doubleClick = async (x, y) => {
  await mouse('mousePressed', x, y, { clickCount: 2 }); await mouse('mouseReleased', x, y, { clickCount: 2 }); await delay(180)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(sourcePath)})`)
await waitFor(`document.querySelector('.media-stage img')?.naturalWidth === 2400`, 'large source image')
await delay(200)
const initial = await metrics()
const anchor = { x: initial.stage.x + initial.stage.width * 0.62, y: initial.stage.y + initial.stage.height * 0.56 }
const beforeNormalized = { x: (anchor.x - initial.image.x) / initial.image.width, y: (anchor.y - initial.image.y) / initial.image.height }
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: anchor.x, y: anchor.y, deltaX: 0, deltaY: -720 })
await waitFor(`Number(document.querySelector('.scale-value')?.textContent?.replace('%','')) >= 120`, 'wheel zoom above 120 percent')
await delay(180)
const zoomed = await metrics()
const afterNormalized = { x: (anchor.x - zoomed.image.x) / zoomed.image.width, y: (anchor.y - zoomed.image.y) / zoomed.image.height }
const anchorDrift = { x: Math.abs(afterNormalized.x - beforeNormalized.x), y: Math.abs(afterNormalized.y - beforeNormalized.y) }

const dragStart = { x: zoomed.stage.x + zoomed.stage.width * 0.56, y: zoomed.stage.y + zoomed.stage.height * 0.54 }
await mouse('mousePressed', dragStart.x, dragStart.y, { clickCount: 1 })
await mouse('mouseMoved', dragStart.x - 150, dragStart.y - 100, { buttons: 1 })
await mouse('mouseReleased', dragStart.x - 150, dragStart.y - 100, { clickCount: 1 })
await delay(180)
const panned = await metrics(); await capture('image-navigation-zoom-pan-wide.png')

await doubleClick(anchor.x, anchor.y)
const actualSize = await metrics()
await doubleClick(anchor.x, anchor.y)
const fittedAgain = await metrics()

await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false }); await delay(250)
const narrowInitial = await metrics()
const narrowAnchor = { x: narrowInitial.stage.x + narrowInitial.stage.width * 0.5, y: narrowInitial.stage.y + narrowInitial.stage.height * 0.5 }
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: narrowAnchor.x, y: narrowAnchor.y, deltaX: 0, deltaY: -520 })
await delay(220)
const narrowZoomed = await metrics(); await capture('image-navigation-narrow.png')

const passed = initial.scale < 1 && zoomed.scale >= 1.2 && anchorDrift.x <= 0.06 && anchorDrift.y <= 0.06
  && panned.stage.scrollLeft > zoomed.stage.scrollLeft + 100 && panned.stage.scrollTop > zoomed.stage.scrollTop + 60
  && actualSize.scale === 1 && fittedAgain.scale < 1
  && initial.overflow <= 2 && narrowZoomed.overflow <= 2 && narrowZoomed.scale > narrowInitial.scale
  && panned.cursor === 'grab' && runtimeErrors.length === 0 && !panned.runtimeState
if (!passed) throw new Error(`P2-C runtime gate failed: ${JSON.stringify({ initial, zoomed, beforeNormalized, afterNormalized, anchorDrift, panned, actualSize, fittedAgain, narrowInitial, narrowZoomed, runtimeErrors })}`)

const evidence = { schemaVersion: 1, stage: 'P2-C', status: 'accepted', expected: { cursorAnchoredWheelZoom: true, dragPanBothAxes: true, doubleClickActualAndFit: true, wideNarrowNoPageOverflow: true },
  actual: { initial, zoomed, anchorDrift, panned, actualSize, fittedAgain, narrowInitial, narrowZoomed }, runtimeErrorCount: runtimeErrors.length, sourceUserContentIncluded: false, passed }
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['image-navigation-zoom-pan-wide.png', 'image-navigation-narrow.png']) {
  const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'P2-C', status: 'accepted', screenshots, sourceUserContentIncluded: false }, null, 2)}\n`)
socket.close()
console.log('P2-C real mouse image navigation capture passed.')
