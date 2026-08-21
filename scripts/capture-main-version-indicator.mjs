import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14522'
const output = path.resolve('docs/evidence/main-version-indicator')
const expectedVersion = JSON.parse(await fs.readFile('package.json', 'utf8')).version
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target) throw new Error('LongEdit WebView target was not found')

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
const waitFor = async (expression, description) => {
  for (let index = 0; index < 600; index += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async (file, clip) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...(clip ? { clip } : {}) })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const metrics = () => evaluate(`(() => {
  const footer = document.querySelector('.sidebar-footer')
  const sidebar = document.querySelector('.sidebar')
  const badge = document.querySelector('[data-testid="main-app-version"]')
  const info = document.querySelector('.lib-info-box')
  const footerRect = footer?.getBoundingClientRect()
  const badgeRect = badge?.getBoundingClientRect()
  const infoRect = info?.getBoundingClientRect()
  const sidebarRect = sidebar?.getBoundingClientRect()
  return {
    viewport: [innerWidth, innerHeight],
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    sidebarWidth: sidebarRect?.width,
    text: badge?.textContent?.trim(),
    title: badge?.getAttribute('title'),
    label: document.querySelector('.lib-label')?.textContent?.trim(),
    footer: footerRect && { x: footerRect.x, y: footerRect.y, width: footerRect.width, height: footerRect.height, right: footerRect.right, bottom: footerRect.bottom },
    badge: badgeRect && { x: badgeRect.x, y: badgeRect.y, width: badgeRect.width, height: badgeRect.height, right: badgeRect.right, bottom: badgeRect.bottom },
    info: infoRect && { x: infoRect.x, width: infoRect.width, right: infoRect.right },
  }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('[data-testid="main-app-version"]')?.textContent?.trim() === 'v${expectedVersion}'`, 'main version indicator')
await delay(300)
const normal = await metrics()
await capture('main-version-indicator-wide.png')
await capture('main-version-indicator-detail.png', {
  x: Math.max(0, normal.footer.x - 12),
  y: Math.max(0, normal.footer.y - 18),
  width: Math.min(390, 1280 - Math.max(0, normal.footer.x - 12)),
  height: Math.min(130, 800 - Math.max(0, normal.footer.y - 18)),
  scale: 1,
})

await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: normal.sidebarWidth, y: 300, button: 'left', buttons: 1, clickCount: 1 })
for (let x = normal.sidebarWidth - 8; x >= 220; x -= 8) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 300, button: 'left', buttons: 1 })
  await delay(20)
}
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 220, y: 300, button: 'left', buttons: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 220, y: 300, button: 'left', buttons: 0, clickCount: 1 })
await delay(250)
const compact = await metrics()

const contained = state => state.badge.x >= state.footer.x
  && state.badge.right <= state.footer.right
  && state.badge.y >= state.footer.y
  && state.badge.bottom <= state.footer.bottom
const passed = normal.text === `v${expectedVersion}`
  && normal.title === `当前软件版本 v${expectedVersion}`
  && normal.label === '当前资料库'
  && normal.pageOverflow <= 2
  && compact.pageOverflow <= 2
  && contained(normal)
  && contained(compact)
  && normal.sidebarWidth >= 250
  && compact.sidebarWidth <= 222
  && compact.sidebarWidth < normal.sidebarWidth
  && compact.info.width > 70
  && runtimeErrors.length === 0
if (!passed) throw new Error(`Main version indicator runtime gate failed: ${JSON.stringify({ normal, compact, runtimeErrors })}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  status: 'accepted',
  expected: { version: expectedVersion, placement: 'sidebar-library-footer', normalAndCompactContainment: true },
  actual: { normal, compact, runtimeErrorCount: runtimeErrors.length },
  passed,
}, null, 2)}\n`)
socket.close()
console.log('Main version indicator desktop capture passed.')
