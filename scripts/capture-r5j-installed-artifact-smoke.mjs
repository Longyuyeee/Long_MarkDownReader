import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9343'
const library = path.resolve(process.env.LONGEDIT_R5J_LIBRARY || '')
const output = path.resolve(process.env.LONGEDIT_R5J_OUTPUT || '')
const installedExecutable = path.resolve(process.env.LONGEDIT_R5J_EXECUTABLE || '')
const appVersion = process.env.LONGEDIT_R5J_APP_VERSION || ''
const installerSha256 = process.env.LONGEDIT_R5J_INSTALLER_SHA256 || ''
const sourceCommit = process.env.LONGEDIT_R5J_SOURCE_COMMIT || ''
const signedArtifactRuntimeProven = process.env.LONGEDIT_R5J_SIGNED_RUNTIME === 'true'
const coldLaunchFile = process.env.LONGEDIT_EA5B_COLD_FILE ? path.resolve(process.env.LONGEDIT_EA5B_COLD_FILE) : ''
const secondaryLaunchFile = process.env.LONGEDIT_EA5B_SECONDARY_FILE ? path.resolve(process.env.LONGEDIT_EA5B_SECONDARY_FILE) : ''
const windowsDevicePrefix = '\\\\?\\'
const normalizeWindowsPath = value => {
  const normalized = String(value || '').replaceAll('/', '\\').toLocaleLowerCase()
  return normalized.startsWith(windowsDevicePrefix) ? normalized.slice(4) : normalized
}
if (!library || !output || !installedExecutable || !coldLaunchFile || !secondaryLaunchFile || !appVersion || !/^[a-f0-9]{64}$/.test(installerSha256) || !/^[a-f0-9]{40}$/.test(sourceCommit)) {
  throw new Error('R5J library, output, executable, external launch fixtures, version, installer hash, and source commit are required')
}

const textFile = path.join(library, 'r5j-notes.txt')
const jsonFile = path.join(library, 'r5j-config.json')
const knowledgeBaselineFile = path.join(output, 'installed-knowledge-observation-baseline.json')
const knowledgeComparisonFile = path.join(output, 'installed-knowledge-guidance-comparison.json')
const invalidKnowledgeComparisonFile = path.join(output, 'installed-knowledge-guidance-comparison-invalid.json')
const knowledgeImprovementFixture = path.join(library, 'g15c-linked-follow-up.md')
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nativeDocxFixtures = [
  { producerId: 'microsoft-word', sourceFile: 'microsoft-word-hyperlinks.docx', copyFile: 'UX33J Microsoft Word Hyperlinks.docx', expectedEditableLinks: 2 },
  { producerId: 'wps-writer', sourceFile: 'wps-writer-hyperlinks.docx', copyFile: 'UX33J WPS Writer Hyperlinks.docx', expectedEditableLinks: 0 },
  { producerId: 'libreoffice-writer', sourceFile: 'libreoffice-writer-hyperlinks.docx', copyFile: 'UX33J LibreOffice Writer Hyperlinks.docx', expectedEditableLinks: 2 },
]
const embeddedEditorSelector = '.library-embedded-editor .cm-content'
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const waitForCdpTarget = async (predicate = () => true, attempts = 120) => {
  let lastError = ''
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const targets = await fetch(`${endpoint}/json`).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && predicate(item))
      if (target) return target
      lastError = 'no page target advertised'
    } catch (error) {
      lastError = String(error)
    }
    await delay(250)
  }
  throw new Error(`R5J installed Tauri WebView CDP target was not found after ${attempts} attempts: ${lastError}`)
}
const coldTarget = await waitForCdpTarget(item => item.url.includes('/mindmap?'))
let socket
let send
let evaluate
const activateTarget = async target => {
  if (socket?.readyState === WebSocket.OPEN) socket.close()
  socket = new WebSocket(target.webSocketDebuggerUrl)
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
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
    return result.result.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
}
await activateTarget(coldTarget)
const invokeTauri = (command, args) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`)
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const waitForFile = async (file, marker, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await fs.readFile(file, 'utf8')).includes(marker)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const navigate = async (hash, selector, description) => {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`)
  try {
    await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null || document.querySelector('.crash-fallback') !== null`, description, 1200)
    await waitFor(`document.querySelector('.page-loader') === null || document.querySelector('.crash-fallback') !== null`, `${description} transition`, 1200)
  } catch (error) {
    const diagnostics = await evaluate(`({ hash: location.hash, title: document.title, body: document.body?.innerText?.slice(0, 2000) || '' })`)
    throw new Error(`${description} navigation timed out: ${JSON.stringify(diagnostics)}; ${error.message}`)
  }
  await delay(150)
  const crash = await evaluate(`(() => {
    const fallback = document.querySelector('.crash-fallback')
    return fallback ? { hash: location.hash, text: fallback.textContent?.slice(0, 2000) || '' } : null
  })()`)
  if (crash) {
    throw new Error(`${description} showed the global crash fallback: ${JSON.stringify(crash)}`)
  }
  if (!await evaluate(`document.querySelector(${JSON.stringify(selector)}) !== null`)) {
    const diagnostics = await evaluate(`({ hash: location.hash, body: document.body?.innerText?.slice(0, 2000) || '' })`)
    throw new Error(`${description} completed without its expected surface: ${JSON.stringify(diagnostics)}`)
  }
}
const assertNoGlobalFallback = async description => {
  await delay(750)
  const fallback = await evaluate(`(() => {
    const element = document.querySelector('.crash-fallback')
    return element ? element.textContent : ''
  })()`)
  if (fallback) throw new Error(`${description} showed the global crash fallback: ${fallback}`)
}
const assertEditorTextVisible = async (marker, description) => {
  const visibility = await evaluate(`(() => {
    const line = [...document.querySelectorAll('.library-embedded-editor .cm-line')]
      .find(element => element.textContent?.includes(${JSON.stringify(marker)}))
    const editor = line?.closest('.cm-editor')
    if (!line || !editor) return null
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    let textNode = null
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.includes(${JSON.stringify(marker)})) {
        textNode = walker.currentNode
        break
      }
    }
    if (!textNode) return null
    const markerOffset = textNode.textContent.indexOf(${JSON.stringify(marker)})
    const range = document.createRange()
    range.setStart(textNode, markerOffset)
    range.setEnd(textNode, markerOffset + ${JSON.stringify(marker)}.length)
    const markerRect = range.getBoundingClientRect()
    const editorRect = editor.getBoundingClientRect()
    let cumulativeOpacity = 1
    let background = 'rgba(0, 0, 0, 0)'
    for (let element = line; element; element = element.parentElement) {
      const style = getComputedStyle(element)
      cumulativeOpacity *= Number(style.opacity || 1)
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
        background = style.backgroundColor
      }
    }
    const foreground = getComputedStyle(line).color
    const components = value => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number)
    const luminance = value => {
      const channels = components(value).map(channel => {
        const normalized = channel / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }
    const foregroundLuminance = luminance(foreground)
    const backgroundLuminance = luminance(background)
    const contrastRatio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    const centerX = markerRect.left + markerRect.width / 2
    const centerY = markerRect.top + markerRect.height / 2
    const hit = document.elementFromPoint(centerX, centerY)
    const hitStack = document.elementsFromPoint(centerX, centerY).slice(0, 8).map(element => ({
      tag: element.tagName,
      className: typeof element.className === 'string' ? element.className : '',
      text: element.textContent?.slice(0, 80) || '',
      background: getComputedStyle(element).backgroundColor,
      pointerEvents: getComputedStyle(element).pointerEvents,
    }))
    const editorInstances = [...document.querySelectorAll('.library-embedded-editor .cm-editor')].map(element => {
      const rect = element.getBoundingClientRect()
      return {
        text: element.textContent?.slice(0, 120) || '',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        display: getComputedStyle(element).display,
        visibility: getComputedStyle(element).visibility,
        opacity: getComputedStyle(element).opacity,
      }
    })
    return {
      foreground,
      background,
      contrastRatio,
      cumulativeOpacity,
      fontSize: getComputedStyle(line).fontSize,
      markerRect: { x: markerRect.x, y: markerRect.y, width: markerRect.width, height: markerRect.height },
      editorRect: { x: editorRect.x, y: editorRect.y, width: editorRect.width, height: editorRect.height },
      markerInsideEditor: markerRect.left >= editorRect.left && markerRect.right <= editorRect.right
        && markerRect.top >= editorRect.top && markerRect.bottom <= editorRect.bottom,
      markerHitTestVisible: Boolean(hit && (line === hit || line.contains(hit))),
      hitStack,
      editorInstances,
    }
  })()`)
  if (!visibility || visibility.cumulativeOpacity < 0.9 || visibility.contrastRatio < 3 ||
      visibility.markerRect.width < 20 || visibility.markerRect.height < 8 ||
      !visibility.markerInsideEditor || !visibility.markerHitTestVisible) {
    throw new Error(`${description} text is not visibly rendered: ${JSON.stringify(visibility)}`)
  }
  return visibility
}
const setEditorText = async text => {
  const point = await evaluate(`(() => {
    const editor = document.querySelector(${JSON.stringify(embeddedEditorSelector)})
    if (!editor) return null
    const rect = editor.getBoundingClientRect()
    return { x: rect.left + Math.min(24, rect.width / 2), y: rect.top + Math.min(24, rect.height / 2) }
  })()`)
  if (!point) throw new Error('CodeMirror input surface is missing')
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await waitFor(
    `(() => {
      const editor = document.querySelector(${JSON.stringify(embeddedEditorSelector)})
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
  const marker = text.includes('R5J_TEXT_SAVED') ? 'R5J_TEXT_SAVED' : 'R5J_JSON_SAVED'
  await waitFor(
    `document.querySelector(${JSON.stringify(embeddedEditorSelector)})?.innerText?.includes(${JSON.stringify(marker)}) === true`,
    'CodeMirror document replacement',
  )
}
const saveShortcut = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 })
}
const capture = async fileName => {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 88,
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(output, fileName), Buffer.from(screenshot.data, 'base64'))
}
const waitForStableVisibleSurface = async (selector, description) => {
  const stableExpression = `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element || document.querySelector('.page-loader')) return false
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return rect.width > 0 && rect.height > 0
      && rect.top >= 0 && rect.bottom <= window.innerHeight
      && style.visibility !== 'hidden' && style.display !== 'none'
  })()`
  await waitFor(stableExpression, description, 1200)
  await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await delay(500)
  if (!await evaluate(stableExpression)) {
    throw new Error(`${description} did not remain visible after the route transition settled`)
  }
}

await fs.mkdir(output, { recursive: true })
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'installed desktop app bootstrap')
await waitFor(`typeof window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__ === 'function'`, 'route performance export')
const checks = [{ id: 'installed-current-webview-bootstrap', status: 'passed' }]

await waitFor(
  `(() => {
    const separator = location.hash.indexOf('?')
    const query = new URLSearchParams(separator >= 0 ? location.hash.slice(separator + 1) : '')
    return location.hash.includes('/mindmap')
      && query.get('external') === '1'
      && query.get('path')?.endsWith(${JSON.stringify(coldLaunchFile)}) === true
      && document.querySelector('.mindmap-page') !== null
  })()`,
  'cold launch external OPML route with Chinese and spaces',
  1200,
)
checks.push({ id: 'installed-external-cold-launch-unicode-space-path', status: 'passed' })

const secondaryProcess = spawn(installedExecutable, [secondaryLaunchFile], {
  cwd: path.dirname(installedExecutable),
  windowsHide: true,
  stdio: 'ignore',
})
const secondaryExit = once(secondaryProcess, 'exit')
const [secondaryExitCode] = await Promise.race([
  secondaryExit,
  delay(15_000).then(() => { throw new Error('Secondary LongEdit process did not exit through the single-instance handoff') }),
])
if (secondaryExitCode !== 0) throw new Error(`Secondary LongEdit process exited with ${secondaryExitCode}`)
const secondaryTarget = await waitForCdpTarget(item => item.id !== coldTarget.id && item.url.includes('/text?'), 1200)
await activateTarget(secondaryTarget)
try {
  await waitFor(
    `(() => {
      const separator = location.hash.indexOf('?')
      const query = new URLSearchParams(separator >= 0 ? location.hash.slice(separator + 1) : '')
      return location.hash.includes('/text')
        && query.get('external') === '1'
        && document.querySelector('.text-workspace') !== null
    })()`,
    'single-instance external TXT route with Chinese and spaces',
    1200,
  )
  await waitFor(
    `document.body?.innerText?.includes('EA5B_SECONDARY_INSTANCE_UNICODE_PATH') === true`,
    'single-instance external TXT content marker',
    1200,
  )
} catch (error) {
  const diagnostics = await evaluate(`({
    hash: location.hash,
    body: document.body?.innerText?.slice(0, 1200) || '',
    textWorkspace: document.querySelector('.text-workspace') !== null,
    crash: document.querySelector('.crash-fallback')?.textContent?.slice(0, 800) || '',
  })`)
  throw new Error(`${error.message}: ${JSON.stringify(diagnostics)}`)
}
const routedSecondaryPath = await evaluate(`(() => {
  const separator = location.hash.indexOf('?')
  return new URLSearchParams(separator >= 0 ? location.hash.slice(separator + 1) : '').get('path') || ''
})()`)
if (normalizeWindowsPath(routedSecondaryPath) !== normalizeWindowsPath(secondaryLaunchFile)) {
  throw new Error(`Single-instance handoff opened an unexpected path: ${JSON.stringify({ routedSecondaryPath, secondaryLaunchFile })}`)
}
checks.push({ id: 'installed-single-instance-external-handoff', status: 'passed' })

const mainTarget = await waitForCdpTarget(item => ![coldTarget.id, secondaryTarget.id].includes(item.id), 1200)
await activateTarget(mainTarget)
await waitFor(`document.querySelector('.app-container')?.dataset.windowRole === 'main'`, 'installed main window shell', 1200)
await navigate('#/workspace', '.workspace-home', 'installed workspace initialization')
await waitFor(
  `document.querySelector('[data-testid="knowledge-network-pulse"]') !== null`,
  'installed workspace initialization before route testing',
  1200,
)
await delay(750)

const textRoute = `#/library?path=${encodeURIComponent(textFile)}`
await navigate(textRoute, '.library-embedded-editor .text-workspace', 'installed embedded TXT editor')
await waitFor(`document.querySelector(${JSON.stringify(embeddedEditorSelector)})?.textContent?.includes('R5J_TEXT_INITIAL') === true`, 'initial TXT content')
const savedText = 'R5J_TEXT_SAVED\ninstalled-right-side-workspace=true'
await setEditorText(savedText)
await saveShortcut()
await waitForFile(textFile, 'R5J_TEXT_SAVED', 'installed TXT disk save')
await navigate('#/workspace', '.workspace-home', 'workspace between installed TXT reopen')
await navigate(textRoute, '.library-embedded-editor .text-workspace', 'reopened installed TXT editor')
await waitFor(`document.querySelector(${JSON.stringify(embeddedEditorSelector)})?.textContent?.includes('R5J_TEXT_SAVED') === true`, 'reopened installed TXT content')
await assertNoGlobalFallback('reopened installed TXT editor')
const textVisual = await assertEditorTextVisible('R5J_TEXT_SAVED', 'reopened installed TXT editor')
await capture('installed-txt-save-reopen.jpg')
checks.push({ id: 'installed-txt-read-edit-save-reopen', status: 'passed', visual: textVisual })

const jsonRoute = `#/library?path=${encodeURIComponent(jsonFile)}`
await navigate(jsonRoute, '.library-embedded-editor .json-workspace', 'installed embedded JSON editor')
await waitFor(`document.querySelector(${JSON.stringify(embeddedEditorSelector)})?.textContent?.includes('R5J_JSON_INITIAL') === true`, 'initial JSON content')
const savedJson = '{\n  "marker": "R5J_JSON_SAVED",\n  "installed": true\n}'
await setEditorText(savedJson)
await saveShortcut()
await waitForFile(jsonFile, 'R5J_JSON_SAVED', 'installed JSON disk save')
await navigate('#/workspace', '.workspace-home', 'workspace between installed JSON reopen')
await navigate(jsonRoute, '.library-embedded-editor .json-workspace', 'reopened installed JSON editor')
await waitFor(`document.querySelector(${JSON.stringify(embeddedEditorSelector)})?.textContent?.includes('R5J_JSON_SAVED') === true`, 'reopened installed JSON content')
await assertNoGlobalFallback('reopened installed JSON editor')
const jsonVisual = await assertEditorTextVisible('R5J_JSON_SAVED', 'reopened installed JSON editor')
await capture('installed-json-save-reopen.jpg')
checks.push({ id: 'installed-json-read-edit-save-reopen', status: 'passed', visual: jsonVisual })

const clickByTitle = title => evaluate(`(() => {
  const button = document.querySelector(${JSON.stringify(`button[title="${title}"]`)})
  if (!button || button.disabled) return false
  button.click()
  return true
})()`)
const installedDocxResults = []
const installedDocxRunNonce = `${Date.now()}-${process.pid}`
for (const fixture of nativeDocxFixtures) {
  const source = path.join(repoRoot, 'fixtures', 'docx', 'hyperlinks', fixture.sourceFile)
  const runCopyFile = fixture.copyFile.replace(/\.docx$/i, `-${installedDocxRunNonce}.docx`)
  const targetFile = path.join(library, runCopyFile)
  const sourceSha256 = await sha256(source)
  await fs.copyFile(source, targetFile)
  const initialCopySha256 = await sha256(targetFile)
  if (initialCopySha256 !== sourceSha256) throw new Error(`${fixture.producerId} installed fixture copy digest mismatch`)

  const route = `#/library?path=${encodeURIComponent(targetFile)}`
  await navigate(route, '.library-embedded-editor .docx-workspace .docx-page', `${fixture.producerId} installed DOCX`)
  const sampleName = path.basename(targetFile, path.extname(targetFile))
  await waitFor(
    `document.querySelector('.docx-workspace .document-title strong')?.textContent.includes(${JSON.stringify(sampleName)}) === true`,
    `${fixture.producerId} installed DOCX identity`,
    1200,
  )
  const editorAvailable = await evaluate(`(() => {
    if (document.querySelector('.docx-editor')) return true
    const button = document.querySelector('.docx-toolbar button[title="打开 DOCX 页面编辑"]')
    if (!button || button.disabled) return false
    button.click()
    return true
  })()`)
  if (editorAvailable) await waitFor(`document.querySelector('.docx-editor') !== null`, `${fixture.producerId} installed DOCX editor`)
  await waitFor(
    `(() => {
      const select = document.querySelector('.docx-editor .edit-field select')
      if (!select || select.options.length === 0) return false
      return [...select.options].filter(item => item.textContent.trim().startsWith('链接文字')).length === ${fixture.expectedEditableLinks}
    })()`,
    `${fixture.producerId} installed DOCX text targets ready`,
    1200,
  )
  const initialState = await evaluate(`(() => {
    const select = document.querySelector('.docx-editor .edit-field select')
    const labels = select ? [...select.options].map(item => item.textContent.trim()) : []
    return {
      linkTargetLabels: labels.filter(label => label.startsWith('链接文字')),
      editableHyperlinkCount: document.querySelectorAll('.docx-workspace .editable-hyperlink').length,
    }
  })()`)
  if (initialState.linkTargetLabels.length !== fixture.expectedEditableLinks || initialState.editableHyperlinkCount !== fixture.expectedEditableLinks) {
    throw new Error(`${fixture.producerId} installed link target count failed: ${JSON.stringify(initialState)}`)
  }
  const result = {
    producerId: fixture.producerId,
    sourceFile: fixture.sourceFile,
    route: `#/library?path=<disposable-library>/${encodeURIComponent(runCopyFile)}`,
    sourceSha256,
    expectedEditableLinks: fixture.expectedEditableLinks,
    linkTargetLabels: initialState.linkTargetLabels,
    editableHyperlinkCount: initialState.editableHyperlinkCount,
    linkPromptVerified: false,
    draftCreated: false,
    undoVerified: false,
    redoVerified: false,
    isolatedPreviewVerified: false,
    saveBoundaryVerified: false,
    sourceUnchanged: false,
    screenshot: '',
  }

  if (fixture.expectedEditableLinks > 0) {
    if (!editorAvailable) throw new Error(`${fixture.producerId} installed DOCX editor unavailable`)
    const selected = await evaluate(`(() => {
      const select = document.querySelector('.docx-editor .edit-field select')
      const option = select ? [...select.options].find(item => item.textContent.trim().startsWith('链接文字')) : null
      if (!option) return false
      select.value = option.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)
    if (!selected) throw new Error(`${fixture.producerId} installed link target selection failed`)
    await waitFor(
      `[...document.querySelectorAll('.docx-editor .edit-field > span')].some(node => node.textContent.trim() === '替换链接文字（地址保持不变）')`,
      `${fixture.producerId} installed link boundary prompt`,
    )
    result.linkPromptVerified = true
    const changed = await evaluate(`(() => {
      const textarea = document.querySelector('.docx-editor .edit-field textarea')
      if (!textarea) return false
      const suffix = ' [UX33J 安装态草稿]'
      textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: suffix }))
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, textarea.value + suffix)
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: suffix }))
      return true
    })()`)
    if (!changed) throw new Error(`${fixture.producerId} installed draft edit failed`)
    await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim() === '1/32'`, `${fixture.producerId} installed draft`)
    result.draftCreated = true
    if (!await clickByTitle('撤销草稿修改')) throw new Error(`${fixture.producerId} installed undo unavailable`)
    await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim() === '0/32'`, `${fixture.producerId} installed undo`)
    result.undoVerified = true
    if (!await clickByTitle('重做草稿修改')) throw new Error(`${fixture.producerId} installed redo unavailable`)
    await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim() === '1/32'`, `${fixture.producerId} installed redo`)
    result.redoVerified = true
    const previewStarted = await evaluate(`(() => {
      const button = document.querySelector('.docx-editor .verify-edit')
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`)
    if (!previewStarted) throw new Error(`${fixture.producerId} installed isolated preview unavailable`)
    await waitFor(
      `document.querySelector('.docx-editor .edit-verification:not(.error)')?.textContent.includes('隔离验证通过')`,
      `${fixture.producerId} installed isolated preview`,
      1200,
    )
    result.isolatedPreviewVerified = true
    result.saveBoundaryVerified = await evaluate(`(() => {
      const text = document.querySelector('.docx-editor .copy-save')?.textContent || ''
      return text.includes('会覆盖当前 DOCX') && text.includes('或者另存副本')
    })()`)
    if (!result.saveBoundaryVerified) throw new Error(`${fixture.producerId} installed save boundary missing`)
    await evaluate(`document.querySelector('.docx-editor')?.scrollTo({ top: document.querySelector('.docx-editor').scrollHeight, behavior: 'instant' })`)
    await delay(200)
    result.screenshot = `installed-${fixture.producerId}-docx-hyperlink.jpg`
    await capture(result.screenshot)
    if (!await clickByTitle('撤销草稿修改')) throw new Error(`${fixture.producerId} installed cleanup undo unavailable`)
    await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim() === '0/32'`, `${fixture.producerId} installed draft cleanup`)
  } else {
    result.screenshot = `installed-${fixture.producerId}-docx-hyperlink-readonly.jpg`
    await capture(result.screenshot)
  }
  result.sourceUnchanged = await sha256(source) === sourceSha256 && await sha256(targetFile) === initialCopySha256
  if (!result.sourceUnchanged) throw new Error(`${fixture.producerId} installed fixture changed during preview audit`)
  installedDocxResults.push(result)
  checks.push({ id: `installed-docx-hyperlink-${fixture.producerId}`, status: 'passed' })
}
await fs.writeFile(path.join(output, 'installed-docx-hyperlink-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'UX-33J',
  capturedAt: new Date().toISOString(),
  environment: 'Disposable Windows installed current NSIS artifact with Tauri WebView2',
  evidenceBoundary: 'unsigned internal candidate; not a signed release candidate',
  appVersion,
  sourceCommit,
  installerSha256,
  sourceUserContentIncluded: false,
  results: installedDocxResults,
}, null, 2)}\n`)

await navigate('#/workspace', '.workspace-home', 'installed workspace knowledge network pulse')
await waitFor(`Number(document.querySelector('[data-testid="knowledge-network-coverage"]')?.getAttribute('aria-valuenow')) > 0`, 'installed knowledge network coverage')
await waitFor(`document.querySelectorAll('[data-testid="knowledge-network-topic"]').length > 0`, 'installed knowledge network top topics')
await waitFor(`document.querySelector('[data-testid="knowledge-network-guidance"]') !== null`, 'installed actionable knowledge guidance')
const knowledgePulse = await evaluate(`(() => {
  const pulse = document.querySelector('[data-testid="knowledge-network-pulse"]')
  const coverage = document.querySelector('[data-testid="knowledge-network-coverage"]')
  const guidance = document.querySelector('[data-testid="knowledge-network-guidance"]')
  const topics = [...document.querySelectorAll('[data-testid="knowledge-network-topic"]')].map(button => ({
    nodeId: button.getAttribute('data-node-id'),
    title: button.querySelector('span')?.textContent || '',
    relationCount: Number(button.querySelector('b')?.textContent || 0),
  }))
  return {
    objectCount: Number(pulse?.getAttribute('data-object-count') || 0),
    relationCount: Number(pulse?.getAttribute('data-relation-count') || 0),
    connectedObjectCount: Number(pulse?.getAttribute('data-connected-count') || 0),
    isolatedObjectCount: Number(pulse?.getAttribute('data-isolated-count') || 0),
    coveragePercent: Number(coverage?.getAttribute('aria-valuenow') || 0),
    relationTypes: [...document.querySelectorAll('.pulse-types [data-relation-type]')].map(item => item.getAttribute('data-relation-type')),
    guidance: {
      code: guidance?.getAttribute('data-guidance-code') || '',
      title: guidance?.querySelector('b')?.textContent || '',
      detail: guidance?.querySelector('small')?.textContent || '',
    },
    topics,
  }
})()`)
if (knowledgePulse.objectCount < 5 || knowledgePulse.relationCount < 3 || knowledgePulse.coveragePercent < 60 ||
    knowledgePulse.connectedObjectCount <= knowledgePulse.isolatedObjectCount || knowledgePulse.topics.length < 1 ||
    !knowledgePulse.relationTypes.includes('depends-on') || !knowledgePulse.relationTypes.includes('supports') ||
    knowledgePulse.guidance.code !== 'network-health-on-track' || !knowledgePulse.guidance.title.includes('状态良好')) {
  throw new Error(`Installed knowledge network pulse is not useful: ${JSON.stringify(knowledgePulse)}`)
}
await capture('installed-knowledge-network-pulse.jpg')
checks.push({ id: 'installed-knowledge-network-pulse', status: 'passed' })

await waitFor(`document.querySelector('[data-testid="knowledge-observation-entry"]') !== null`, 'workspace knowledge observation entry')
await evaluate(`document.querySelector('[data-testid="knowledge-observation-entry"]')?.click()`)
await waitFor(`location.hash.includes('/settings?focus=knowledge-observation') && document.querySelector('[data-testid="knowledge-observation-export"].is-route-focused') !== null`, 'workspace baseline entry focused Settings destination', 1200)
await waitForStableVisibleSurface('[data-testid="knowledge-observation-export"]', 'workspace baseline entry target in settled viewport')
const workspaceObservationNavigation = await evaluate(`(() => ({
  route: location.hash,
  targetVisible: document.querySelector('[data-testid="knowledge-observation-export"]') !== null,
  targetFocused: document.querySelector('[data-testid="knowledge-observation-export"]')?.classList.contains('is-route-focused') === true,
  openedInCurrentWindow: window.opener === null,
}))()`)
if (!workspaceObservationNavigation.route.includes('/settings?focus=knowledge-observation') ||
    !workspaceObservationNavigation.targetVisible || !workspaceObservationNavigation.targetFocused ||
    !workspaceObservationNavigation.openedInCurrentWindow) {
  throw new Error(`Installed workspace observation entry failed: ${JSON.stringify(workspaceObservationNavigation)}`)
}
await capture('installed-workspace-observation-entry.jpg')

await navigate('#/workspace', '.workspace-home', 'workspace before actionable guidance navigation')
await waitFor(`document.querySelector('[data-testid="knowledge-network-guidance"]') !== null`, 'restored actionable knowledge guidance')
await evaluate(`document.querySelector('[data-testid="knowledge-network-guidance"]')?.click()`)
await waitFor(`document.querySelector('.graph-container') !== null`, 'actionable guidance graph route mount')
await waitFor(`document.querySelector('.page-loader') === null`, 'actionable guidance graph route transition')
const guidanceNavigation = await evaluate(`(() => ({
  route: location.hash,
  graphVisible: document.querySelector('.graph-container') !== null,
  openedInCurrentWindow: window.opener === null,
}))()`)
if (!guidanceNavigation.route.startsWith('#/graph') || !guidanceNavigation.graphVisible || !guidanceNavigation.openedInCurrentWindow) {
  throw new Error(`Installed actionable guidance navigation failed: ${JSON.stringify(guidanceNavigation)}`)
}
await capture('installed-knowledge-guidance-graph.jpg')
checks.push({ id: 'installed-actionable-knowledge-guidance', status: 'passed' })

await waitFor(`document.querySelector('[data-testid="knowledge-outcome-entry"]') !== null`, 'graph knowledge outcome entry')
await evaluate(`document.querySelector('[data-testid="knowledge-outcome-entry"]')?.click()`)
await waitFor(`location.hash.includes('/settings?focus=knowledge-observation') && document.querySelector('[data-testid="knowledge-observation-export"].is-route-focused') !== null`, 'graph outcome entry focused Settings destination', 1200)
await waitForStableVisibleSurface('[data-testid="knowledge-observation-export"]', 'graph outcome entry target in settled viewport')
const graphOutcomeNavigation = await evaluate(`(() => ({
  route: location.hash,
  targetVisible: document.querySelector('[data-testid="knowledge-observation-export"]') !== null,
  targetFocused: document.querySelector('[data-testid="knowledge-observation-export"]')?.classList.contains('is-route-focused') === true,
  openedInCurrentWindow: window.opener === null,
}))()`)
if (!graphOutcomeNavigation.route.includes('/settings?focus=knowledge-observation') ||
    !graphOutcomeNavigation.targetVisible || !graphOutcomeNavigation.targetFocused ||
    !graphOutcomeNavigation.openedInCurrentWindow) {
  throw new Error(`Installed graph outcome entry failed: ${JSON.stringify(graphOutcomeNavigation)}`)
}
await capture('installed-graph-outcome-entry.jpg')
await fs.writeFile(path.join(output, 'installed-knowledge-observation-entry-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'G15D',
  evidenceLevel: 'installed-current-tauri-webview2-synthetic-library-navigation-only',
  sourceUserContentIncluded: false,
  exportTriggered: false,
  visualSurfaceSettled: true,
  workspaceObservationNavigation,
  graphOutcomeNavigation,
}, null, 2)}\n`)
checks.push({ id: 'installed-knowledge-observation-entry-navigation', status: 'passed' })

await waitFor(`document.querySelector('[data-testid="knowledge-observation-session"]') !== null`, 'installed consented observation session')
await evaluate(`document.querySelector('[data-testid="knowledge-observation-session-reset"]')?.click()`)
await waitFor(`document.querySelector('[data-testid="knowledge-observation-session"]')?.getAttribute('data-phase') === '1'`, 'reset observation session phase')
await evaluate(`document.querySelector('[data-testid="knowledge-session-save-baseline"]')?.scrollIntoView({ block: 'center' })`)
await waitForStableVisibleSurface('[data-testid="knowledge-session-save-baseline"]', 'installed observation session start action')
await capture('installed-knowledge-session-start.jpg')
await evaluate(`document.querySelector('[data-testid="knowledge-session-existing-baseline"]')?.click()`)
await waitFor(`document.querySelector('[data-testid="knowledge-observation-session"]')?.getAttribute('data-phase') === '2'`, 'existing baseline session handoff')
await evaluate(`document.querySelector('[data-testid="knowledge-session-open-guidance"]')?.click()`)
await waitFor(`document.querySelector('.workspace-home') !== null && document.querySelector('.page-loader') === null`, 'observation session Workspace handoff', 1200)
await waitFor(`document.querySelector('[data-testid="knowledge-observation-entry"]') !== null`, 'observation session return entry')
await evaluate(`document.querySelector('[data-testid="knowledge-observation-entry"]')?.click()`)
await waitFor(`location.hash.includes('/settings?focus=knowledge-observation') && document.querySelector('[data-testid="knowledge-observation-session"]')?.getAttribute('data-phase') === '2'`, 'observation session resumed in Settings', 1200)
await waitForStableVisibleSurface('[data-testid="knowledge-session-remediation-complete"]', 'installed remediation confirmation action')
await evaluate(`document.querySelector('[data-testid="knowledge-session-remediation-complete"]')?.click()`)
await waitFor(`document.querySelector('[data-testid="knowledge-observation-session"]')?.getAttribute('data-phase') === '3' && document.querySelector('[data-testid="knowledge-session-compare"]')?.disabled === false`, 'installed comparison action unlocked')
await evaluate(`document.querySelector('[data-testid="knowledge-session-compare"]')?.scrollIntoView({ block: 'center' })`)
await waitForStableVisibleSurface('[data-testid="knowledge-session-compare"]', 'installed comparison action in settled viewport')
const knowledgeSessionEvidence = await evaluate(`(() => {
  const stored = JSON.parse(sessionStorage.getItem('longedit:knowledge-observation-session:v1') || '{}')
  return {
    phase: Number(document.querySelector('[data-testid="knowledge-observation-session"]')?.getAttribute('data-phase') || 0),
    storedKeys: Object.keys(stored).sort(),
    storedSchemaVersion: stored.schemaVersion,
    storedPhase: stored.phase,
    comparisonUnlocked: document.querySelector('[data-testid="knowledge-session-compare"]')?.disabled === false,
    route: location.hash,
    openedInCurrentWindow: window.opener === null,
  }
})()`)
if (knowledgeSessionEvidence.phase !== 3 || knowledgeSessionEvidence.storedSchemaVersion !== 1 ||
    knowledgeSessionEvidence.storedPhase !== 3 || JSON.stringify(knowledgeSessionEvidence.storedKeys) !== JSON.stringify(['phase', 'schemaVersion']) ||
    !knowledgeSessionEvidence.comparisonUnlocked || !knowledgeSessionEvidence.route.includes('/settings?focus=knowledge-observation') ||
    !knowledgeSessionEvidence.openedInCurrentWindow) {
  throw new Error(`Installed consented observation session failed: ${JSON.stringify(knowledgeSessionEvidence)}`)
}
await capture('installed-knowledge-session-ready.jpg')
await fs.writeFile(path.join(output, 'installed-knowledge-session-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'G15E',
  evidenceLevel: 'installed-current-tauri-webview2-synthetic-library-guidance-only',
  sourceUserContentIncluded: false,
  exportTriggered: false,
  automaticRemediationTriggered: false,
  knowledgeSessionEvidence,
}, null, 2)}\n`)
checks.push({ id: 'installed-consented-real-library-session-guidance', status: 'passed' })

await navigate('#/workspace', '.workspace-home', 'workspace before centered knowledge topic navigation')
await waitFor(`document.querySelectorAll('[data-testid="knowledge-network-topic"]').length > 0`, 'restored installed knowledge network top topics')

const selectedTopic = knowledgePulse.topics[0]
await evaluate(`document.querySelector('[data-testid="knowledge-network-topic"]')?.click()`)
await waitFor(`document.querySelector('.graph-container') !== null`, 'knowledge graph route mount')
await waitFor(`document.querySelector('.page-loader') === null`, 'knowledge graph route transition')
await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.getAttribute('data-node-id') === ${JSON.stringify(selectedTopic.nodeId)}`, 'centered graph topic selection')
await delay(500)
const centeredNavigation = await evaluate(`(() => ({
  nodeId: document.querySelector('[data-testid="graph-selected-node"]')?.getAttribute('data-node-id') || '',
  title: document.querySelector('[data-testid="graph-selected-node"] h3')?.textContent || '',
  route: location.hash,
}))()`)
if (centeredNavigation.nodeId !== selectedTopic.nodeId || centeredNavigation.title !== selectedTopic.title || !centeredNavigation.route.includes('root=')) {
  throw new Error(`Installed centered graph navigation failed: ${JSON.stringify(centeredNavigation)}`)
}
await capture('installed-knowledge-topic-centered.jpg')
checks.push({ id: 'installed-knowledge-topic-centered-navigation', status: 'passed' })

await navigate('#/settings?focus=knowledge-observation', '.settings-view', 'installed consented knowledge observation settings')
await waitFor(`document.querySelector('[data-testid="knowledge-observation-export"]') !== null`, 'knowledge observation baseline surface')
await waitFor(`document.querySelector('[data-testid="knowledge-observation-compare"]') !== null`, 'knowledge observation comparison action')
const observationSurface = await evaluate(`(() => ({
  baselineVisible: document.querySelector('[data-testid="knowledge-observation-export"]') !== null,
  comparisonVisible: document.querySelector('[data-testid="knowledge-observation-compare"]') !== null,
  comparisonLabel: document.querySelector('[data-testid="knowledge-observation-compare"]')?.textContent?.trim() || '',
  openedInCurrentWindow: window.opener === null,
}))()`)
if (!observationSurface.baselineVisible || !observationSurface.comparisonVisible ||
    !observationSurface.comparisonLabel.includes('对比改善结果') || !observationSurface.openedInCurrentWindow) {
  throw new Error(`Installed knowledge observation surface failed: ${JSON.stringify(observationSurface)}`)
}
await evaluate(`document.querySelector('[data-testid="knowledge-observation-export"]')?.scrollIntoView({ block: 'center' })`)
await delay(350)
observationSurface.viewportVisible = await evaluate(`(() => {
  const element = document.querySelector('[data-testid="knowledge-observation-export"]')
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 100 && rect.height > 30 && rect.top >= 0 && rect.bottom <= window.innerHeight
})()`)
if (!observationSurface.viewportVisible) {
  throw new Error(`Installed knowledge observation surface is outside the screenshot viewport: ${JSON.stringify(observationSurface)}`)
}
await capture('installed-knowledge-observation-settings.jpg')

const observationBaseline = await invokeTauri('export_knowledge_graph_observation', {
  libraryRoot: library,
  targetPath: knowledgeBaselineFile,
})
await fs.writeFile(knowledgeImprovementFixture, `---\nrelations:\n  supports: [[r5j-north-star]]\n---\n# G15C Linked Follow-up\n`)
const comparisonPreview = await invokeTauri('get_knowledge_graph_observation_comparison', {
  libraryRoot: library,
  baselinePath: knowledgeBaselineFile,
})
const comparisonReceipt = await invokeTauri('export_knowledge_graph_observation_comparison', {
  libraryRoot: library,
  baselinePath: knowledgeBaselineFile,
  targetPath: knowledgeComparisonFile,
})
if (observationBaseline.stage !== 'G12' || comparisonPreview.stage !== 'G15B' ||
    comparisonReceipt.stage !== 'G15B' || comparisonReceipt.outcome !== 'improved' ||
    comparisonReceipt.changes.relationCount < 1 || comparisonReceipt.changes.connectedObjectCount < 1 ||
    comparisonReceipt.sourceUserContentIncluded || comparisonReceipt.objectIdentifiersIncluded ||
    comparisonReceipt.fileNamesIncluded || comparisonReceipt.absolutePathsIncluded ||
    comparisonReceipt.current.objectCount !== comparisonPreview.current.objectCount ||
    comparisonReceipt.current.relationCount !== comparisonPreview.current.relationCount ||
    comparisonReceipt.outcome !== comparisonPreview.outcome) {
  throw new Error(`Installed knowledge guidance outcome failed: ${JSON.stringify({ observationBaseline, comparisonPreview, comparisonReceipt })}`)
}
const serializedComparison = await fs.readFile(knowledgeComparisonFile, 'utf8')
for (const forbidden of [library, 'r5j-north-star.md', 'g15c-linked-follow-up.md', 'R5J North Star', 'G15C Linked Follow-up']) {
  if (serializedComparison.includes(forbidden)) throw new Error(`Installed knowledge comparison leaked synthetic identifier: ${forbidden}`)
}
const reviewedComparison = await invokeTauri('review_knowledge_graph_observation_comparison', {
  receiptPath: knowledgeComparisonFile,
})
const invalidComparison = JSON.parse(serializedComparison)
invalidComparison.libraryPath = library
await fs.writeFile(invalidKnowledgeComparisonFile, `${JSON.stringify(invalidComparison, null, 2)}\n`)
let unknownFieldRejected = false
try {
  await invokeTauri('review_knowledge_graph_observation_comparison', {
    receiptPath: invalidKnowledgeComparisonFile,
  })
} catch {
  unknownFieldRejected = true
} finally {
  await fs.rm(invalidKnowledgeComparisonFile, { force: true })
}
await evaluate(`document.querySelector('[data-testid="knowledge-session-review"]')?.scrollIntoView({ block: 'center' })`)
await waitForStableVisibleSurface('[data-testid="knowledge-session-review"]', 'installed local comparison receipt review entry')
const receiptReviewSurface = await evaluate(`(() => {
  const entry = document.querySelector('[data-testid="knowledge-session-review"]')
  const storage = [...Object.entries(localStorage), ...Object.entries(sessionStorage)]
  const forbidden = ${JSON.stringify([knowledgeComparisonFile, path.basename(knowledgeComparisonFile)])}
  return {
    entryVisible: entry !== null,
    entryLabel: entry?.textContent?.trim() || '',
    openedInCurrentWindow: window.opener === null,
    pathRendered: forbidden.some(value => document.body?.innerText?.includes(value)),
    pathPersisted: storage.some(([, value]) => forbidden.some(item => String(value).includes(item))),
  }
})()`)
if (reviewedComparison.stage !== 'G15B' || reviewedComparison.outcome !== comparisonReceipt.outcome ||
    reviewedComparison.current.relationCount !== comparisonReceipt.current.relationCount ||
    reviewedComparison.changes.connectedObjectCount !== comparisonReceipt.changes.connectedObjectCount ||
    reviewedComparison.sourceUserContentIncluded || reviewedComparison.objectIdentifiersIncluded ||
    reviewedComparison.fileNamesIncluded || reviewedComparison.absolutePathsIncluded || !unknownFieldRejected ||
    !receiptReviewSurface.entryVisible || !receiptReviewSurface.entryLabel.includes('查看已保存结果') ||
    !receiptReviewSurface.openedInCurrentWindow || receiptReviewSurface.pathRendered || receiptReviewSurface.pathPersisted) {
  throw new Error(`Installed local comparison receipt review failed: ${JSON.stringify({ reviewedComparison, unknownFieldRejected, receiptReviewSurface })}`)
}
await capture('installed-knowledge-receipt-review-entry.jpg')
await fs.writeFile(path.join(output, 'installed-knowledge-receipt-review-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'G15F',
  evidenceLevel: 'installed-current-tauri-webview2-synthetic-local-receipt-review',
  sourceUserContentIncluded: false,
  receiptPathPersisted: false,
  automaticUploadTriggered: false,
  unknownFieldRejected,
  receiptReviewSurface,
  reviewedComparison,
}, null, 2)}\n`)
checks.push({ id: 'installed-local-comparison-receipt-review', status: 'passed' })
const knowledgeGuidanceOutcome = {
  observationSurface,
  baseline: {
    objectCount: observationBaseline.objectCount,
    relationCount: observationBaseline.relationCount,
    connectedObjectCount: observationBaseline.connectedObjectCount,
    isolatedObjectCount: observationBaseline.isolatedObjectCount,
    coveragePercent: observationBaseline.coveragePercent,
  },
  comparison: comparisonReceipt,
}
await fs.writeFile(path.join(output, 'installed-knowledge-guidance-outcome-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'G15C',
  evidenceLevel: 'installed-current-tauri-webview2-synthetic-library-aggregate-only',
  sourceUserContentIncluded: false,
  ...knowledgeGuidanceOutcome,
}, null, 2)}\n`)
checks.push({ id: 'installed-consented-knowledge-guidance-outcome', status: 'passed' })

await navigate('#/release-capabilities', '.release-capabilities', 'installed default-app candidate surface')
for (const formatId of ['opml', 'raster-image']) {
  const selector = `[data-format-id="${formatId}"]`
  const buttonSelector = `[data-testid="default-app-candidate-${formatId}"]`
  const expanded = await evaluate(`(() => {
    const details = document.querySelector(${JSON.stringify(selector)})
    if (!details) return false
    details.open = true
    details.dispatchEvent(new Event('toggle'))
    return true
  })()`)
  if (!expanded) throw new Error(`Installed default-app row is missing: ${formatId}`)
  await waitFor(`document.querySelector(${JSON.stringify(buttonSelector)})?.disabled === false`, `${formatId} default-app action`)
  const clicked = await evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(buttonSelector)})
    if (!button || button.disabled) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Installed default-app action could not be triggered: ${formatId}`)
  await waitFor(
    `document.querySelector(${JSON.stringify(buttonSelector)})?.dataset.prepared === 'true'`,
    `${formatId} default-app candidate preparation`,
    1200,
  )
}
await capture('installed-default-app-candidates.jpg')
checks.push({ id: 'installed-user-triggered-default-app-candidates', status: 'passed' })

const routes = [
  ['#/workspace', '.workspace-home', '/workspace'],
  ['#/library', '.library-mode', '/library'],
  ['#/text', '.text-workspace', '/text'],
  ['#/json', '.json-workspace', '/json'],
  ['#/pdf', '.pdf-view', '/pdf'],
  ['#/workbook', '.workbook-view', '/workbook'],
  ['#/diagram', '.diagram-studio', '/diagram'],
  ['#/mindmap', '.mindmap-page', '/mindmap'],
  ['#/graph', '.graph-container', '/graph'],
  ['#/canvas', '.canvas-page', '/canvas'],
  ['#/release-capabilities', '.release-capabilities', '/release-capabilities'],
]
const routeResults = []
for (const [hash, selector, route] of routes) {
  await navigate(hash, selector, `${route} installed route`)
  routeResults.push({ route, status: 'passed', crashFallbackVisible: false, routeWrapperMounted: true })
}
checks.push({ id: 'installed-representative-right-side-routes', status: 'passed' })

const performanceEvidence = await evaluate(`window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__()`)
if (!performanceEvidence?.routes?.length || !performanceEvidence?.measures?.length) {
  throw new Error('Installed desktop route performance export was empty')
}
checks.push({ id: 'installed-route-performance-export', status: 'passed' })

const executableStats = await fs.stat(installedExecutable)
const capturedAt = new Date().toISOString()
await fs.writeFile(path.join(output, 'installed-knowledge-network-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'G14',
  capturedAt,
  evidenceLevel: 'installed-current-tauri-webview2-synthetic-library',
  sourceUserContentIncluded: false,
  knowledgePulse,
  guidanceNavigation,
  centeredNavigation,
}, null, 2)}\n`)
await fs.writeFile(path.join(output, 'installed-route-mount-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5J',
  capturedAt,
  evidenceLevel: 'installed-current-tauri-webview2',
  sourceUserContentIncluded: false,
  routes: routeResults,
}, null, 2)}\n`)
await fs.writeFile(path.join(output, 'installed-route-performance-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5J',
  capturedAt,
  evidenceLevel: 'installed-current-tauri-webview2',
  sourceUserContentIncluded: false,
  routes: performanceEvidence.routes,
  measures: performanceEvidence.measures,
}, null, 2)}\n`)
await fs.writeFile(path.join(output, 'installed-artifact-smoke.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5J',
  appVersion,
  capturedAt,
  environment: 'Disposable Windows installed current NSIS artifact',
  status: 'passed',
  releaseCandidate: false,
  promotionEligible: false,
  signedArtifactRuntimeProven,
  sourceUserContentIncluded: false,
  installerSha256,
  installedExecutable: {
    fileName: path.basename(installedExecutable),
    sizeBytes: executableStats.size,
    sha256: await sha256(installedExecutable),
  },
  checks,
  evidenceFiles: [
    'installed-txt-save-reopen.jpg',
    'installed-json-save-reopen.jpg',
    'installed-default-app-candidates.jpg',
    'installed-default-app-lifecycle-evidence.json',
    'installed-microsoft-word-docx-hyperlink.jpg',
    'installed-wps-writer-docx-hyperlink-readonly.jpg',
    'installed-libreoffice-writer-docx-hyperlink.jpg',
    'installed-docx-hyperlink-evidence.json',
    'installed-knowledge-network-pulse.jpg',
    'installed-knowledge-guidance-graph.jpg',
    'installed-knowledge-topic-centered.jpg',
    'installed-knowledge-network-evidence.json',
    'installed-workspace-observation-entry.jpg',
    'installed-graph-outcome-entry.jpg',
    'installed-knowledge-observation-entry-evidence.json',
    'installed-knowledge-session-start.jpg',
    'installed-knowledge-session-ready.jpg',
    'installed-knowledge-session-evidence.json',
    'installed-knowledge-observation-settings.jpg',
    'installed-knowledge-observation-baseline.json',
    'installed-knowledge-guidance-comparison.json',
    'installed-knowledge-guidance-outcome-evidence.json',
    'installed-knowledge-receipt-review-entry.jpg',
    'installed-knowledge-receipt-review-evidence.json',
    'installed-route-mount-evidence.json',
    'installed-route-performance-evidence.json',
  ],
}, null, 2)}\n`)

await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`R5J installed artifact smoke passed ${checks.length} checks across ${routeResults.length} routes`)
