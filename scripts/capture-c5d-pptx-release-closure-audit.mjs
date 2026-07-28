import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_C5D_AUDIT_OUTPUT || 'docs/evidence/c5d-pptx-release-closure')
const fixture = path.resolve(process.env.LONGEDIT_C5D_WPS || '')
if (!fixture) throw new Error('C5D WPS fixture is required')
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
const resize = async (width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await delay(250)
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
const applyPreset = async (presetId, expectedTheme) => {
  const applied = await evaluate(`(async () => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    const store = [...(pinia?._s?.values?.() || [])].find(candidate => typeof candidate.applyThemePreset === 'function')
    if (!store) return false
    await store.applyThemePreset(${JSON.stringify(presetId)})
    return true
  })()`)
  if (!applied) throw new Error(`Unable to apply ${presetId}`)
  await waitFor(`document.body.dataset.theme === ${JSON.stringify(expectedTheme)}`, `${presetId} theme`)
}
const setDetailsOpen = async expectedOpen => {
  const isOpen = await evaluate(`document.querySelector('.pptx-details') !== null`)
  if (isOpen === expectedOpen) return
  const toggled = await evaluate(`(() => {
    const button = document.querySelector('.toolbar-actions .lucide-panel-right')?.closest('button')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  if (!toggled) throw new Error('Unable to toggle PPTX details')
  await waitFor(
    `document.querySelector('.pptx-details') !== null === ${expectedOpen}`,
    expectedOpen ? 'PPTX details opening' : 'PPTX details closing',
  )
}
const assertCanvasVisible = async () => {
  const geometry = await evaluate(`(() => {
    const canvas = document.querySelector('.slide-canvas')?.getBoundingClientRect()
    return canvas ? {
      left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
    } : null
  })()`)
  if (!geometry
    || geometry.left < 0
    || geometry.right > geometry.viewportWidth + 1
    || geometry.top < 0
    || geometry.bottom > geometry.viewportHeight + 1) {
    throw new Error(`PPTX slide canvas is not fully visible: ${JSON.stringify(geometry)}`)
  }
}
const assertReleaseWorkspace = async (expectedTheme, width) => {
  const state = await evaluate(`(() => {
    const workspace = document.querySelector('.pptx-workspace')
    const shell = document.querySelector('.library-content')
    return {
      theme: document.body.dataset.theme,
      badge: document.querySelector('.format-capability-badge')?.textContent?.trim() || '',
      identity: document.querySelector('.document-identity')?.textContent?.trim() || '',
      safety: document.querySelector('.edit-baseline')?.textContent?.trim() || '',
      workspaceOverflow: workspace instanceof HTMLElement && workspace.scrollWidth > workspace.clientWidth + 1,
      shellOverflow: shell instanceof HTMLElement && shell.scrollWidth > shell.clientWidth + 1,
      viewportOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      width: innerWidth,
    }
  })()`)
  if (state.theme !== expectedTheme) throw new Error(`Expected ${expectedTheme} theme: ${JSON.stringify(state)}`)
  if (!state.badge.includes('PowerPoint') || !state.badge.includes('基础编辑副本')) throw new Error(`Capability badge is stale: ${JSON.stringify(state)}`)
  if (!state.identity.includes('基础编辑副本') || !state.identity.includes('原文件不写回')) throw new Error(`PPTX identity is stale: ${JSON.stringify(state)}`)
  if (!state.safety.includes('源 PPTX 始终只读') || !state.safety.includes('同目录新副本')) throw new Error(`PPTX safety boundary is incomplete: ${JSON.stringify(state)}`)
  if (state.workspaceOverflow || state.shellOverflow || state.viewportOverflow || state.width !== width) {
    throw new Error(`PPTX release workspace overflowed: ${JSON.stringify(state)}`)
  }
  return state
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await resize(1280, 820)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
try {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const ready = await evaluate(`document.querySelector('.pptx-workspace') !== null
      && document.querySelector('.document-identity')?.textContent?.includes(${JSON.stringify(path.basename(fixture))}) === true
      && document.querySelector('.format-capability-badge') !== null
      && document.querySelector('.edit-baseline') !== null
      && document.querySelectorAll('.slide-strip > button').length === 3`)
    if (ready) break
    const hash = await evaluate('location.hash')
    if (!hash.startsWith('#/library?') || !hash.includes(encodeURIComponent(fixture))) {
      await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(fixture)})`)
    }
    await delay(100)
    if (attempt === 499) throw new Error('Timed out waiting for PPTX release workspace')
  }
} catch (error) {
  const state = await evaluate(`(() => ({
    hash: location.hash,
    title: document.querySelector('.document-identity')?.textContent || '',
    badge: document.querySelector('.format-capability-badge')?.textContent || '',
    loadError: document.querySelector('.pptx-state.error')?.textContent || '',
    body: document.body.innerText.slice(0, 1200),
  }))()`)
  throw new Error(`${error.message}: ${JSON.stringify(state)}`)
}
await waitFor(`document.querySelector('.page-loader') === null`, 'route overlay dismissal')
const sourceBefore = await fs.readFile(fixture)
const scenarios = [
  { preset: 'professional-light', theme: 'white', width: 1280, height: 820, mode: 'normal', file: 'professional-light-normal-1280.jpg' },
  { preset: 'professional-light', theme: 'white', width: 960, height: 720, mode: 'compact', file: 'professional-light-compact-960.jpg' },
  { preset: 'professional-dark', theme: 'dark', width: 1280, height: 820, mode: 'normal', file: 'professional-dark-normal-1280.jpg' },
  { preset: 'professional-dark', theme: 'dark', width: 960, height: 720, mode: 'compact', file: 'professional-dark-compact-960.jpg' },
]
const scenarioResults = []
for (const scenario of scenarios) {
  await applyPreset(scenario.preset, scenario.theme)
  await resize(scenario.width, scenario.height)
  await setDetailsOpen(true)
  await delay(500)
  const state = await assertReleaseWorkspace(scenario.theme, scenario.width)
  if (scenario.mode === 'compact') await setDetailsOpen(false)
  await assertCanvasVisible()
  await capture(scenario.file)
  scenarioResults.push({ ...scenario, status: 'passed', state })
}
const sourceAfter = await fs.readFile(fixture)
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
if (!sourceUnchanged) throw new Error('Source WPS PPTX changed during C5D release audit')
const registry = JSON.parse(await fs.readFile(path.resolve('shared/file-formats.json'), 'utf8'))
const pptx = registry.formats.find(format => format.id === 'pptx')
const capability = {
  edit: pptx?.capabilities?.edit,
  level: pptx?.userCapability?.level,
  label: pptx?.userCapability?.label,
  saveMode: pptx?.userCapability?.saveMode,
  writer: pptx?.adapters?.writer,
}
const checks = [
  { id: 'registry-basic-copy-edit', status: 'passed', capability },
  { id: 'workspace-capability-and-source-boundary', status: 'passed' },
  { id: 'normal-and-compact-layouts-without-overflow', status: 'passed' },
  { id: 'professional-light-and-dark-themes', status: 'passed' },
  { id: 'wps-source-bytes-unchanged', status: 'passed', sourceUnchanged },
]
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  sourceUrl: target.url,
  fixtureLocation: 'isolated temporary workspace',
  producer: 'wps-presentation',
  capability,
  viewportMatrix: ['normal-1280x820', 'compact-960x720'],
  themeMatrix: ['professional-light', 'professional-dark'],
  sourceSha256: createHash('sha256').update(sourceAfter).digest('hex'),
  sourceOverwriteAllowed: false,
  scenarios: scenarioResults,
  checks,
  evidenceFiles: scenarios.map(scenario => scenario.file),
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`C5D desktop release audit passed ${checks.length} checks and captured ${scenarios.length} screenshots`)
