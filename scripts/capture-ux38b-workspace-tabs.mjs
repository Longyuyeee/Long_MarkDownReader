import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14400'
const output = path.resolve(process.env.LONGEDIT_UX38B_AUDIT_OUTPUT || 'docs/evidence/ux38b-workspace-tabs')
const sourceCommit = process.env.LONGEDIT_UX38B_SOURCE_COMMIT || ''
const samples = JSON.parse(process.env.LONGEDIT_UX38B_SAMPLES || '[]')
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || samples.length !== 12) throw new Error('UX-38B environment is incomplete')
const surfaces = {
  'plain-text': ['.text-workspace', '.cm-editor'], javascript: ['.text-workspace', '.cm-editor'], typescript: ['.text-workspace', '.cm-editor'], python: ['.text-workspace', '.cm-editor'],
  json: ['.json-workspace', '.cm-editor'], jsonc: ['.json-workspace', '.cm-editor'], yaml: ['.yaml-workspace', '.cm-editor'], xml: ['.xml-workspace', '.cm-editor'],
  toml: ['.toml-workspace', '.cm-editor'], log: ['.log-workspace', '.log-stage'], 'web-source': ['.text-workspace', '.cm-editor'], sql: ['.text-workspace', '.cm-editor'],
}
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description, attempts = 300) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }
const center = selector => evaluate(`(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
for (const sample of samples) {
  const [root, ready] = surfaces[sample.id]
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(sample.path)})`)
  await waitFor(`document.querySelector(${JSON.stringify(root)})?.textContent?.includes(${JSON.stringify(sample.file)}) === true && document.querySelector(${JSON.stringify(`${root} ${ready}`)}) && !document.querySelector('.page-loader')`, `${sample.id} tab`)
  await delay(180)
}
const tabsRoot = '.tabs-bar > .workspace-tabs'
const tabsSelector = `${tabsRoot} .workspace-tab`
const scrollerSelector = `${tabsRoot} .workspace-tabs-scroll`

await waitFor(`document.querySelectorAll('${tabsSelector}').length === 12`, 'twelve workspace tabs')
await evaluate(`document.querySelector('${scrollerSelector}').scrollLeft = 0`)
await delay(350)

const metrics = await evaluate(`(() => {
  const scroller = document.querySelector('${scrollerSelector}')
  const tabs = [...document.querySelectorAll('${tabsSelector}')]
  const spans = tabs.map(tab => tab.querySelector('span').getBoundingClientRect().width)
  const widths = tabs.map(tab => tab.getBoundingClientRect().width)
  return {
    tabCount: tabs.length, minTabWidth: Math.min(...widths), minTextWidth: Math.min(...spans),
    overflow: scroller.scrollWidth > scroller.clientWidth, scrollbarWidth: getComputedStyle(scroller).scrollbarWidth,
    leftButtonDisabled: document.querySelector('${tabsRoot} .scroll-left').disabled,
    rightButtonEnabled: !document.querySelector('${tabsRoot} .scroll-right').disabled,
  }
})()`)
if (metrics.tabCount !== 12 || metrics.minTabWidth < 156 || metrics.minTextWidth < 66 || !metrics.overflow || metrics.scrollbarWidth !== 'none' || !metrics.leftButtonDisabled || !metrics.rightButtonEnabled) throw new Error(`Initial tab gate failed: ${JSON.stringify(metrics)}`)
await capture('wide-tabs-start.jpg')

const wheelPoint = await center(scrollerSelector)
const beforeWheel = await evaluate(`document.querySelector('${scrollerSelector}').scrollLeft`)
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wheelPoint.x, y: wheelPoint.y, deltaX: 0, deltaY: 320 })
await delay(450)
const afterWheel = await evaluate(`document.querySelector('${scrollerSelector}').scrollLeft`)
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wheelPoint.x, y: wheelPoint.y, deltaX: 0, deltaY: 240, modifiers: 8 })
await delay(450)
const afterShiftWheel = await evaluate(`document.querySelector('${scrollerSelector}').scrollLeft`)
const beforeArrow = afterShiftWheel
await evaluate(`document.querySelector('${tabsRoot} .scroll-right').click()`)
await delay(450)
const afterArrow = await evaluate(`document.querySelector('${scrollerSelector}').scrollLeft`)
await capture('wide-tabs-scrolled.jpg')

const targetTabText = await evaluate(`document.querySelectorAll('${tabsSelector}')[11].textContent`)
await evaluate(`document.querySelector('${scrollerSelector}').scrollLeft = 0; document.querySelectorAll('${tabsSelector}')[11].click()`)
await waitFor(`document.querySelector('${tabsSelector}.active')?.textContent === ${JSON.stringify(targetTabText)}`, 'selected tab to become active')
await delay(500)
const activeReveal = await evaluate(`(() => { const scroller = document.querySelector('${scrollerSelector}').getBoundingClientRect(); const active = document.querySelector('${tabsSelector}.active').getBoundingClientRect(); return active.left >= scroller.left - 1 && active.right <= scroller.right + 1 })()`)

await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(500)
const narrowStable = await evaluate(`(() => { const root = document.querySelector('${tabsRoot}').getBoundingClientRect(); const active = document.querySelector('${tabsSelector}.active').getBoundingClientRect(); return root.right <= innerWidth + 1 && active.width >= 156 && document.documentElement.scrollWidth <= innerWidth + 2 })()`)
await capture('narrow-active-tab.jpg')

await evaluate(`document.querySelector('${tabsSelector}.active').focus()`)
const activeBeforeKeyboard = await evaluate(`document.querySelector('${tabsSelector}.active')?.textContent`)
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
await delay(500)
const activeAfterKeyboard = await evaluate(`document.querySelector('${tabsSelector}.active')?.textContent`)

const evidence = {
  schemaVersion: 1, stage: 'UX-38B', sourceCommit, ...metrics,
  wheelScrollChanged: afterWheel > beforeWheel + 2,
  shiftWheelScrollChanged: afterShiftWheel > afterWheel + 2,
  arrowScrollChanged: afterArrow > beforeArrow + 2,
  activeTabRevealed: activeReveal,
  narrowViewportStable: narrowStable,
  keyboardNavigationChanged: activeAfterKeyboard !== activeBeforeKeyboard,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.n-modal-mask, .error-boundary'))`),
  sourceUserContentIncluded: false, releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['wide-tabs-start.jpg', 'wide-tabs-scrolled.jpg', 'narrow-active-tab.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-38B', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`UX-38B workspace tabs captured with ${runtimeErrors.length} runtime errors.`)
