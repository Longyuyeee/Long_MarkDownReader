import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14310'
const appOrigin = process.env.LONGEDIT_X3_B3_APP_ORIGIN || 'http://127.0.0.1:14210'
const fixture = path.resolve(process.env.LONGEDIT_X3_B3_FIXTURE || '')
const source = path.resolve(process.env.LONGEDIT_X3_B3_SOURCE || '')
const output = path.resolve(process.env.LONGEDIT_X3_B3_AUDIT_OUTPUT || 'docs/evidence/x3-b3-xlsx-array-desktop')
if (!fixture || !source) throw new Error('X3-B3 fixture and source paths are required')

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
  throw new Error(`Timed out waiting for ${description}`)
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
const chooseArray = async index => {
  const changed = await evaluate(`(() => {
    const select = document.querySelector('.array-formula-strip select')
    if (!(select instanceof HTMLSelectElement)) return false
    select.value = ${JSON.stringify(String(index))}
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!changed) throw new Error(`Unable to choose array formula ${index}`)
  await delay(300)
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
  'X3-B3 workbook array boundary',
)

const checks = []
const assert = (condition, id) => {
  if (!condition) throw new Error(`X3-B3 desktop assertion failed: ${id}`)
  checks.push(id)
}

await chooseArray(1)
const light = await evaluate(`(() => {
  const strip = document.querySelector('.array-formula-strip')
  const selected = document.querySelector('.workbook-cell.selected')
  const recalc = [...document.querySelectorAll('.workbook-actions button')].find(item => item.textContent?.includes('重算'))
  const formulaInput = document.querySelector('.formula-bar input')
  const rect = strip?.getBoundingClientRect()
  return {
    theme: document.body.dataset.theme,
    stripText: strip?.textContent || '',
    selectedTitle: selected?.getAttribute('title') || '',
    selectedArrayAnchor: selected?.classList.contains('array-formula-anchor') || false,
    recalcDisabled: recalc instanceof HTMLButtonElement && recalc.disabled,
    formulaDisabled: formulaInput instanceof HTMLInputElement && formulaInput.disabled,
    rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    stripInsideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth + 1),
  }
})()`)
assert(light.theme === 'white', 'professional-light-theme')
assert(light.stripText.includes('动态数组') && light.stripText.includes('数值 3') && light.stripText.includes('缓存完整'), 'dynamic-cache-type-summary')
assert(light.selectedArrayAnchor && light.selectedTitle.includes('D2:D4'), 'dynamic-array-anchor-selection')
assert(light.recalcDisabled && light.formulaDisabled, 'array-calculation-and-edit-blocked')
assert(!light.rootOverflow && light.stripInsideViewport, 'light-layout-contained')
await capture('professional-light-dynamic-array-1280.jpg')

await applyPreset('professional-dark', 'dark')
await resize(1024, 720)
await chooseArray(0)
const dark = await evaluate(`(() => {
  const strip = document.querySelector('.array-formula-strip')
  const selected = document.querySelector('.workbook-cell.selected')
  const rect = strip?.getBoundingClientRect()
  return {
    theme: document.body.dataset.theme,
    stripText: strip?.textContent || '',
    selectedTitle: selected?.getAttribute('title') || '',
    selectedArrayAnchor: selected?.classList.contains('array-formula-anchor') || false,
    rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    stripInsideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth + 1),
  }
})()`)
assert(dark.theme === 'dark', 'professional-dark-theme')
assert(dark.stripText.includes('传统数组') && dark.stripText.includes('数值 3') && dark.stripText.includes('传统数组范围'), 'legacy-cache-type-summary')
assert(dark.selectedArrayAnchor && dark.selectedTitle.includes('B2:B4'), 'legacy-array-anchor-selection')
assert(!dark.rootOverflow && dark.stripInsideViewport, 'compact-layout-contained')
await capture('professional-dark-legacy-array-1024.jpg')

const sourceAfter = await fs.readFile(source)
const sourceUnchanged = sourceBefore.equals(sourceAfter)
assert(sourceUnchanged, 'source-fixture-byte-unchanged')
const evidenceFiles = [
  'professional-light-dynamic-array-1280.jpg',
  'professional-dark-legacy-array-1024.jpg',
]
const manifest = {
  schemaVersion: 1,
  stage: 'X3-B3',
  capturedAt: new Date().toISOString(),
  source: path.relative(process.cwd(), source).replaceAll('\\', '/'),
  sourceSha256: createHash('sha256').update(sourceAfter).digest('hex'),
  sourceUnchanged,
  checks,
  viewports: [
    { width: 1280, height: 800, theme: 'professional-light', focus: 'dynamic-array' },
    { width: 1024, height: 720, theme: 'professional-dark', focus: 'legacy-array' },
  ],
  evidenceFiles,
  boundaries: {
    expectedSpillCalculation: false,
    arrayWriteback: false,
    conflictFixtureVisualEvidence: false,
  },
}
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
socket.close()
console.log(`X3-B3 desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
