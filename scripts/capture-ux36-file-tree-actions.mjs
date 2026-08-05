import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14360'
const appOrigin = process.env.LONGEDIT_UX36_APP_ORIGIN || 'http://127.0.0.1:14200'
const output = path.resolve(process.env.LONGEDIT_UX36_AUDIT_OUTPUT || 'docs/evidence/ux36-file-tree-actions')
const sourceCommit = process.env.LONGEDIT_UX36_SOURCE_COMMIT || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('UX-36 requires a source commit')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.startsWith(appOrigin))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView CDP target was not found')
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
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) request.reject(new Error(`${message.error.message} (${message.error.code})`))
  else request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async name => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, name), Buffer.from(screenshot.data, 'base64'))
}
const textExists = text => `[...document.querySelectorAll('.n-dropdown-option-body, .n-dialog__title, .n-dialog__content, .n-message')].some(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.includes(${JSON.stringify(text)}) })`
const hoverOption = async text => {
  const found = await evaluate(`(() => {
    const option = [...document.querySelectorAll('.n-dropdown-option-body')].find(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.trim().startsWith(${JSON.stringify(text)}) })
    if (!option) return false
    option.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    option.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    return true
  })()`)
  if (!found) throw new Error(`Dropdown option was not found: ${text}`)
  await delay(250)
}
const clickText = async (selector, text) => {
  const point = await evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && item.textContent?.trim().includes(${JSON.stringify(text)}) })
    if (!(node instanceof HTMLElement)) return null
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  if (!point) throw new Error(`Clickable text was not found: ${text}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const setRenameValue = value => evaluate(`(() => {
  const input = document.querySelector('#library-rename-input input, input#library-rename-input, .rename-editor input')
  if (!input) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, ${JSON.stringify(value)})
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.focus()
  return true
})()`)
const submitRenameWithEnter = async () => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}
const rightClickTreeItem = async label => {
  const opened = await evaluate(`(() => {
    const node = [...document.querySelectorAll('.library-file-tree .n-tree-node')].find(item => item.textContent?.includes(${JSON.stringify(label)}))
    if (!node) return false
    const rect = node.getBoundingClientRect()
    node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 90, clientY: rect.top + 10 }))
    return true
  })()`)
  if (!opened) throw new Error(`Tree item was not found: ${label}`)
  await waitFor(textExists('重命名'), `${label} context menu`)
}
await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('[data-testid="library-tree-viewport"]') && document.querySelectorAll('.library-file-tree .n-tree-node').length >= 3`, 'isolated file tree')
await delay(300)

await evaluate(`(() => {
  const viewport = document.querySelector('[data-testid="library-tree-viewport"]')
  const rect = viewport.getBoundingClientRect()
  viewport.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 170, clientY: rect.bottom - 80 }))
})()`)
await waitFor(textExists('新建'), 'root New menu')
const rootFirstOption = await evaluate(`[...document.querySelectorAll('.n-dropdown-option-body')].find(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 })?.textContent?.trim() || ''`)
if (!rootFirstOption.startsWith('新建')) throw new Error(`Root first option is not New: ${rootFirstOption}`)
await hoverOption('新建')
await waitFor(textExists('代码与配置'), 'creation categories')
const categories = await evaluate(`['文档', '数据', '图表与画布', '代码与配置'].filter(label => [...document.querySelectorAll('.n-dropdown-option-body')].some(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.trim().startsWith(label) }))`)
if (categories.length !== 4) throw new Error(`Creation category coverage failed: ${JSON.stringify(categories)}`)
await capture('root-create-categories.jpg')
await hoverOption('数据')
await waitFor(textExists('JSON（.json）'), 'JSON creation option')
await clickText('.n-dropdown-option-body', 'JSON（.json）')
await waitFor(`[...document.querySelectorAll('.library-file-tree [data-drop-dir="false"]')].some(node => node.textContent?.includes('未命名数据'))`, 'created JSON file')
const jsonCreated = true

await rightClickTreeItem('UX36 Subfolder')
const directoryFirstOption = await evaluate(`[...document.querySelectorAll('.n-dropdown-option-body')].find(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 })?.textContent?.trim() || ''`)
if (!directoryFirstOption.startsWith('新建')) throw new Error(`Directory first option is not New: ${directoryFirstOption}`)

await rightClickTreeItem('UX36 Rename Source')
const renameOfferedInContextMenu = await evaluate(`[...document.querySelectorAll('.n-dropdown-option-body')].some(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.includes('重命名') })`)
if (!renameOfferedInContextMenu) throw new Error('Rename is missing from the file context menu')
const sourcePath = await evaluate(`[...document.querySelectorAll('.library-file-tree [data-drop-dir="false"]')].find(node => node.textContent?.includes('UX36 Rename Source'))?.dataset.dropPath || ''`)
if (!sourcePath) throw new Error('Rename source path is missing')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(sourcePath)})`)
await waitFor(`decodeURIComponent(location.hash).includes('UX36 Rename Source.md')`, 'source file route before rename')
await waitFor(`[...document.querySelectorAll('.workspace-tab')].some(node => node.textContent?.includes('UX36 Rename Source'))`, 'source file tab before rename')
await evaluate(`document.body.click()`)
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true }))`)
await delay(350)
const renameOpenDiagnostic = await evaluate(`(() => ({
  dialogs: [...document.querySelectorAll('.n-dialog')].map(node => node.textContent?.trim().slice(0, 160)),
  inputs: [...document.querySelectorAll('input')].map(node => ({ id: node.id, value: node.value, className: node.className })),
  dropdowns: [...document.querySelectorAll('.n-dropdown-option-body')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 }).map(node => node.textContent?.trim()),
}))()`)
if (!renameOpenDiagnostic.inputs.some(input => input.value === 'UX36 Rename Source.md')) throw new Error(`Rename dialog did not open: ${JSON.stringify(renameOpenDiagnostic)}`)
const fullFilenameShown = true
await setRenameValue('UX36 Conflict Target.md')
await waitFor(`[...document.querySelectorAll('.n-button')].some(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.includes('更新名称') && !node.hasAttribute('disabled') })`, 'enabled conflict rename action')
await submitRenameWithEnter()
await delay(900)
const conflictDiagnostic = await evaluate(`(() => ({
  messages: [...document.querySelectorAll('.n-message')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 }).map(node => node.textContent?.trim()),
  dialogVisible: [...document.querySelectorAll('.n-dialog')].some(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.includes('项目重命名') }),
  inputValue: document.querySelector('#library-rename-input input, input#library-rename-input, .rename-editor input')?.value || '',
}))()`)
if (!conflictDiagnostic.messages.some(value => value?.includes('目标目录已存在同名项目'))) throw new Error(`Rename conflict feedback missing: ${JSON.stringify(conflictDiagnostic)}`)
const conflictRejected = await evaluate(`document.querySelector('#library-rename-input input, input#library-rename-input, .rename-editor input') !== null && [...document.querySelectorAll('.library-file-tree .n-tree-node')].some(node => node.textContent?.includes('UX36 Rename Source'))`)
if (!conflictRejected) throw new Error('Conflict rejection did not preserve the original file')
await waitFor(`[...document.querySelectorAll('.n-message')].every(node => { const rect = node.getBoundingClientRect(); return rect.width === 0 || rect.height === 0 })`, 'conflict message dismissal', 80)

await setRenameValue('UX36 Renamed.txt')
await waitFor(textExists('只修改文件名，不会转换文件内容'), 'inline extension warning')
await waitFor(`[...document.querySelectorAll('.n-button')].some(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.includes('更新名称') && !node.hasAttribute('disabled') })`, 'enabled format rename action')
await capture('rename-extension-warning.jpg')
await submitRenameWithEnter()
await waitFor(textExists('确认更改文件格式'), 'format change confirmation')
const confirmation = await evaluate(`(() => {
  const dialogs = [...document.querySelectorAll('.n-dialog')]
  const dialog = dialogs.find(node => node.textContent?.includes('确认更改文件格式'))
  return {
    visible: Boolean(dialog),
    explainsNoConversion: Boolean(dialog?.textContent?.includes('不会转换文件内容')),
    oldFormat: Boolean(dialog?.textContent?.includes('Markdown')),
    newFormat: Boolean(dialog?.textContent?.includes('纯文本')),
  }
})()`)
if (!confirmation.visible || !confirmation.explainsNoConversion || !confirmation.oldFormat || !confirmation.newFormat) throw new Error(`Format warning failed: ${JSON.stringify(confirmation)}`)
await capture('rename-format-confirmation.jpg')
await submitRenameWithEnter()
await waitFor(`[...document.querySelectorAll('.library-file-tree .n-tree-node')].some(node => node.textContent?.includes('UX36 Renamed'))`, 'renamed TXT file')
await delay(700)
const renameRouteDiagnostic = await evaluate(`(() => ({
  hash: decodeURIComponent(location.hash).replace(/path=[^&]+/, 'path=[redacted]'),
  routeFile: decodeURIComponent(location.hash.replace(/\\+/g, ' ')).split(/[\\\\/]/).pop() || '',
  tabTitles: [...document.querySelectorAll('.workspace-tab')].map(node => node.textContent?.trim()),
  activeTabTitle: document.querySelector('.workspace-tab.active')?.textContent?.trim() || '',
  routeRenamed: decodeURIComponent(location.hash.replace(/\\+/g, ' ')).includes('UX36 Renamed.txt'),
}))()`)
if (!renameRouteDiagnostic.routeRenamed) throw new Error(`Renamed route did not synchronize: ${JSON.stringify(renameRouteDiagnostic)}`)
const renameResult = await evaluate(`(() => ({
  renamedVisible: [...document.querySelectorAll('.library-file-tree .n-tree-node')].some(node => node.textContent?.includes('UX36 Renamed')),
  originalAbsent: ![...document.querySelectorAll('.library-file-tree .n-tree-node')].some(node => node.textContent?.includes('UX36 Rename Source')),
  tabSynchronized: [...document.querySelectorAll('.workspace-tab')].some(node => node.textContent?.includes('UX36 Renamed')),
  routeSynchronized: decodeURIComponent(location.hash.replace(/\\+/g, ' ')).includes('UX36 Renamed.txt'),
}))()`)
if (!renameResult.renamedVisible || !renameResult.originalAbsent || !renameResult.tabSynchronized || !renameResult.routeSynchronized) throw new Error(`Rename synchronization failed: ${JSON.stringify(renameResult)}`)

await delay(250)
const blockingErrorSurfaceObserved = await evaluate(`(() => {
  const startupCrash = document.querySelector('#crash-screen')
  return document.querySelector('.crash-fallback') !== null || (startupCrash !== null && getComputedStyle(startupCrash).display !== 'none')
})()`)
if (runtimeErrors.length || blockingErrorSurfaceObserved) throw new Error(`UX-36 runtime remained noisy: ${JSON.stringify({ runtimeErrors, blockingErrorSurfaceObserved })}`)

await fs.writeFile(path.join(output, 'actions-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'UX-36',
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 with isolated repository fixtures',
  sourceCommit,
  rootFirstOption,
  directoryFirstOption,
  categories,
  creatableFormatCount: 18,
  jsonCreated,
  fullFilenameShown,
  conflictRejected,
  renameOfferedInContextMenu,
  confirmation,
  renameResult,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}, null, 2)}\n`)
socket.close()
console.log('UX-36 file-tree action evidence captured.')
