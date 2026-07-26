import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const library = path.resolve(process.env.LONGEDIT_A5_AUDIT_LIBRARY || '')
const output = path.resolve(process.env.LONGEDIT_A5_AUDIT_OUTPUT || 'docs/evidence/a5-stage-a')
if (!library) throw new Error('LONGEDIT_A5_AUDIT_LIBRARY is required')

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
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}

const waitFor = async (expression, description, attempts = 120, interval = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(interval)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

const waitForFile = async (file, predicate, description, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const content = await fs.readFile(file, 'utf8')
    if (predicate(content)) return content
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

const routeFor = (_route, file) => `#/library?path=${encodeURIComponent(file)}`
const navigate = async (hash, selector) => {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`)
  await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, selector)
  await waitFor(`document.querySelector(${JSON.stringify(selector + ' .editor-state')}) === null`, `${selector} loaded`)
  await waitFor(`document.querySelector('.page-loader') === null`, 'route loading overlay')
  await delay(250)
}

const clickText = async (selector, text) => {
  const clicked = await evaluate(`(() => {
    const item = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(element => element.textContent?.trim().includes(${JSON.stringify(text)}))
    if (!item) return false
    item.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to click ${selector} containing ${text}`)
}

const activateWorkspaceTab = async title => {
  const clicked = await evaluate(`(() => {
    const tab = [...document.querySelectorAll('.tabs-bar .workspace-tab')]
      .find(element => element.textContent?.includes(${JSON.stringify(title)}))
    if (!tab) return false
    tab.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to activate workspace tab ${title}`)
}

const setInput = async (selector, value) => {
  const changed = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!(input instanceof HTMLInputElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error(`Unable to set input ${selector}`)
}

const setEditorText = async text => {
  await evaluate(`(() => {
    const editor = document.querySelector('.cm-content')
    editor?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    editor?.focus()
    editor?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return document.activeElement === editor
  })()`)
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
  })
  await send('Input.insertText', { text })
  try {
    await waitFor(
      `document.querySelector('.cm-content')?.innerText?.replace(/\\r/g, '') === ${JSON.stringify(text)}`,
      'CodeMirror document replacement',
    )
  } catch (error) {
    const actual = await evaluate(`({
      active: document.activeElement?.className,
      text: document.querySelector('.cm-content')?.innerText
    })`)
    throw new Error(`${error.message}: ${JSON.stringify(actual)}`)
  }
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

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 820,
  deviceScaleFactor: 1,
  mobile: false,
})
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
await waitFor(`document.querySelector('.page-loader') === null`, 'desktop app initial route')
await delay(1000)

const serviceIni = path.join(library, 'service.ini')
const propertiesFile = path.join(library, 'application.properties')
const sourceFile = path.join(library, 'index-proof.ts')
const yamlFile = path.join(library, 'settings.yaml')
const xmlFile = path.join(library, 'layout.xml')
const tomlFile = path.join(library, 'project.toml')
const envFile = path.join(library, '.env')
const jsonFile = path.join(library, 'damaged.json')
const largeFile = path.join(library, 'large.txt')
const logFile = path.join(library, 'runtime.log')
const relationSourceFile = path.join(library, 'G8 Source.md')
const checks = []

await navigate(routeFor('library', relationSourceFile), '.library-mode')
await waitFor(
  `document.querySelector('.active-relation-summary')?.textContent?.includes('1') === true
    && document.querySelector('.active-relation-summary')?.textContent?.includes('关系') === true`,
  'current file relation summary',
  180,
)
checks.push({ id: 'g8-current-file-relation-summary', status: 'passed' })
await capture('g8-current-file-relation-summary.jpg')
await clickText('.active-relation-summary', '关系')
await waitFor(
  `location.hash.startsWith('#/graph?root=')
    && document.querySelector('.node-details h3')?.textContent?.includes('G8 Source') === true`,
  'centered graph navigation',
  180,
)
await waitFor(`document.querySelector('.page-loader') === null`, 'centered graph route loading overlay')
await delay(350)
checks.push({ id: 'g8-centered-graph-navigation', status: 'passed' })
await capture('g8-centered-graph-navigation.jpg')

await navigate('#/workspace', '.workspace-home')
await waitFor(
  `[...document.querySelectorAll('.file-row')].some(row =>
    row.textContent?.includes('G8 Source') && row.querySelector('.relation-summary')?.textContent?.includes('1')
  )`,
  'workspace recent file relation summary',
  180,
)
checks.push({ id: 'g8-workspace-relation-summary', status: 'passed' })
await capture('g8-workspace-relation-summary.jpg')

await navigate('#/library', '.library-mode')
const g8SearchInput = '.search-area input[placeholder="搜索文档..."]'
await setInput(g8SearchInput, 'G8_RELATION_SEARCH_MARKER')
await waitFor(
  `document.querySelector('.knowledge-search-result')?.textContent?.includes('G8_RELATION_SEARCH_MARKER') === true
    && document.querySelector('.knowledge-search-result .relation-summary')?.textContent?.includes('1') === true`,
  'search result relation summary',
  180,
)
checks.push({ id: 'g8-search-relation-summary', status: 'passed' })
await capture('g8-search-relation-summary.jpg')

await navigate(routeFor('text', serviceIni), '.text-workspace')
const embeddedShellState = await evaluate(`({
  library: document.querySelector('.library-mode') !== null,
  sidebarWidth: document.querySelector('.sidebar')?.getBoundingClientRect().width,
  embedded: document.querySelector('.library-embedded-editor .text-workspace') !== null,
  nestedTabsDisplay: (() => {
    const tabs = document.querySelector('.library-embedded-editor .workspace-tabs')
    return tabs ? getComputedStyle(tabs).display : 'absent'
  })()
})`)
if (!embeddedShellState.library
  || embeddedShellState.sidebarWidth < 180
  || !embeddedShellState.embedded
  || embeddedShellState.nestedTabsDisplay !== 'none') {
  throw new Error(`Text workspace did not remain inside the library shell: ${JSON.stringify(embeddedShellState)}`)
}
checks.push({ id: 'library-shell-embedded-formats', status: 'passed' })
const savedText = '[service]\nname=desktop-saved\nmode=a5'
await setEditorText(savedText)
await clickText('.editor-actions button', '保存')
await waitForFile(serviceIni, content => content.includes('name=desktop-saved'), 'desktop text save')
await capture('text-save-and-reopen.jpg')
await navigate('#/workspace', '.workspace-home')
await navigate(routeFor('text', serviceIni), '.text-workspace')
await waitFor(
  `document.querySelector('.cm-content')?.textContent?.includes('name=desktop-saved') === true`,
  'saved text after route reopen',
)
checks.push({ id: 'text-save-reopen', status: 'passed' })
await waitFor(`!document.body.innerText.includes('文本已安全保存')`, 'text save toast dismissal')

const unsavedDraft = '[service]\nname=unsaved-draft'
const externalVersion = '[service]\nname=external-version\n'
await setEditorText(unsavedDraft)
await fs.writeFile(serviceIni, externalVersion, 'utf8')
await clickText('.editor-actions button', '保存')
await waitFor(
  `document.querySelector('.n-dialog')?.textContent?.includes('文件已在外部修改') === true`,
  'external conflict dialog',
)
await capture('external-conflict-detected.jpg')
await clickText('.n-dialog button', '重新加载')
await waitFor(
  `document.querySelector('.cm-content')?.textContent?.includes('external-version') === true
    && !document.querySelector('.cm-content')?.textContent?.includes('unsaved-draft')`,
  'external disk version after explicit reload',
)
checks.push({ id: 'external-conflict-reload', status: 'passed' })

await navigate(routeFor('text', envFile), '.text-workspace')
await waitFor(
  `document.querySelector('.readonly-label')?.textContent?.includes('敏感值已遮罩') === true`,
  'ENV masked state',
)
const maskedState = await evaluate(`({
  editor: document.querySelector('.cm-content')?.textContent,
  body: document.body.innerText
})`)
if (!maskedState.editor.includes('••••••') || maskedState.body.includes('A5_PRIVATE_ENV_MARKER')) {
  throw new Error('ENV secret was visible before explicit reveal')
}
await capture('env-default-masked.jpg')
await clickText('.editor-actions button', '显示并编辑变量值')
await waitFor(`document.querySelector('.n-dialog') !== null`, 'ENV reveal confirmation')
await clickText('.n-dialog button', '显示并允许编辑')
await waitFor(
  `document.querySelector('.cm-content')?.textContent?.includes('A5_PRIVATE_ENV_MARKER') === true`,
  'ENV explicit reveal',
)
await clickText('.editor-actions button', '重新遮罩变量值')
await waitFor(
  `document.querySelector('.cm-content')?.textContent?.includes('••••••') === true
    && !document.body.innerText.includes('A5_PRIVATE_ENV_MARKER')`,
  'ENV remasked state',
)
checks.push({ id: 'env-mask-reveal-remask', status: 'passed' })

await navigate(routeFor('json', jsonFile), '.json-workspace')
const validJson = '{\n  "valid": true\n}'
const invalidJson = '{\n  "valid": true,\n  "broken":\n}'
await setEditorText(invalidJson)
await waitFor(
  `document.querySelector('.analysis-pane')?.textContent?.includes('语法错误') === true`,
  'invalid JSON diagnostic',
)
await clickText('.editor-actions button', '保存')
await waitFor(
  `document.querySelector('.n-dialog')?.textContent?.includes('源码存在语法错误') === true`,
  'invalid JSON save protection',
)
const diskAfterBlockedJsonSave = await fs.readFile(jsonFile, 'utf8')
if (diskAfterBlockedJsonSave.trim() !== '{"valid":true}') {
  throw new Error(`Invalid JSON overwrote the last valid disk version: ${diskAfterBlockedJsonSave}`)
}
await capture('json-invalid-save-protected.jpg')
await clickText('.n-dialog button', '继续编辑')
await setEditorText(validJson)
await waitFor(
  `document.querySelector('.analysis-pane')?.textContent?.includes('语法错误') === false`,
  'repaired JSON analysis',
)
await clickText('.editor-actions button', '保存')
await waitForFile(jsonFile, content => content.includes('"valid": true'), 'repaired JSON save')
checks.push({ id: 'json-invalid-save-protected', status: 'passed' })
checks.push({ id: 'json-repair-save', status: 'passed' })
await waitFor(`!document.body.innerText.includes('JSON 源码已安全保存')`, 'JSON save toast dismissal')
await activateWorkspaceTab('service')
await waitFor(
  `location.hash.startsWith('#/library?path=')
    && document.querySelector('.library-embedded-editor .text-workspace') !== null
    && document.querySelector('.sidebar')?.getBoundingClientRect().width > 180`,
  'embedded text tab switch',
)
await activateWorkspaceTab('damaged')
await waitFor(
  `location.hash.startsWith('#/library?path=')
    && document.querySelector('.library-embedded-editor .json-workspace') !== null
    && document.querySelector('.sidebar')?.getBoundingClientRect().width > 180`,
  'embedded JSON tab switch',
)
checks.push({ id: 'embedded-tab-switch-preserves-shell', status: 'passed' })

const saveAndReopen = async ({ route, file, workspaceSelector, content, marker, checkId }) => {
  await navigate(routeFor(route, file), workspaceSelector)
  await waitFor(`document.querySelector('.cm-content') !== null`, `${checkId} editor`)
  await setEditorText(content)
  await clickText('button', '保存')
  await waitForFile(file, value => value.includes(marker), `${checkId} disk save`)
  await navigate('#/workspace', '.workspace-home')
  await navigate(routeFor(route, file), workspaceSelector)
  await waitFor(
    `document.querySelector('.cm-content')?.textContent?.includes(${JSON.stringify(marker)}) === true`,
    `${checkId} route reopen`,
  )
  checks.push({ id: checkId, status: 'passed' })
}

await saveAndReopen({
  route: 'text',
  file: propertiesFile,
  workspaceSelector: '.text-workspace',
  content: 'app.name=A5_PROPERTIES_SAVED\nfeature.audit=true',
  marker: 'A5_PROPERTIES_SAVED',
  checkId: 'properties-save-reopen',
})
await saveAndReopen({
  route: 'text',
  file: sourceFile,
  workspaceSelector: '.text-workspace',
  content: "export const A5_PUBLIC_CODE_MARKER = 'searchable'\nexport const A5_TS_SAVED = true",
  marker: 'A5_TS_SAVED',
  checkId: 'source-code-save-reopen',
})
await capture('configuration-and-code-save-reopen.jpg')
await saveAndReopen({
  route: 'yaml',
  file: yamlFile,
  workspaceSelector: '.yaml-workspace',
  content: 'service:\n  name: A5_YAML_SAVED',
  marker: 'A5_YAML_SAVED',
  checkId: 'yaml-save-reopen',
})
await saveAndReopen({
  route: 'xml',
  file: xmlFile,
  workspaceSelector: '.xml-workspace',
  content: '<?xml version="1.0" encoding="UTF-8"?>\n<service status="A5_XML_SAVED" />',
  marker: 'A5_XML_SAVED',
  checkId: 'xml-save-reopen',
})
await saveAndReopen({
  route: 'toml',
  file: tomlFile,
  workspaceSelector: '.workspace',
  content: '[service]\nname = "A5_TOML_SAVED"',
  marker: 'A5_TOML_SAVED',
  checkId: 'toml-save-reopen',
})
await capture('structured-formats-save-reopen.jpg')

await navigate('#/library', '.library-mode')
const searchInput = '.search-area input[placeholder="搜索文档..."]'
await setInput(searchInput, 'A5_PUBLIC_CODE_MARKER')
await waitFor(
  `document.querySelector('.knowledge-search-result')?.textContent?.includes('A5_PUBLIC_CODE_MARKER') === true`,
  'public source search result',
)
await clickText('button[title="保存当前搜索"]', '')
await waitFor(`document.body.innerText.includes('已保存为智能集合')`, 'saved search confirmation')
await waitFor(`!document.body.innerText.includes('已保存为智能集合')`, 'saved search toast dismissal', 80)
await setInput(searchInput, 'A5_PRIVATE_ENV_MARKER')
await waitFor(
  `document.querySelector('.knowledge-search-state')?.textContent?.includes('没有找到匹配内容') === true`,
  'ENV excluded from search',
)
if ((await evaluate(`document.body.innerText.includes('A5_PRIVATE_ENV_MARKER')`))) {
  throw new Error('ENV marker leaked into search UI')
}
await capture('env-search-excluded.jpg')
checks.push({ id: 'env-search-exclusion', status: 'passed' })
checks.push({ id: 'saved-search-collection', status: 'passed' })

await navigate(routeFor('text', largeFile), '.text-workspace')
await waitFor(
  `document.querySelector('.readonly-label')?.textContent?.includes('大文件范围模式') === true`,
  'large text bounded read-only mode',
  180,
)
const largeState = await evaluate(`({
  label: document.querySelector('.readonly-label')?.textContent?.trim(),
  saveDisabled: [...document.querySelectorAll('.editor-actions button')]
    .find(button => button.textContent?.trim() === '保存')?.disabled,
  textLength: document.querySelector('.cm-content')?.textContent?.length,
  status: document.querySelector('.status-bar')?.innerText
})`)
if (!largeState.saveDisabled
  || largeState.textLength > 600000
  || !largeState.status.includes('512.0 KiB')
  || !largeState.status.includes('24.0 MiB')) {
  throw new Error(`Large text did not remain bounded: ${JSON.stringify(largeState)}`)
}
await capture('large-text-bounded-readonly.jpg')
checks.push({
  id: 'large-text-bounded-readonly',
  status: 'passed',
  renderedCharacters: largeState.textLength,
  displayState: largeState.status.replace(/\s+/g, ' ').trim(),
})

await navigate(routeFor('log', logFile), '.log-workspace')
await waitFor(`document.body.innerText.includes('initial-log-entry')`, 'initial log content')
await fs.appendFile(logFile, '2026-07-26 12:00:01 WARN A5_APPENDED_LOG_MARKER\n', 'utf8')
await waitFor(`document.body.innerText.includes('A5_APPENDED_LOG_MARKER')`, 'appended log refresh', 80, 100)
await fs.writeFile(logFile, '2026-07-26 12:00:02 ERROR A5_ROTATED_LOG_MARKER\n', 'utf8')
await waitFor(
  `document.body.innerText.includes('A5_ROTATED_LOG_MARKER')
    && !document.body.innerText.includes('A5_APPENDED_LOG_MARKER')`,
  'log rotation reload',
  80,
  100,
)
await capture('log-append-and-rotation.jpg')
checks.push({ id: 'log-append-refresh', status: 'passed' })
checks.push({ id: 'log-rotation-reload', status: 'passed' })

const evidenceFiles = [
  'g8-current-file-relation-summary.jpg',
  'g8-centered-graph-navigation.jpg',
  'g8-workspace-relation-summary.jpg',
  'g8-search-relation-summary.jpg',
  'text-save-and-reopen.jpg',
  'external-conflict-detected.jpg',
  'env-default-masked.jpg',
  'json-invalid-save-protected.jpg',
  'configuration-and-code-save-reopen.jpg',
  'structured-formats-save-reopen.jpg',
  'env-search-excluded.jpg',
  'large-text-bounded-readonly.jpg',
  'log-append-and-rotation.jpg',
]
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  sourceUrl: target.url,
  fixtureLocation: 'isolated temporary workspace',
  checks,
  evidenceFiles,
}, null, 2)}\n`)

await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`A5 desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
