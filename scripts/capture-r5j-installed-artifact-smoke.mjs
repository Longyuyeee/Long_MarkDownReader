import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9343'
const library = path.resolve(process.env.LONGEDIT_R5J_LIBRARY || '')
const output = path.resolve(process.env.LONGEDIT_R5J_OUTPUT || '')
const installedExecutable = path.resolve(process.env.LONGEDIT_R5J_EXECUTABLE || '')
const appVersion = process.env.LONGEDIT_R5J_APP_VERSION || ''
const installerSha256 = process.env.LONGEDIT_R5J_INSTALLER_SHA256 || ''
const signedArtifactRuntimeProven = process.env.LONGEDIT_R5J_SIGNED_RUNTIME === 'true'
if (!library || !output || !installedExecutable || !appVersion || !/^[a-f0-9]{64}$/.test(installerSha256)) {
  throw new Error('R5J library, output, executable, version, and installer hash are required')
}

const textFile = path.join(library, 'r5j-notes.txt')
const jsonFile = path.join(library, 'r5j-config.json')
const embeddedEditorSelector = '.library-embedded-editor .cm-content'
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page')
if (!target?.webSocketDebuggerUrl) throw new Error('R5J installed Tauri WebView CDP target was not found')

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

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'installed desktop app bootstrap')
await waitFor(`typeof window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__ === 'function'`, 'route performance export')

const checks = [{ id: 'installed-current-webview-bootstrap', status: 'passed' }]

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

await navigate('#/workspace', '.workspace-home', 'installed workspace knowledge network pulse')
await waitFor(`Number(document.querySelector('[data-testid="knowledge-network-coverage"]')?.getAttribute('aria-valuenow')) > 0`, 'installed knowledge network coverage')
await waitFor(`document.querySelectorAll('[data-testid="knowledge-network-topic"]').length > 0`, 'installed knowledge network top topics')
const knowledgePulse = await evaluate(`(() => {
  const pulse = document.querySelector('[data-testid="knowledge-network-pulse"]')
  const coverage = document.querySelector('[data-testid="knowledge-network-coverage"]')
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
    topics,
  }
})()`)
if (knowledgePulse.objectCount < 5 || knowledgePulse.relationCount < 3 || knowledgePulse.coveragePercent < 60 ||
    knowledgePulse.connectedObjectCount <= knowledgePulse.isolatedObjectCount || knowledgePulse.topics.length < 1 ||
    !knowledgePulse.relationTypes.includes('depends-on') || !knowledgePulse.relationTypes.includes('supports')) {
  throw new Error(`Installed knowledge network pulse is not useful: ${JSON.stringify(knowledgePulse)}`)
}
await capture('installed-knowledge-network-pulse.jpg')
checks.push({ id: 'installed-knowledge-network-pulse', status: 'passed' })

const selectedTopic = knowledgePulse.topics[0]
await evaluate(`document.querySelector('[data-testid="knowledge-network-topic"]')?.click()`)
await waitFor(`document.querySelector('[data-testid="graph-selected-node"]')?.getAttribute('data-node-id') === ${JSON.stringify(selectedTopic.nodeId)}`, 'centered graph topic selection')
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
  stage: 'G11',
  capturedAt,
  evidenceLevel: 'installed-current-tauri-webview2-synthetic-library',
  sourceUserContentIncluded: false,
  knowledgePulse,
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
    'installed-knowledge-network-pulse.jpg',
    'installed-knowledge-topic-centered.jpg',
    'installed-knowledge-network-evidence.json',
    'installed-route-mount-evidence.json',
    'installed-route-performance-evidence.json',
  ],
}, null, 2)}\n`)

await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`R5J installed artifact smoke passed ${checks.length} checks across ${routeResults.length} routes`)
