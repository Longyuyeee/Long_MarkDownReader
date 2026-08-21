import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14526'
const output = path.resolve('docs/evidence/post-v1013-small-window-ui')
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const viewports = [
  { id: 'compact', width: 900, height: 720 },
  { id: 'narrow', width: 720, height: 640 },
]
const surfaces = [
  { id: 'library', hash: '#/library', selector: '.library-mode' },
  { id: 'workspace', hash: '#/workspace', selector: '.workspace-home' },
  ...['library', 'editing', 'appearance', 'formats', 'knowledge', 'system', 'privacy', 'ai'].map(category => ({
    id: `settings-${category}`,
    hash: `#/settings?category=${category}`,
    selector: '.settings-view',
  })),
  { id: 'release-capabilities', hash: '#/release-capabilities', selector: '.release-capabilities' },
  { id: 'graph-network', hash: '#/graph?mode=network', selector: '.graph-container' },
  { id: 'graph-mindmap', hash: '#/graph?mode=mindmap', selector: '.graph-container' },
]

const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url === 'about:blank' && item.webSocketDebuggerUrl)
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
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const inspect = (selector, surfaceId) => evaluate(`(() => {
  const root = document.querySelector(${JSON.stringify(selector)})
  const rootRect = root?.getBoundingClientRect()
  const shown = element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0
  }
  const describe = element => {
    const rect = element.getBoundingClientRect()
    return {
      tag: element.tagName.toLowerCase(),
      className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
      text: (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 100),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
    }
  }
  const candidates = [...(root?.querySelectorAll('button, span, strong, small, label, summary, h1, h2, h3, .n-button__content, .n-tag__content') || [])]
    .filter(shown)
    .filter(element => (element.textContent || '').replace(/\\s+/g, '').length >= 4)
  const verticalWrap = candidates.filter(element => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.3
    return rect.width < Math.max(30, Number.parseFloat(style.fontSize) * 2.2) && rect.height > lineHeight * 1.8
  }).map(describe)
  const clippedControls = candidates.filter(element => {
    const style = getComputedStyle(element)
    const allowsScroll = ['auto', 'scroll'].includes(style.overflowX)
    const intentionalEllipsis = style.textOverflow === 'ellipsis'
    return element.scrollWidth > element.clientWidth + 3 && !allowsScroll && !intentionalEllipsis
  }).map(describe)
  const outsideViewport = candidates.filter(element => {
    const rect = element.getBoundingClientRect()
    return rect.left < -2 || rect.right > innerWidth + 2
  }).map(describe)
  const activeSettingsCategory = root?.querySelector('.settings-navigation button.active')
  const activeSettingsCategoryRect = activeSettingsCategory?.getBoundingClientRect()
  const settingsNavigationRect = root?.querySelector('.settings-navigation')?.getBoundingClientRect()
  const settingsHeadingRect = root?.querySelector('.settings-category-heading')?.getBoundingClientRect()
  return {
    surfaceId: ${JSON.stringify(surfaceId)},
    route: location.hash,
    viewport: [innerWidth, innerHeight],
    root: rootRect && { x: rootRect.x, y: rootRect.y, width: rootRect.width, height: rootRect.height, right: rootRect.right, bottom: rootRect.bottom },
    pageOverflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    pageOverflowY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    verticalWrap,
    clippedControls,
    outsideViewport,
    activeSettingsCategoryVisible: !activeSettingsCategoryRect || !settingsNavigationRect || (
      activeSettingsCategoryRect.left >= settingsNavigationRect.left - 2
      && activeSettingsCategoryRect.right <= settingsNavigationRect.right + 2
    ),
    settingsHeadingTop: settingsHeadingRect?.top,
  }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } } }`,
})

const entries = []
for (const viewport of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false })
  for (const surface of surfaces) {
    const runtimeErrorStart = runtimeErrors.length
    await send('Page.navigate', { url: `http://127.0.0.1:9000/${surface.hash}` })
    await waitFor(`document.querySelector(${JSON.stringify(surface.selector)}) !== null`, `${surface.id} root`)
    await waitFor(`document.querySelector('.page-loader') === null`, `${surface.id} loader`)
    await delay(1100)
    const geometry = await inspect(surface.selector, surface.id)
    geometry.runtimeErrors = runtimeErrors.slice(runtimeErrorStart)
    const file = `${viewport.id}-${surface.id}.jpg`
    await capture(file)
    entries.push({ viewport, surface, file, geometry })
  }
}

const failures = entries.filter(entry => entry.geometry.pageOverflowX > 2
  || entry.geometry.verticalWrap.length
  || entry.geometry.clippedControls.length
  || !entry.geometry.activeSettingsCategoryVisible
  || entry.geometry.runtimeErrors.length)
for (const viewport of viewports) {
  const headingTops = entries
    .filter(entry => entry.viewport.id === viewport.id && entry.surface.id.startsWith('settings-'))
    .map(entry => entry.geometry.settingsHeadingTop)
    .filter(Number.isFinite)
  if (headingTops.length && Math.max(...headingTops) - Math.min(...headingTops) > 2) {
    failures.push(...entries.filter(entry => entry.viewport.id === viewport.id && entry.surface.id.startsWith('settings-')))
  }
}

await fs.writeFile(path.join(output, 'discovery-report.json'), `${JSON.stringify({
  schemaVersion: 1,
  mode: 'acceptance',
  status: failures.length ? 'rejected' : 'accepted',
  viewports,
  surfaces: surfaces.map(({ id, hash }) => ({ id, hash })),
  entries,
  failureCount: failures.length,
}, null, 2)}\n`)
socket.close()
if (failures.length) throw new Error(`Small-window UI gate failed: ${failures.map(entry => `${entry.viewport.id}/${entry.surface.id}`).join(', ')}`)
console.log(`Small-window UI audit accepted ${entries.length} surfaces.`)
