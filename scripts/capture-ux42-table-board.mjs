import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14420'
const output = path.resolve(process.env.LONGEDIT_UX42_OUTPUT || 'docs/evidence/ux42-table-board')
const tablePath = process.env.LONGEDIT_UX42_TABLE || ''
const sourceSha = process.env.LONGEDIT_UX42_SOURCE_SHA || ''
if (!tablePath || !/^[0-9a-f]{64}$/i.test(sourceSha)) throw new Error('UX-42 environment is incomplete')

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
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }
const clickText = async (selector, text) => {
  const point = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && item.textContent?.trim().includes(${JSON.stringify(text)}) }); if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })()`)
  if (!point) throw new Error(`Clickable text was not found: ${text}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const layoutMetrics = () => evaluate(`(() => {
  const root = document.querySelector('.table-view')
  const rootRect = root.getBoundingClientRect()
  const visible = node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 }
  const chromeSelectors = ['.view-tabs', '.view-create-menu summary', '.board-config-bar', '.board-config-main', '.board-field-picker summary', '.board-field-menu']
  const chromeNodes = chromeSelectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(visible).map(node => ({ selector, rect: node.getBoundingClientRect() })))
  const chromeOffenders = chromeNodes.filter(item => item.rect.left < rootRect.left - 1 || item.rect.right > rootRect.right + 1 || item.rect.width > rootRect.width + 1).map(item => ({ selector: item.selector, left: item.rect.left, right: item.rect.right, width: item.rect.width }))
  const boardScroll = document.querySelector('.board-scroll')
  const boardWidth = boardScroll?.clientWidth || rootRect.width
  const oversizedBoardItems = ['.board-column', '.board-card', '.board-card-field', '.board-card-field textarea'].flatMap(selector =>
    [...document.querySelectorAll(selector)].filter(visible).map(node => ({ selector, width: node.getBoundingClientRect().width, parentWidth: node.parentElement?.getBoundingClientRect().width || boardWidth, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }))
  ).filter(item => item.width > boardWidth + 1 || item.width > item.parentWidth + 1 || item.scrollWidth > item.clientWidth + 2)
  const textStyles = selector => { const node = document.querySelector(selector); const style = node && getComputedStyle(node); return style ? { overflow: style.overflow, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace } : null }
  return {
    viewport: { width: innerWidth, height: innerHeight },
    documentOverflow: document.documentElement.scrollWidth - innerWidth,
    chromeOffenderCount: chromeOffenders.length,
    chromeOffenders: chromeOffenders.slice(0, 20),
    oversizedBoardItemCount: oversizedBoardItems.length,
    oversizedBoardItems: oversizedBoardItems.slice(0, 20),
    boardColumnCount: document.querySelectorAll('.board-column').length,
    boardCardCount: document.querySelectorAll('.board-card').length,
    visibleCardFieldCount: document.querySelectorAll('.board-card-field').length,
    viewTabStyle: textStyles('.view-tab-main span'),
    boardColumnTitleStyle: textStyles('.board-column > header strong'),
    cardTitleStyle: textStyles('.board-card-title strong'),
    textareaWrap: getComputedStyle(document.querySelector('.board-card-field textarea')).overflowWrap,
  }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(tablePath)})`)
await waitFor(`document.querySelector('.table-view .table-scroll') && document.querySelector('.table-title')?.textContent?.includes('UX42 Board Stress.table.json')`, 'Open Table grid')
await clickText('.view-create-menu summary', '新建视图')
await clickText('.view-create-menu button', '看板')
await waitFor(`document.querySelector('.board-config-bar') && document.querySelectorAll('.board-card').length === 11`, 'board workspace')
await delay(300)
const desktop = await layoutMetrics()
await capture('board-desktop.png')

await evaluate(`document.querySelector('.board-field-picker').open = true`)
await waitFor(`document.querySelector('.board-field-menu')?.getBoundingClientRect().height > 0`, 'field picker')
const fieldPicker = await layoutMetrics()
await capture('board-field-picker.png')
await evaluate(`document.querySelector('.board-field-picker').open = false`)

await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(400)
const narrow = await layoutMetrics()
await capture('board-narrow.png')

const passed = [desktop, fieldPicker, narrow].every(item => item.documentOverflow <= 2 && item.chromeOffenderCount === 0 && item.oversizedBoardItemCount === 0)
  && desktop.boardCardCount === 11
  && desktop.viewTabStyle?.textOverflow === 'ellipsis'
  && desktop.boardColumnTitleStyle?.textOverflow === 'ellipsis'
  && desktop.textareaWrap === 'anywhere'
  && runtimeErrors.length === 0
if (!passed) throw new Error(`UX-42 board layout gate failed: ${JSON.stringify({ desktop, fieldPicker, narrow, runtimeErrors })}`)

const evidence = { schemaVersion: 1, stage: 'UX-42', sourceSha256: sourceSha.toLowerCase(), desktop, fieldPicker, narrow, runtimeErrorCount: runtimeErrors.length, sourceUserContentIncluded: false, passed }
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['board-desktop.png', 'board-field-picker.png', 'board-narrow.png']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-42', status: 'captured-pending-visual-review', sourceSha256: sourceSha.toLowerCase(), evidenceFile: 'interaction-evidence.json', screenshots, sourceUserContentIncluded: false }, null, 2)}\n`)
socket.close()
console.log('UX-42 Table board runtime capture passed.')
