import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14515'
const output = path.resolve(process.env.LONGEDIT_V115_AUDIT_OUTPUT || 'docs/evidence/v115-interaction-polish')
const sourceCommit = process.env.LONGEDIT_V115_SOURCE_COMMIT || ''
const samples = JSON.parse(process.env.LONGEDIT_V115_SAMPLES || '[]')
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || samples.length !== 3) throw new Error('v1.0.15 interaction audit environment is incomplete')

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
const waitFor = async (expression, description, attempts = 240) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
for (const sample of samples) {
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(sample.path)})`)
  await waitFor(`document.querySelector('.workspace-tab')?.textContent && document.body.textContent.includes(${JSON.stringify(sample.file)}) && !document.querySelector('.page-loader')`, `${sample.file} tab`)
  await delay(180)
}
await waitFor(`document.querySelectorAll('.tabs-bar > .workspace-tabs .workspace-tab').length === 3`, 'three workspace tabs')

const tabMetrics = await evaluate(`(() => {
  const tab = document.querySelector('.tabs-bar > .workspace-tabs .workspace-tab')
  const rect = tab.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, nativeTitleCount: document.querySelectorAll('.workspace-tabs [title]').length }
})()`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 740 })
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tabMetrics.x, y: tabMetrics.y })
await waitFor(`Boolean(document.querySelector('.workspace-tab-tooltip'))`, 'modern tab tooltip')
const tooltip = await evaluate(`(() => {
  const content = document.querySelector('.workspace-tab-tooltip')
  const item = content?.closest('.n-popover') || content?.parentElement
  const style = getComputedStyle(item)
  return { visible: Boolean(content), text: content?.textContent?.trim() || '', borderRadius: style.borderRadius, boxShadow: style.boxShadow, fontSize: style.fontSize }
})()`)
await capture('workspace-tab-tooltip.png')

const contextPolicy = await evaluate(`(() => {
  const dispatch = target => { const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 220 }); target.dispatchEvent(event); return event.defaultPrevented }
  const ordinary = dispatch(document.querySelector('.library-main, .library-mode'))
  const input = document.querySelector('input:not([type="checkbox"]):not([type="radio"])')
  const editable = input ? dispatch(input) : null
  const tree = document.querySelector('.tree-viewport')
  const custom = tree ? dispatch(tree) : null
  return { ordinaryPrevented: ordinary, editablePrevented: editable, customEventPrevented: custom }
})()`)
await delay(250)
contextPolicy.customMenuVisible = await evaluate(`Boolean(document.querySelector('.n-dropdown-menu'))`)
await capture('context-menu-policy.png')
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1080, y: 620, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1080, y: 620, button: 'left', clickCount: 1 })
await waitFor(`![...document.querySelectorAll('.n-dropdown-menu')].some(item => item.getBoundingClientRect().width > 0)`, 'context menu dismissal')

const globalTooltipTarget = await evaluate(`(() => {
  const candidates = [...document.querySelectorAll('button[data-app-tooltip]')]
    .filter(item => !item.closest('.workspace-tabs') && !item.matches('[data-testid="library-create-menu"]') && item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0 && !item.disabled)
  const target = candidates[0]
  const rect = target.getBoundingClientRect()
  return { text: target.dataset.appTooltip, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, managedCount: document.querySelectorAll('[data-app-tooltip-managed="true"]').length, nativeTitleCount: document.querySelectorAll('[title]').length }
})()`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: globalTooltipTarget.x, y: globalTooltipTarget.y })
await waitFor(`document.querySelector('#longedit-app-tooltip[data-visible="true"]')?.textContent === ${JSON.stringify(globalTooltipTarget.text)}`, 'global application tooltip')
const readOverlayMetrics = selector => evaluate(`(() => {
  const items = [...document.querySelectorAll(${JSON.stringify(selector)})]
  const item = items.find(candidate => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0) || items[0]
  const rect = item.getBoundingClientRect()
  const style = getComputedStyle(item)
  return { visible: rect.width > 0 && rect.height > 0, text: item.textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, backgroundColor: style.backgroundColor, color: style.color, borderRadius: style.borderRadius, boxShadow: style.boxShadow, fontSize: style.fontSize }
})()`)
const globalTooltipLight = await readOverlayMetrics('#longedit-app-tooltip')
await capture('global-tooltip-light.png')

await evaluate(`(() => { const target = [...document.querySelectorAll('button[data-app-tooltip]')].find(item => !item.closest('.workspace-tabs') && !item.matches('[data-testid="library-create-menu"]') && item.getBoundingClientRect().width > 0 && !item.disabled); target.setAttribute('title', '动态标题也使用应用提示层'); target.focus() })()`)
await waitFor(`document.querySelector('#longedit-app-tooltip[data-visible="true"]')?.textContent === '动态标题也使用应用提示层' && !document.querySelector('button[title="动态标题也使用应用提示层"]')`, 'dynamic keyboard tooltip adoption')
const keyboardTooltip = await evaluate(`(() => { const target = document.activeElement; return { text: document.querySelector('#longedit-app-tooltip').textContent, describedBy: target.getAttribute('aria-describedby'), ariaLabel: target.getAttribute('aria-label'), nativeTitle: target.getAttribute('title') } })()`)
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await waitFor(`document.querySelector('#longedit-app-tooltip')?.dataset.visible === 'false'`, 'Escape tooltip dismissal')

await evaluate(`document.querySelector('[data-testid="library-create-menu"]').click()`)
await waitFor(`document.querySelector('.library-create-dropdown-menu')?.getBoundingClientRect().width > 0`, 'library create dropdown')
const dropdownLight = await readOverlayMetrics('.library-create-dropdown-menu')
dropdownLight.viewportHeight = await evaluate('document.documentElement.clientHeight')
await capture('dropdown-light.png')
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1080, y: 620, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1080, y: 620, button: 'left', clickCount: 1 })
await waitFor(`![...document.querySelectorAll('.n-dropdown-menu')].some(item => item.getBoundingClientRect().width > 0)`, 'light dropdown dismissal')

await evaluate(`(() => { const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; const store = pinia._s.get('app'); const tab = store.tabs.find(item => item.id === store.activeTabId) || store.tabs[0]; tab.isDirty = true; document.querySelector('.workspace-tab.active .close-tab').click() })()`)
await waitFor(`Boolean(document.querySelector('.n-dialog'))`, 'application confirmation dialog')
const dialogLight = await readOverlayMetrics('.n-dialog')
await capture('dialog-light.png')
await evaluate(`([...document.querySelectorAll('.n-dialog__action button')].find(item => item.textContent.includes('取消')) || document.querySelector('.n-dialog__close'))?.click()`)
await waitFor(`!document.querySelector('.n-dialog')`, 'dialog dismissal')

await evaluate(`(() => { const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; pinia._s.get('app').theme = 'dark' })()`)
await waitFor(`document.body.dataset.theme === 'dark'`, 'dark theme')
await delay(250)
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1.5, mobile: false })
await delay(350)
const narrowTarget = await evaluate(`(() => { const target = [...document.querySelectorAll('button[data-app-tooltip]')].find(item => !item.closest('.workspace-tabs') && !item.matches('[data-testid="library-create-menu"]') && item.getBoundingClientRect().width > 0 && !item.disabled); target.blur(); target.setAttribute('title', '窄窗口与高 DPI 下仍保持在屏幕内的应用提示信息'); const rect = target.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })()`)
await waitFor(`Boolean(document.querySelector('[data-app-tooltip="窄窗口与高 DPI 下仍保持在屏幕内的应用提示信息"]'))`, 'narrow dynamic tooltip adoption')
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 710, y: 670 })
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: narrowTarget.x, y: narrowTarget.y })
await waitFor(`document.querySelector('#longedit-app-tooltip[data-visible="true"]')?.textContent.includes('窄窗口与高 DPI')`, 'dark narrow tooltip')
const globalTooltipDarkNarrow = await readOverlayMetrics('#longedit-app-tooltip')
globalTooltipDarkNarrow.viewportWidth = await evaluate('document.documentElement.clientWidth')
globalTooltipDarkNarrow.devicePixelRatio = await evaluate('window.devicePixelRatio')
await capture('global-tooltip-dark-narrow.png')
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })

await evaluate(`document.querySelector('[data-testid="library-create-menu"]').click()`)
await waitFor(`document.querySelector('.library-create-dropdown-menu')?.getBoundingClientRect().width > 0`, 'dark narrow dropdown')
const dropdownDarkNarrow = await readOverlayMetrics('.library-create-dropdown-menu')
dropdownDarkNarrow.viewportWidth = await evaluate('document.documentElement.clientWidth')
dropdownDarkNarrow.viewportHeight = await evaluate('document.documentElement.clientHeight')
await capture('dropdown-dark-narrow.png')
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })

const normalizedTooltip = tooltip.text.replaceAll('/', '\\').toLowerCase()
const matchedSample = samples.find(sample => normalizedTooltip.includes(sample.path.replaceAll('/', '\\').toLowerCase()))
tooltip.matchedPath = matchedSample?.path || null
if (tabMetrics.nativeTitleCount !== 0 || !tooltip.visible || !matchedSample || tooltip.borderRadius === '0px') throw new Error(`Tooltip gate failed: ${JSON.stringify({ tabMetrics, tooltip })}`)
if (!contextPolicy.ordinaryPrevented || contextPolicy.editablePrevented !== false || !contextPolicy.customEventPrevented || !contextPolicy.customMenuVisible) throw new Error(`Context menu gate failed: ${JSON.stringify(contextPolicy)}`)
if (globalTooltipTarget.nativeTitleCount !== 0 || globalTooltipTarget.managedCount < 8 || !globalTooltipLight.visible || globalTooltipLight.borderRadius === '0px' || globalTooltipLight.boxShadow === 'none') throw new Error(`Global tooltip gate failed: ${JSON.stringify({ globalTooltipTarget, globalTooltipLight })}`)
if (keyboardTooltip.text !== '动态标题也使用应用提示层' || keyboardTooltip.nativeTitle !== null || !keyboardTooltip.describedBy?.includes('longedit-app-tooltip') || !keyboardTooltip.ariaLabel) throw new Error(`Keyboard tooltip gate failed: ${JSON.stringify(keyboardTooltip)}`)
if (!dropdownLight.visible || dropdownLight.borderRadius === '0px' || dropdownLight.boxShadow === 'none' || dropdownLight.height > 520 || dropdownLight.bottom > dropdownLight.viewportHeight + 1) throw new Error(`Dropdown light gate failed: ${JSON.stringify(dropdownLight)}`)
if (!dialogLight.visible || dialogLight.borderRadius === '0px' || dialogLight.boxShadow === 'none') throw new Error(`Dialog light gate failed: ${JSON.stringify(dialogLight)}`)
if (globalTooltipDarkNarrow.left < 7 || globalTooltipDarkNarrow.right > globalTooltipDarkNarrow.viewportWidth - 7 || globalTooltipDarkNarrow.width > globalTooltipDarkNarrow.viewportWidth - 16 || Math.abs(globalTooltipDarkNarrow.devicePixelRatio - 1.5) > 0.001) throw new Error(`Dark narrow tooltip gate failed: ${JSON.stringify(globalTooltipDarkNarrow)}`)
if (!dropdownDarkNarrow.visible || dropdownDarkNarrow.right > dropdownDarkNarrow.viewportWidth + 1 || dropdownDarkNarrow.bottom > dropdownDarkNarrow.viewportHeight + 1 || dropdownDarkNarrow.height > 520) throw new Error(`Dark narrow dropdown gate failed: ${JSON.stringify(dropdownDarkNarrow)}`)
if (runtimeErrors.length) throw new Error(`Runtime errors observed: ${JSON.stringify(runtimeErrors)}`)

const evidence = { schemaVersion: 2, stage: 'V1.0.15-interaction-polish', sourceCommit, tabMetrics, tooltip, contextPolicy, globalTooltipTarget, globalTooltipLight, keyboardTooltip, dropdownLight, dialogLight, globalTooltipDarkNarrow, dropdownDarkNarrow, runtimeErrorCount: runtimeErrors.length, sourceUserContentIncluded: false, releaseCandidate: false }
const evidencePath = path.join(output, 'interaction-evidence.json')
await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['workspace-tab-tooltip.png', 'context-menu-policy.png', 'global-tooltip-light.png', 'dropdown-light.png', 'dialog-light.png', 'global-tooltip-dark-narrow.png', 'dropdown-dark-narrow.png']) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(evidencePath)
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: evidence.stage, status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log('v1.0.15 interaction polish desktop capture passed.')
