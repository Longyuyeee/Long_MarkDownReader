import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14410'
const appOrigin = process.env.LONGEDIT_CF1_APP_ORIGIN || 'http://127.0.0.1:14200'
const library = path.resolve(process.env.LONGEDIT_CF1_AUDIT_LIBRARY || '')
const output = path.resolve(process.env.LONGEDIT_CF1_AUDIT_OUTPUT || 'docs/evidence/cf1-code-file-creation')
const sourceCommit = process.env.LONGEDIT_CF1_SOURCE_COMMIT || ''
if (!library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('CF-1 audit environment is incomplete')

const registry = JSON.parse(await fs.readFile('shared/file-formats.json', 'utf8'))
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
const waitFor = async (expression, description, attempts = 400) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const visibleText = text => `[...document.querySelectorAll('.n-dropdown-option-body')].some(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && node.textContent?.trim() === ${JSON.stringify(text)} })`
const hoverOption = async text => {
  const point = await evaluate(`(() => {
    const node = [...document.querySelectorAll('.n-dropdown-option-body')].find(item => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && item.textContent?.trim() === ${JSON.stringify(text)} })
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  if (!point) throw new Error(`Dropdown option was not found: ${text}`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await delay(300)
}
const clickText = async (selector, text) => {
  const point = await evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => { const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && item.textContent?.trim() === ${JSON.stringify(text)} })
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  if (!point) throw new Error(`Clickable text was not found: ${text}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
const capture = async file => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(screenshot.data, 'base64'))
}
const openRootCreateMenu = async () => {
  await evaluate(`(() => {
    document.body.click()
    const viewport = document.querySelector('[data-testid="library-tree-viewport"]')
    if (!viewport) return false
    const rect = viewport.getBoundingClientRect()
    viewport.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + Math.min(170, rect.width / 2), clientY: rect.bottom - 52 }))
    return true
  })()`)
  await waitFor(visibleText('新建'), 'root New menu')
  await hoverOption('新建')
  await waitFor(visibleText('代码与配置'), 'code creation category')
}
const openCreationPath = async labels => {
  await openRootCreateMenu()
  for (const label of labels) {
    await hoverOption(label)
  }
}
const setEditorText = async text => {
  const point = await evaluate(`(() => {
    const editor = document.querySelector('.text-workspace .cm-content')
    if (!editor) return null
    const rect = editor.getBoundingClientRect()
    return { x: rect.left + 28, y: rect.top + 28 }
  })()`)
  if (!point) throw new Error('CodeMirror input surface is missing')
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await waitFor(`(() => {
    const editor = document.querySelector('.text-workspace .cm-content')
    editor?.focus()
    return document.activeElement === editor || editor?.closest('.cm-editor')?.classList.contains('cm-focused') === true
  })()`, 'CodeMirror input focus', 80)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  await send('Input.insertText', { text })
  await waitFor(`document.querySelector('.text-workspace .cm-content')?.innerText?.includes('CF1_DESKTOP_SAVE_PROOF') === true`, 'edited CodeMirror content')
}
const templateFor = (formatId, extension) => {
  const format = registry.formats.find(item => item.id === formatId)
  if (!format?.creation) throw new Error(`Missing creation contract for ${formatId}`)
  const variant = format.creation.variants?.find(item => item.extension === extension)
  return variant?.defaultContent ?? format.creation.defaultContent
}
const createScenario = async scenario => {
  await openCreationPath(scenario.parents)
  await waitFor(visibleText(scenario.leaf), `${scenario.leaf} option`)
  await clickText('.n-dropdown-option-body', scenario.leaf)
  await waitFor(`document.querySelector('.text-workspace') !== null && document.querySelector('.text-workspace .editor-state') === null`, `${scenario.file} text workspace`)
  await waitFor(`document.querySelector('.text-workspace .document-title strong')?.textContent?.trim() === ${JSON.stringify(scenario.file)}`, `${scenario.file} title`)
  const file = path.join(library, scenario.file)
  const expected = templateFor(scenario.id, scenario.extension)
  if (await fs.readFile(file, 'utf8') !== expected) throw new Error(`${scenario.file} template bytes drifted`)
  return file
}

const scenarios = [
  { id: 'javascript', extension: '.js', parents: ['代码与配置', '编程语言', 'JavaScript'], leaf: 'JavaScript（.js）', file: '未命名 JavaScript.js' },
  { id: 'typescript', extension: '.tsx', parents: ['代码与配置', '编程语言', 'TypeScript'], leaf: 'TSX（.tsx）', file: '未命名组件.tsx' },
  { id: 'python', extension: '.py', parents: ['代码与配置', '编程语言'], leaf: 'Python（.py）', file: '未命名 Python.py' },
  { id: 'rust', extension: '.rs', parents: ['代码与配置', '编程语言'], leaf: 'Rust（.rs）', file: '未命名 Rust.rs' },
  { id: 'go', extension: '.go', parents: ['代码与配置', '编程语言'], leaf: 'Go（.go）', file: '未命名 Go.go' },
  { id: 'jvm-code', extension: '.kt', parents: ['代码与配置', '编程语言', 'Java / Kotlin'], leaf: 'Kotlin（.kt）', file: '未命名 Kotlin.kt' },
  { id: 'c-family', extension: '.cs', parents: ['代码与配置', '编程语言', 'C / C++ / C#'], leaf: 'C#（.cs）', file: '未命名 CSharp.cs' },
  { id: 'shell', extension: '.ps1', parents: ['代码与配置', '编程语言', 'Shell / PowerShell'], leaf: 'PowerShell（.ps1）', file: '未命名 PowerShell.ps1' },
  { id: 'sql', extension: '.sql', parents: ['代码与配置', 'Web 与查询'], leaf: 'SQL（.sql）', file: '未命名 SQL.sql' },
  { id: 'web-source', extension: '.vue', parents: ['代码与配置', 'Web 与查询', 'HTML / CSS / Vue'], leaf: 'Vue 单文件组件（.vue）', file: '未命名组件.vue' },
]

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('[data-testid="library-tree-viewport"]') !== null`, 'isolated Library workspace')
await waitFor(`document.querySelector('.page-loader') === null`, 'route startup')
await delay(500)

await openCreationPath(scenarios[0].parents)
await waitFor(visibleText(scenarios[0].leaf), 'JavaScript extension variants')
await capture('cf1-code-create-menu.jpg')
await clickText('.n-dropdown-option-body', scenarios[0].leaf)
await waitFor(`document.querySelector('.text-workspace .document-title strong')?.textContent?.trim() === ${JSON.stringify(scenarios[0].file)}`, 'JavaScript workspace')
const javascriptPath = path.join(library, scenarios[0].file)
const javascriptTemplate = templateFor('javascript', '.js')
if (await fs.readFile(javascriptPath, 'utf8') !== javascriptTemplate) throw new Error('JavaScript template bytes drifted')

const savedContent = "export const CF1_DESKTOP_SAVE_PROOF = 'accepted'\n"
await setEditorText(savedContent)
if (await fs.readFile(javascriptPath, 'utf8') !== javascriptTemplate) throw new Error('Draft changed source bytes before explicit Save')
await clickText('.text-workspace .editor-actions button', '保存')
for (let attempt = 0; attempt < 200; attempt += 1) {
  if (await fs.readFile(javascriptPath, 'utf8').catch(() => '') === savedContent) break
  await delay(100)
}
if (await fs.readFile(javascriptPath, 'utf8') !== savedContent) throw new Error('Explicit Save did not persist JavaScript content')
await waitFor(`document.querySelector('.text-workspace .document-title')?.textContent?.includes('已同步') === true`, 'saved JavaScript state')
await capture('cf1-javascript-saved.jpg')

await evaluate(`document.querySelector('.workspace-tab.active .close-tab')?.click()`)
await waitFor(`![...document.querySelectorAll('.workspace-tab')].some(node => node.textContent?.includes(${JSON.stringify(scenarios[0].file)}))`, 'closed JavaScript tab')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(javascriptPath)})`)
await waitFor(`document.querySelector('.text-workspace .document-title strong')?.textContent?.trim() === ${JSON.stringify(scenarios[0].file)}`, 'reopened JavaScript title')
await waitFor(`document.querySelector('.text-workspace .cm-content')?.innerText?.includes('CF1_DESKTOP_SAVE_PROOF') === true`, 'reopened JavaScript content')
await capture('cf1-javascript-reopened.jpg')

await openCreationPath(scenarios[0].parents)
await clickText('.n-dropdown-option-body', scenarios[0].leaf)
const duplicatePath = path.join(library, '未命名 JavaScript 1.js')
await waitFor(`document.querySelector('.text-workspace .document-title strong')?.textContent?.trim() === '未命名 JavaScript 1.js'`, 'duplicate JavaScript target')
if (await fs.readFile(duplicatePath, 'utf8') !== javascriptTemplate) throw new Error('Duplicate JavaScript template drifted')
if (await fs.readFile(javascriptPath, 'utf8') !== savedContent) throw new Error('Duplicate creation overwrote the first JavaScript file')

for (const scenario of scenarios.slice(1, -1)) await createScenario(scenario)
await openCreationPath(scenarios.at(-1).parents)
await waitFor(visibleText(scenarios.at(-1).leaf), 'Web source extension variants')
await capture('cf1-web-create-menu.jpg')
await clickText('.n-dropdown-option-body', scenarios.at(-1).leaf)
await waitFor(`document.querySelector('.text-workspace .document-title strong')?.textContent?.trim() === ${JSON.stringify(scenarios.at(-1).file)}`, 'Vue workspace')
if (await fs.readFile(path.join(library, scenarios.at(-1).file), 'utf8') !== templateFor('web-source', '.vue')) throw new Error('Vue template bytes drifted')

await delay(500)
await capture('cf1-created-format-families.jpg')
const blockingErrorSurfaceObserved = await evaluate(`document.querySelector('.crash-fallback') !== null || (document.querySelector('#crash-screen') !== null && getComputedStyle(document.querySelector('#crash-screen')).display !== 'none')`)
if (runtimeErrors.length || blockingErrorSurfaceObserved) throw new Error(`CF-1 runtime remained noisy: ${JSON.stringify({ runtimeErrors, blockingErrorSurfaceObserved })}`)

const checks = [
  { id: 'nested-code-and-web-create-menus', status: 'passed' },
  { id: 'ten-format-families-created-through-ui', status: 'passed' },
  { id: 'registered-multi-extension-variants-created', status: 'passed' },
  { id: 'draft-does-not-write-before-save', status: 'passed' },
  { id: 'explicit-save-persists-source-bytes', status: 'passed' },
  { id: 'close-and-reopen-restores-saved-content', status: 'passed' },
  { id: 'duplicate-create-never-overwrites', status: 'passed' },
  { id: 'runtime-remains-error-free', status: 'passed' },
]
const evidence = {
  schemaVersion: 1,
  stage: 'CF-1',
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  fixtureLocation: 'isolated temporary workspace',
  sourceCommit,
  formatFamilies: scenarios.map(item => item.id),
  createdFiles: [...scenarios.map(item => item.file), '未命名 JavaScript 1.js'],
  javascriptSha256: createHash('sha256').update(await fs.readFile(javascriptPath)).digest('hex'),
  firstFilePreservedAfterDuplicateCreate: true,
  sourceUserContentIncluded: false,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  checks,
}
const evidenceFile = 'interaction-evidence.json'
await fs.writeFile(path.join(output, evidenceFile), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['cf1-code-create-menu.jpg', 'cf1-javascript-saved.jpg', 'cf1-javascript-reopened.jpg', 'cf1-web-create-menu.jpg', 'cf1-created-format-families.jpg']
const screenshots = []
for (const file of screenshotFiles) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
const evidenceBytes = await fs.readFile(path.join(output, evidenceFile))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'CF-1',
  status: 'evidence-captured',
  visualReview: 'pending',
  sourceCommit,
  evidenceFile,
  evidenceSha256: createHash('sha256').update(evidenceBytes).digest('hex'),
  screenshots,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`CF-1 desktop audit passed ${checks.length} checks and captured ${screenshots.length} screenshots`)
