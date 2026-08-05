import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14350'
const appOrigin = process.env.LONGEDIT_UX35_APP_ORIGIN || 'http://127.0.0.1:14200'
const output = path.resolve(process.env.LONGEDIT_UX35_AUDIT_OUTPUT || 'docs/evidence/ux35-file-tree-preview')
const sourceCommit = process.env.LONGEDIT_UX35_SOURCE_COMMIT || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('UX-35 requires a source commit')

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
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  }
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
    runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  }
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

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-file-tree [data-drop-dir="false"]') !== null`, 'file-tree leaves')
await delay(300)

const baseline = await evaluate(`(() => {
  const leaves = [...document.querySelectorAll('.library-file-tree [data-drop-dir="false"]')]
  return {
    leafCount: leaves.length,
    nativeTitleCount: leaves.filter(node => node.hasAttribute('title')).length,
    describedLeafCount: leaves.filter(node => node.getAttribute('aria-describedby') === 'file-tree-detail-preview').length,
  }
})()`)
if (baseline.leafCount < 2 || baseline.nativeTitleCount !== 0 || baseline.describedLeafCount !== baseline.leafCount) {
  throw new Error(`File-tree semantics failed: ${JSON.stringify(baseline)}`)
}

const mouseTarget = await evaluate(`(() => {
  const leaf = document.querySelector('.library-file-tree [data-drop-dir="false"]')
  const rect = leaf.getBoundingClientRect()
  leaf.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: rect.right - 8, clientY: rect.top + 8 }))
  return { label: leaf.textContent.trim() }
})()`)
await waitFor(`document.querySelector('#file-tree-detail-preview[role="tooltip"]') !== null`, 'mouse detail preview')
const mousePreview = await evaluate(`(() => {
  const tooltip = document.querySelector('#file-tree-detail-preview[role="tooltip"]')
  return {
    visible: tooltip !== null && getComputedStyle(tooltip).display !== 'none',
    title: tooltip?.querySelector('.file-title')?.textContent?.trim() || '',
    path: tooltip?.querySelector('.file-path')?.textContent?.trim() || '',
    statCount: tooltip?.querySelectorAll('.stat-value').length || 0,
  }
})()`)
if (!mousePreview.visible || !mousePreview.title || !mousePreview.path || mousePreview.statCount < 2) {
  throw new Error(`Mouse preview failed: ${JSON.stringify(mousePreview)}`)
}
await capture('file-tree-mouse-preview.jpg')
await evaluate(`document.querySelector('.library-file-tree [data-drop-dir="false"]')?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))`)
await waitFor(`document.querySelector('#file-tree-detail-preview') === null`, 'mouse preview dismissal')

await evaluate(`document.querySelector('.library-file-tree')?.focus()`)
await delay(150)
for (let attempt = 0; attempt < baseline.leafCount + 8; attempt += 1) {
  const ready = await evaluate(`(() => {
    const tree = document.querySelector('.library-file-tree')
    const pending = tree?.querySelector('.n-tree-node--pending[data-drop-dir="false"]')
    if (pending) return true
    tree?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true }))
    return false
  })()`)
  if (ready) break
  await delay(120)
}
await waitFor(`document.querySelector('.library-file-tree .n-tree-node--pending[data-drop-dir="false"]') !== null`, 'keyboard pending leaf')
await delay(500)
const keyboardDiagnostic = await evaluate(`(() => {
  const tree = document.querySelector('.library-file-tree')
  const active = document.activeElement
  const pending = tree?.querySelector('.n-tree-node--pending[data-drop-dir="false"]')
  return {
    activeTag: active?.tagName || '',
    activeClass: active?.className || '',
    activeInsideTree: Boolean(tree && active && tree.contains(active)),
    treeTabIndex: tree?.getAttribute('tabindex') || '',
    pendingFile: (pending?.dataset.dropPath || '').split(/[\\\\/]/).pop() || '',
    pendingClass: pending?.className || '',
    tooltipVisible: document.querySelector('#file-tree-detail-preview[role="tooltip"]') !== null,
  }
})()`)
if (!keyboardDiagnostic.tooltipVisible) throw new Error(`Keyboard preview did not open: ${JSON.stringify(keyboardDiagnostic)}`)
const keyboardPreview = await evaluate(`(() => {
  const tree = document.querySelector('.library-file-tree')
  const pending = tree?.querySelector('.n-tree-node--pending[data-drop-dir="false"]')
  const tooltip = document.querySelector('#file-tree-detail-preview[role="tooltip"]')
  return {
    activeElementIsTree: document.activeElement === tree || tree?.contains(document.activeElement),
    pendingFile: (pending?.dataset.dropPath || '').split(/[\\\\/]/).pop() || '',
    treeDescription: tree?.getAttribute('aria-describedby') || '',
    visible: tooltip !== null && getComputedStyle(tooltip).display !== 'none',
    title: tooltip?.querySelector('.file-title')?.textContent?.trim() || '',
    path: tooltip?.querySelector('.file-path')?.textContent?.trim() || '',
  }
})()`)
if (!keyboardPreview.activeElementIsTree || !keyboardPreview.pendingFile || keyboardPreview.treeDescription !== 'file-tree-detail-preview' || !keyboardPreview.visible || !keyboardPreview.title || !keyboardPreview.path) {
  throw new Error(`Keyboard preview failed: ${JSON.stringify(keyboardPreview)}`)
}
await capture('file-tree-keyboard-preview.jpg')
await evaluate(`document.querySelector('.library-file-tree')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`)
await waitFor(`document.querySelector('#file-tree-detail-preview') === null && !document.querySelector('.library-file-tree')?.hasAttribute('aria-describedby')`, 'Escape dismissal')
const escapeDismissed = await evaluate(`document.querySelector('#file-tree-detail-preview') === null && !document.querySelector('.library-file-tree')?.hasAttribute('aria-describedby')`)

await delay(200)
const blockingErrorSurfaceObserved = await evaluate(`(() => {
  const startupCrash = document.querySelector('#crash-screen')
  return document.querySelector('.crash-fallback') !== null ||
    (startupCrash !== null && getComputedStyle(startupCrash).display !== 'none')
})()`)
if (runtimeErrors.length || blockingErrorSurfaceObserved) {
  throw new Error(`UX-35 runtime remained noisy: ${JSON.stringify({ runtimeErrors, blockingErrorSurfaceObserved })}`)
}

await fs.writeFile(path.join(output, 'preview-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'UX-35',
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 with isolated repository fixtures',
  sourceCommit,
  baseline,
  mouseTarget,
  mousePreview,
  keyboardPreview,
  escapeDismissed,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}, null, 2)}\n`)
socket.close()
console.log('UX-35 file-tree detail preview evidence captured.')
