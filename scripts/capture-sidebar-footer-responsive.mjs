import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14525'
const output = path.resolve('docs/evidence/post-v1013-sidebar-footer-responsive')
const expectedVersion = JSON.parse(await fs.readFile('package.json', 'utf8')).version
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url === 'about:blank')
if (!target) throw new Error('Isolated browser target was not found')

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
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    runtimeErrors.push(message.params.args?.map(argument => argument.value || argument.description || '').join(' ') || 'Console error')
  }
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Browser log error')
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
  for (let index = 0; index < 400; index += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const metrics = () => evaluate(`(() => {
  const pick = selector => document.querySelector(selector)
  const rect = element => {
    const value = element?.getBoundingClientRect()
    return value && { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom }
  }
  const footer = pick('.sidebar-footer')
  const label = pick('.lib-label')
  const name = pick('.meta-path')
  const badge = pick('[data-testid="main-app-version"]')
  const sidebar = pick('.sidebar')
  return {
    viewport: [innerWidth, innerHeight],
    sidebar: rect(sidebar),
    footer: rect(footer),
    label: { ...rect(label), text: label?.textContent?.trim(), whiteSpace: getComputedStyle(label).whiteSpace },
    name: rect(name),
    badge: { ...rect(badge), text: badge?.textContent?.trim() },
    statusDotDisplay: getComputedStyle(pick('.lib-status-dot')).display,
    chevronDisplay: getComputedStyle(pick('.footer-chevron')).display,
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
  }
})()`)
const contained = (child, parent) => child.x >= parent.x && child.right <= parent.right && child.y >= parent.y && child.bottom <= parent.bottom

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } } }`,
})
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 720, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://127.0.0.1:9000/#/library' })
await waitFor(`document.querySelector('[data-testid="main-app-version"]')?.textContent?.trim() === 'v${expectedVersion}'`, 'responsive library footer')
await delay(250)
const narrow = await metrics()
await capture('sidebar-footer-900x720.png')

const passed = narrow.sidebar.width <= 202
  && narrow.footer.height <= 74
  && narrow.label.text === '当前资料库'
  && narrow.label.whiteSpace === 'nowrap'
  && narrow.label.height <= 18
  && narrow.badge.text === `v${expectedVersion}`
  && contained(narrow.label, narrow.footer)
  && contained(narrow.name, narrow.footer)
  && contained(narrow.badge, narrow.footer)
  && narrow.statusDotDisplay === 'none'
  && narrow.chevronDisplay === 'none'
  && narrow.pageOverflow <= 2
  && runtimeErrors.length === 0
if (!passed) throw new Error(`Responsive sidebar footer audit failed: ${JSON.stringify({ narrow, runtimeErrors })}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  status: 'accepted',
  expected: { viewport: [900, 720], sidebarMaximumWidthPx: 202, footerMaximumHeightPx: 74, singleLineLabel: true },
  actual: { narrow, runtimeErrorCount: runtimeErrors.length },
  passed,
}, null, 2)}\n`)
socket.close()
console.log('Responsive sidebar footer browser audit passed.')
