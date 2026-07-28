import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const library = path.resolve(process.env.LONGEDIT_A3R_AUDIT_LIBRARY || '')
const output = path.resolve(process.env.LONGEDIT_A3R_AUDIT_OUTPUT || 'docs/evidence/a3r-json-creation')
if (!library) throw new Error('LONGEDIT_A3R_AUDIT_LIBRARY is required')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.includes('127.0.0.1:9000'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView CDP target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 500) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const click = async selector => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!(element instanceof HTMLElement) || element.getAttribute('disabled') !== null) return false
    element.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to click ${selector}`)
}
const clickText = async (selector, text) => {
  const clicked = await evaluate(`(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(candidate => candidate.textContent?.trim().includes(${JSON.stringify(text)}))
    if (!(element instanceof HTMLElement)) return false
    element.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to click ${selector} containing ${text}`)
}
const setInput = async (selector, value) => {
  const changed = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!(input instanceof HTMLInputElement)) return false
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error(`Unable to set input ${selector}`)
}
const setEditorText = async text => {
  const point = await evaluate(`(() => {
    const editor = document.querySelector('.cm-content')
    if (!(editor instanceof HTMLElement)) return null
    const rect = editor.getBoundingClientRect()
    return { x: rect.left + 24, y: rect.top + 24 }
  })()`)
  if (!point) throw new Error('CodeMirror input surface is missing')
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await waitFor(
    `(() => {
      const editor = document.querySelector('.cm-content')
      editor?.focus()
      return document.activeElement === editor
        || editor?.closest('.cm-editor')?.classList.contains('cm-focused') === true
    })()`,
    'CodeMirror input focus',
    80,
  )
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  await send('Input.insertText', { text })
  const marker = text.includes('a3r-index-proof') ? 'a3r-index-proof' : 'A3R comment fidelity'
  await waitFor(
    `document.querySelector('.cm-content')?.innerText?.includes(${JSON.stringify(marker)}) === true`,
    'CodeMirror document replacement',
  )
}
const capture = async fileName => {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 90,
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(output, fileName), Buffer.from(screenshot.data, 'base64'))
}
const resize = async (width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await delay(250)
}
const waitForFile = async (file, expected) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const content = await fs.readFile(file, 'utf8').catch(() => null)
    if (content === expected) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for saved content in ${file}`)
}
const openCreateMenu = async () => {
  await click('[data-testid="library-create-menu"]')
  await waitFor(
    `[...document.querySelectorAll('.n-dropdown-option-body')].some(item => item.textContent?.includes('新建JSON'))`,
    'registered JSON creation options',
  )
}
const createRegistered = async (label, expectedTitle) => {
  await openCreateMenu()
  await clickText('.n-dropdown-option-body', label)
  await waitFor(`document.querySelector('[data-testid="json-workspace"]') !== null`, `${label} workspace`)
  await waitFor(
    `document.querySelector('.document-title strong')?.textContent?.includes(${JSON.stringify(expectedTitle)}) === true`,
    `${label} created title`,
  )
  await waitFor(`document.querySelector('.cm-content') !== null && document.querySelector('.loading-state') === null`, `${label} editor`)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await resize(1280, 820)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
await waitFor(`document.querySelector('.page-loader') === null`, 'desktop app initial route')
await delay(500)
await evaluate(`location.hash = '#/library'`)
await waitFor(`document.querySelector('.library-mode') !== null`, 'Library workspace')
await waitFor(`document.querySelector('.page-loader') === null`, 'route overlay dismissal')

await openCreateMenu()
await capture('a3r-create-options-1280.jpg')
await clickText('.n-dropdown-option-body', '新建JSON')
await waitFor(`document.querySelector('[data-testid="json-workspace"]') !== null`, 'new JSON workspace')
await waitFor(`document.querySelector('.document-title strong')?.textContent?.includes('未命名数据.json') === true`, 'new JSON title')
await waitFor(`document.querySelector('.analysis-header')?.textContent?.includes('语法有效') === true`, 'valid JSON analysis')
const jsonPath = path.join(library, '未命名数据.json')
if (await fs.readFile(jsonPath, 'utf8') !== '{}\n') throw new Error('JSON template is not the minimum valid source')
const jsonContent = '{\n  "stage": "A3R",\n  "searchProof": "a3r-index-proof"\n}\n'
await setEditorText(jsonContent)
await waitFor(`document.querySelector('[data-testid="json-save"]')?.getAttribute('disabled') === null`, 'enabled JSON save')
await click('[data-testid="json-save"]')
await waitForFile(jsonPath, jsonContent)
await waitFor(`document.querySelector('.document-title')?.textContent?.includes('已同步') === true`, 'saved JSON state')
await clickText('.view-switch button', '树形')
await waitFor(`document.querySelectorAll('.tree-row').length >= 3`, 'JSON tree after save')
await capture('a3r-json-saved-tree-1280.jpg')

await evaluate(`location.hash = '#/workspace'`)
await waitFor(`document.querySelector('.workspace-home') !== null`, 'workspace detour')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(jsonPath)})`)
await waitFor(`document.querySelector('[data-testid="json-workspace"]') !== null`, 'reopened JSON workspace')
await waitFor(`document.querySelector('.cm-content')?.innerText?.includes('a3r-index-proof') === true`, 'reopened saved JSON content')

await createRegistered('新建JSON', '未命名数据 1.json')
const duplicatePath = path.join(library, '未命名数据 1.json')
if (await fs.readFile(duplicatePath, 'utf8') !== '{}\n') throw new Error('Duplicate JSON creation did not use a fresh target')
if (await fs.readFile(jsonPath, 'utf8') !== jsonContent) throw new Error('Duplicate JSON creation overwrote the first file')

await createRegistered('新建JSONC', '未命名配置.jsonc')
const jsoncPath = path.join(library, '未命名配置.jsonc')
await waitFor(`document.querySelector('.json-statusbar')?.textContent?.includes('允许注释与尾随逗号') === true`, 'JSONC mode')
const jsoncContent = '{\n  // A3R comment fidelity\n  "mode": "jsonc",\n}\n'
await setEditorText(jsoncContent)
await click('[data-testid="json-save"]')
await waitForFile(jsoncPath, jsoncContent)
await waitFor(`document.querySelector('.analysis-header')?.textContent?.includes('语法有效') === true`, 'valid saved JSONC')

await click('[title="重建知识索引"]')
await waitFor(`document.querySelector('.knowledge-index-strip.state-ready') !== null`, 'rebuilt JSON knowledge index')
await setInput('.search-area input[placeholder="搜索文档..."]', 'a3r-index-proof')
await waitFor(
  `document.querySelector('.knowledge-search-result')?.textContent?.includes('未命名数据') === true
    && document.querySelector('.knowledge-search-result')?.textContent?.includes('a3r-index-proof') === true`,
  'JSON search result',
)
await resize(960, 720)
await delay(1800)
await capture('a3r-json-search-960.jpg')

await setInput('.search-area input[placeholder="搜索文档..."]', '')
await click('[role="tab"][aria-label="历史"]')
await waitFor(
  `[...document.querySelectorAll('.recent-item')].some(item => item.textContent?.includes('未命名数据.json'))
    && [...document.querySelectorAll('.recent-item')].some(item => item.textContent?.includes('未命名配置.jsonc'))`,
  'JSON and JSONC recent entries',
)
await delay(500)
await capture('a3r-json-recent-capability-960.jpg')

const jsonBytes = await fs.readFile(jsonPath)
const jsoncBytes = await fs.readFile(jsoncPath)
const checks = [
  { id: 'unified-create-menu-lists-json-and-jsonc', status: 'passed' },
  { id: 'minimum-valid-json-template-opens-specialized-workspace', status: 'passed' },
  { id: 'first-edit-save-and-reopen', status: 'passed' },
  { id: 'duplicate-name-does-not-overwrite', status: 'passed' },
  { id: 'jsonc-comment-and-trailing-comma-fidelity', status: 'passed' },
  { id: 'json-content-search-result', status: 'passed' },
  { id: 'json-and-jsonc-recent-management', status: 'passed' },
  { id: 'normal-and-compact-layouts', status: 'passed' },
]
const evidenceFiles = [
  'a3r-create-options-1280.jpg',
  'a3r-json-saved-tree-1280.jpg',
  'a3r-json-search-960.jpg',
  'a3r-json-recent-capability-960.jpg',
]
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  fixtureLocation: 'isolated temporary workspace',
  formats: ['json', 'jsonc'],
  initialContent: '{}\n',
  createdFiles: ['未命名数据.json', '未命名数据 1.json', '未命名配置.jsonc'],
  jsonSha256: createHash('sha256').update(jsonBytes).digest('hex'),
  jsoncSha256: createHash('sha256').update(jsoncBytes).digest('hex'),
  firstFilePreservedAfterDuplicateCreate: true,
  viewportMatrix: ['1280x820', '960x720'],
  checks,
  evidenceFiles,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`A3R desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
