import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14320'
const appOrigin = process.env.LONGEDIT_X3_B4_APP_ORIGIN || 'http://127.0.0.1:14200'
const fixture = path.resolve(process.env.LONGEDIT_X3_B4_FIXTURE || '')
const source = path.resolve(process.env.LONGEDIT_X3_B4_SOURCE || '')
const output = path.resolve(process.env.LONGEDIT_X3_B4_AUDIT_OUTPUT || 'docs/evidence/x3-b4-xlsx-array-conflict-desktop')
if (!fixture || !source) throw new Error('X3-B4 fixture and source paths are required')

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
  const diagnostic = await evaluate(`({
    hash: location.hash,
    text: document.body.innerText.slice(0, 1200),
    state: document.querySelector('.workbook-state')?.textContent || '',
    strip: document.querySelector('.array-formula-strip')?.textContent || '',
  })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(diagnostic)}`)
}
const resize = async (width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await delay(250)
}
const capture = async fileName => {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 92,
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
const chooseDynamicArray = async () => {
  const changed = await evaluate(`(() => {
    const select = document.querySelector('.array-formula-strip select')
    if (!(select instanceof HTMLSelectElement)) return false
    select.value = '1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error('Unable to choose the dynamic array formula')
  await delay(300)
}
const clickDiagnostic = async label => {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.array-formula-strip .diagnostic-link')]
      .find(item => item.textContent?.includes(${JSON.stringify(label)}))
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to click ${label}`)
  await delay(450)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await resize(1280, 800)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
await waitFor(`document.querySelector('.page-loader') === null`, 'initial route')
const sourceBefore = await fs.readFile(source)
const route = `#/workbook?path=${encodeURIComponent(fixture)}`
await evaluate(`location.hash = ${JSON.stringify(route)}`)
await waitFor(
  `document.querySelector('.workbook-view') !== null
    && document.querySelector('.workbook-state') === null
    && document.querySelector('.array-formula-strip')?.textContent?.includes('共 2 处') === true`,
  'X3-B4 workbook conflict diagnostic fixture',
)

const checks = []
const assert = (condition, id) => {
  if (!condition) throw new Error(`X3-B4 desktop assertion failed: ${id}`)
  checks.push(id)
}

await chooseDynamicArray()
const summary = await evaluate(`(() => {
  const strip = document.querySelector('.array-formula-strip')
  const buttons = [...document.querySelectorAll('.array-formula-strip .diagnostic-link')].map(item => item.textContent || '')
  const recalc = [...document.querySelectorAll('.workbook-actions button')].find(item => item.textContent?.includes('重算'))
  const formulaInput = document.querySelector('.formula-bar input')
  return {
    theme: document.body.dataset.theme,
    stripText: strip?.textContent || '',
    buttons,
    recalcDisabled: recalc instanceof HTMLButtonElement && recalc.disabled,
    formulaDisabled: formulaInput instanceof HTMLInputElement && formulaInput.disabled,
  }
})()`)
assert(summary.theme === 'white', 'professional-light-theme')
assert(summary.stripText.includes('动态数组') && summary.stripText.includes('数值 2') && summary.stripText.includes('错误 1') && summary.stripText.includes('潜在占用冲突'), 'conflict-cache-summary')
assert(summary.buttons.some(item => item.includes('定位冲突 D3')) && summary.buttons.some(item => item.includes('定位错误缓存 D4')), 'distinct-diagnostic-buttons')
assert(summary.recalcDisabled && summary.formulaDisabled, 'array-calculation-and-edit-blocked')

await clickDiagnostic('定位冲突 D3')
const conflict = await evaluate(`(() => {
  const selected = document.querySelector('.workbook-cell.selected')
  const strip = document.querySelector('.array-formula-strip')
  const rect = strip?.getBoundingClientRect()
  return {
    title: selected?.getAttribute('title') || '',
    conflictClass: selected?.classList.contains('array-formula-conflict') || false,
    rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    stripInsideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth + 1),
  }
})()`)
assert(conflict.title.includes('D3') && conflict.title.includes('冲突：D3') && conflict.conflictClass, 'conflict-address-exact-location')
assert(!conflict.rootOverflow && conflict.stripInsideViewport, 'light-layout-contained')
await capture('professional-light-conflict-d3-1280.jpg')

await applyPreset('professional-dark', 'dark')
await resize(1024, 720)
await clickDiagnostic('定位错误缓存 D4')
const errorCache = await evaluate(`(() => {
  const selected = document.querySelector('.workbook-cell.selected')
  const strip = document.querySelector('.array-formula-strip')
  const rect = strip?.getBoundingClientRect()
  return {
    theme: document.body.dataset.theme,
    title: selected?.getAttribute('title') || '',
    conflictClass: selected?.classList.contains('array-formula-conflict') || false,
    stripText: strip?.textContent || '',
    rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    stripInsideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth + 1),
  }
})()`)
assert(errorCache.theme === 'dark', 'professional-dark-theme')
assert(errorCache.title.includes('#DIV/0!') && errorCache.title.includes('错误缓存：D4'), 'error-cache-address-exact-location')
assert(!errorCache.conflictClass && errorCache.title.includes('D4'), 'error-and-conflict-addresses-remain-distinct')
assert(errorCache.stripText.includes('定位冲突 D3') && errorCache.stripText.includes('定位错误缓存 D4'), 'diagnostic-buttons-remain-visible')
assert(!errorCache.rootOverflow && errorCache.stripInsideViewport, 'compact-layout-contained')
await capture('professional-dark-error-cache-d4-1024.jpg')

const sourceAfter = await fs.readFile(source)
const sourceUnchanged = sourceBefore.equals(sourceAfter)
assert(sourceUnchanged, 'source-fixture-byte-unchanged')
const evidenceFiles = [
  'professional-light-conflict-d3-1280.jpg',
  'professional-dark-error-cache-d4-1024.jpg',
]
const manifest = {
  schemaVersion: 1,
  stage: 'X3-B4',
  capturedAt: new Date().toISOString(),
  source: path.relative(process.cwd(), source).replaceAll('\\', '/'),
  sourceSha256: createHash('sha256').update(sourceAfter).digest('hex'),
  sourceUnchanged,
  checks,
  viewports: [
    { width: 1280, height: 800, theme: 'professional-light', focus: 'conflict-D3' },
    { width: 1024, height: 720, theme: 'professional-dark', focus: 'error-cache-D4' },
  ],
  evidenceFiles,
  boundaries: {
    expectedSpillCalculation: false,
    arrayWriteback: false,
    conflictFixtureVisualEvidence: true,
    addressTruncationCoveredByRustAndUiContract: true,
  },
}
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
socket.close()
console.log(`X3-B4 desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
