import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const output = path.resolve(process.env.LONGEDIT_R2_AUDIT_OUTPUT || 'docs/evidence/r2-windows-lifecycle')
const scenario = process.env.LONGEDIT_R2_AUDIT_SCENARIO
if (!['cloud-paper', 'dark-neon'].includes(scenario)) throw new Error('Unknown R2 audit scenario')
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
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const navigate = async (hash, selector, description) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const ready = await evaluate(`(() => {
      if (document.querySelector(${JSON.stringify(selector)})) return true
      if (location.hash !== ${JSON.stringify(hash)}) location.hash = ${JSON.stringify(hash)}
      return false
    })()`)
    if (ready) return
    await delay(100)
  }
  const state = await evaluate(`({
    hash: location.hash,
    title: document.title,
    body: document.body?.innerText?.slice(0, 500) || '',
    appHtml: document.querySelector('#app')?.innerHTML?.slice(0, 500) || ''
  })`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
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
const setSearch = async value => evaluate(`(() => {
  const input = document.querySelector('.search-box input')
  if (!(input instanceof HTMLInputElement)) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, ${JSON.stringify(value)})
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
const assertNoOverflow = async () => {
  const valid = await evaluate(`(() => {
    const page = document.querySelector('.release-capabilities')
    const rows = [...document.querySelectorAll('.matrix-row summary')]
    if (!(page instanceof HTMLElement) || rows.length === 0) return false
    return page.scrollWidth <= innerWidth + 1
      && rows.every(row => row.getBoundingClientRect().right <= innerWidth + 1)
  })()`)
  if (!valid) throw new Error(`R2 ${scenario} layout overflowed the viewport`)
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await resize(scenario === 'cloud-paper' ? 1280 : 1024, scenario === 'cloud-paper' ? 820 : 760)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
await waitFor(`document.querySelector('.page-loader') === null`, 'initial route transition')
await navigate('#/release-capabilities', '.release-capabilities', 'release capability route')
await waitFor(`document.querySelectorAll('.matrix-row').length > 0`, 'release capability rows')
await waitFor(`document.querySelector('.page-loader') === null`, 'release capability route transition')
const initialMatrix = await evaluate(`({
  rows: document.querySelectorAll('.matrix-row').length,
  state: document.querySelector('.release-state')?.textContent?.trim() || ''
})`)
if (initialMatrix.rows !== 39 || !initialMatrix.state.includes('R2 收口中')) {
  throw new Error(`Unexpected release matrix state: ${JSON.stringify(initialMatrix)}`)
}

const checks = []
const evidenceFiles = []
if (scenario === 'cloud-paper') {
  if (!(await setSearch('xlsx'))) throw new Error('Unable to use capability search')
  await waitFor(`document.querySelectorAll('.matrix-row').length === 1`, 'XLSX search result')
  await evaluate(`document.querySelector('.matrix-row summary')?.click()`)
  await waitFor(`document.querySelector('.matrix-row[open] .row-detail') !== null`, 'expanded XLSX details')
  await assertNoOverflow()
  await capture('r2-capabilities-white-1280.jpg')
  checks.push('white-search-xlsx', 'white-expand-details', 'normal-layout-no-overflow')
  evidenceFiles.push('r2-capabilities-white-1280.jpg')

  await navigate('#/settings', '.settings-view', 'settings route')
  await waitFor(
    `document.body.textContent.includes('Long编辑不会覆盖现有选择')
      && [...document.querySelectorAll('button')].some(button => button.textContent.includes('打开系统设置'))`,
    'safe default-app settings entry',
  )
  await waitFor(`document.querySelector('.page-loader') === null`, 'settings route transition')
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.setting-row')]
      .find(item => item.textContent?.includes('Markdown 打开方式'))
    row?.scrollIntoView({ block: 'center' })
    return row !== undefined
  })()`)
  await delay(300)
  await capture('r2-default-app-settings-1280.jpg')
  checks.push('windows-owned-default-app-entry')
  evidenceFiles.push('r2-default-app-settings-1280.jpg')
} else {
  const externalButtonClicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.segments button')]
      .find(item => item.textContent?.includes('外部依赖'))
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })()`)
  if (!externalButtonClicked) throw new Error('Unable to select external-dependency filter')
  await waitFor(`document.querySelectorAll('.matrix-row').length === 6`, 'external dependency filter')
  await evaluate(`document.querySelector('.matrix-row summary')?.click()`)
  await assertNoOverflow()
  await capture('r2-capabilities-dark-1024.jpg')
  checks.push('dark-external-filter', 'dark-expand-details', 'dark-layout-no-overflow')
  evidenceFiles.push('r2-capabilities-dark-1024.jpg')

  await resize(760, 900)
  await setSearch('doc')
  await waitFor(`document.querySelectorAll('.matrix-row').length >= 1`, 'compact DOC search')
  await assertNoOverflow()
  await capture('r2-capabilities-dark-760.jpg')
  checks.push('compact-search', 'compact-layout-no-overflow')
  evidenceFiles.push('r2-capabilities-dark-760.jpg')
}

const manifestPath = path.join(output, 'audit-manifest.json')
let previous = []
try {
  previous = JSON.parse(await fs.readFile(manifestPath, 'utf8')).scenarios || []
} catch {
  // The first isolated scenario creates the manifest.
}
const merged = [...previous.filter(item => item.id !== scenario), {
  id: scenario,
  checks,
  evidenceFiles,
}].sort((left, right) => left.id.localeCompare(right.id))
await fs.writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  scenarios: merged,
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`R2 ${scenario} desktop audit passed ${checks.length} checks and captured ${evidenceFiles.length} screenshots`)
