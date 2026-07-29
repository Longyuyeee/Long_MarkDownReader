import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const appOrigin = process.env.LONGEDIT_E1B_APP_ORIGIN || 'http://127.0.0.1:9000'
const output = path.resolve(process.env.LONGEDIT_E1B_AUDIT_OUTPUT || 'docs/evidence/e1b-odt-desktop')
const fixtures = [
  {
    id: 'microsoft-word-16',
    file: path.resolve(process.env.LONGEDIT_E1B_WORD || ''),
    title: 'Microsoft Word Producer Fixture',
  },
  {
    id: 'libreoffice-writer',
    file: path.resolve(process.env.LONGEDIT_E1B_LIBREOFFICE || ''),
    title: 'LibreOffice Writer Producer Fixture',
  },
]
const wpsPath = process.env.LONGEDIT_E1B_WPS
if (wpsPath) {
  fixtures.splice(1, 0, {
    id: 'wps-writer',
    file: path.resolve(wpsPath),
    title: 'WPS Writer Producer Fixture',
  })
}
if (fixtures.some(fixture => !fixture.file)) throw new Error('E1B producer fixture paths are required')
const fixtureById = new Map(fixtures.map(fixture => [fixture.id, fixture]))
const wordFixture = fixtureById.get('microsoft-word-16')
const libreOfficeFixture = fixtureById.get('libreoffice-writer')
const wpsFixture = fixtureById.get('wps-writer')

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
const openFixture = async (fixture, locator = '') => {
  const route = `#/odt?path=${encodeURIComponent(fixture.file)}${locator ? `&locator=${encodeURIComponent(locator)}&locatorToken=1` : ''}`
  try {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const ready = await evaluate(
        `document.querySelector('[data-testid="e1b-odt-workspace"]') !== null
          && document.querySelector('.odt-state') === null
          && document.querySelector('.document-identity')?.textContent?.includes(${JSON.stringify(path.basename(fixture.file))}) === true
          && document.querySelector('.odt-page')?.textContent?.includes(${JSON.stringify(fixture.title)}) === true
          && document.querySelector('.package-summary')?.textContent?.includes('可信包验证通过') === true`,
      )
      if (ready) break
      if (await evaluate('location.hash') !== route) await evaluate(`location.hash = ${JSON.stringify(route)}`)
      await delay(100)
      if (attempt === 499) throw new Error(`Timed out waiting for ${fixture.id} ODT workspace`)
    }
  } catch (error) {
    const state = await evaluate(`(() => ({
      hash: location.hash,
      workspace: document.querySelector('[data-testid="e1b-odt-workspace"]')?.textContent?.slice(0, 1000) || '',
      loadError: document.querySelector('.odt-state.error')?.textContent || '',
      body: document.body.innerText.slice(0, 1200),
    }))()`)
    throw new Error(`${error.message}: ${JSON.stringify(state)}`)
  }
  await waitFor(`document.querySelector('.page-loader') === null`, `${fixture.id} route overlay dismissal`)
  await delay(350)
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
  if (!changed) throw new Error(`Unable to set ${selector}`)
}
const assertWorkspace = async (expectedTheme, width, compact) => {
  const state = await evaluate(`(() => {
    const root = document.documentElement
    const workspace = document.querySelector('[data-testid="e1b-odt-workspace"]')
    const stage = document.querySelector('[data-testid="e1b-odt-stage"]')
    const page = document.querySelector('.odt-page')
    const outline = document.querySelector('.odt-outline')
    return {
      theme: document.body.dataset.theme,
      width: innerWidth,
      viewportOverflow: root.scrollWidth > innerWidth + 1,
      workspaceOverflow: workspace instanceof HTMLElement && workspace.scrollWidth > workspace.clientWidth + 1,
      stageWidth: stage?.getBoundingClientRect().width || 0,
      pageWidth: page?.getBoundingClientRect().width || 0,
      outlineVisible: outline instanceof HTMLElement && getComputedStyle(outline).display !== 'none',
      readOnlyLabel: document.querySelector('.document-identity')?.textContent?.includes('只读') === true,
    }
  })()`)
  if (state.theme !== expectedTheme || state.width !== width || state.viewportOverflow || state.workspaceOverflow
    || state.stageWidth < 300 || state.pageWidth < 280 || !state.readOnlyLabel || state.outlineVisible === compact) {
    throw new Error(`ODT workspace state failed: ${JSON.stringify(state)}`)
  }
  return state
}
const assertCentered = async selector => {
  const state = await evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect()
    const stage = document.querySelector('[data-testid="e1b-odt-stage"]')?.getBoundingClientRect()
    if (!target || !stage) return null
    const center = target.top + target.height / 2
    return { targetTop: target.top, targetBottom: target.bottom, center, stageTop: stage.top, stageBottom: stage.bottom }
  })()`)
  if (!state || state.targetBottom < state.stageTop || state.targetTop > state.stageBottom
    || Math.abs(state.center - (state.stageTop + state.stageBottom) / 2) > 150) {
    throw new Error(`ODT target was not centered: ${JSON.stringify(state)}`)
  }
  return state
}

await fs.mkdir(output, { recursive: true })
if (!wpsFixture) {
  await Promise.all([
    'wps-light-normal-search-1280.jpg',
    'wps-dark-compact-locator-760.jpg',
  ].map(file => fs.rm(path.join(output, file), { force: true })))
}
await send('Page.enable')
await send('Runtime.enable')
await resize(1280, 820)
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'desktop app bootstrap')
await waitFor(`document.querySelector('.page-loader') === null`, 'initial route')
const originals = new Map(await Promise.all(fixtures.map(async fixture => [fixture.id, await fs.readFile(fixture.file)])))
const scenarios = []

await applyPreset('professional-light', 'white')
await openFixture(wordFixture)
scenarios.push({
  id: 'word-light-normal-open',
  status: 'passed',
  state: await assertWorkspace('white', 1280, false),
  file: 'word-light-normal-open-1280.jpg',
})
await capture(scenarios.at(-1).file)

await resize(760, 720)
await openFixture(libreOfficeFixture)
scenarios.push({
  id: 'libreoffice-light-compact-open',
  status: 'passed',
  state: await assertWorkspace('white', 760, true),
  file: 'libreoffice-light-compact-open-760.jpg',
})
await capture(scenarios.at(-1).file)

await applyPreset('professional-dark', 'dark')
await resize(1280, 820)
await openFixture(wordFixture)
await setInput('[data-testid="e1b-odt-search"]', 'After explicit page break.')
await waitFor(
  `document.querySelector('[data-testid="e1b-odt-search-count"]')?.textContent === '1/1'
    && document.querySelector('.odt-block.current-search-hit')?.textContent?.includes('After explicit page break.') === true`,
  'Word ODT search result',
)
await evaluate(`document.querySelector('[data-testid="e1b-odt-search-next"]')?.click()`)
scenarios.push({
  id: 'word-dark-normal-search',
  status: 'passed',
  state: await assertWorkspace('dark', 1280, false),
  target: await assertCentered('.odt-block.current-search-hit'),
  file: 'word-dark-normal-search-1280.jpg',
})
await capture(scenarios.at(-1).file)

await resize(760, 720)
await openFixture(libreOfficeFixture, 'odt-block-7')
await waitFor(
  `document.querySelector('#odt-block-7.route-locator-target')?.textContent?.includes('After explicit page break.') === true`,
  'LibreOffice ODT route locator',
)
scenarios.push({
  id: 'libreoffice-dark-compact-locator',
  status: 'passed',
  state: await assertWorkspace('dark', 760, true),
  target: await assertCentered('#odt-block-7.route-locator-target'),
  file: 'libreoffice-dark-compact-locator-760.jpg',
})
await capture(scenarios.at(-1).file)

if (wpsFixture) {
  await applyPreset('professional-light', 'white')
  await resize(1280, 820)
  await openFixture(wpsFixture)
  await setInput('[data-testid="e1b-odt-search"]', wpsFixture.title)
  await waitFor(
    `document.querySelector('[data-testid="e1b-odt-search-count"]')?.textContent === '1/1'
      && document.querySelector('.odt-block.current-search-hit')?.textContent?.includes(${JSON.stringify(wpsFixture.title)}) === true`,
    'WPS ODT search result',
  )
  await evaluate(`document.querySelector('[data-testid="e1b-odt-search-next"]')?.click()`)
  scenarios.push({
    id: 'wps-light-normal-search',
    status: 'passed',
    state: await assertWorkspace('white', 1280, false),
    target: await assertCentered('.odt-block.current-search-hit'),
    file: 'wps-light-normal-search-1280.jpg',
  })
  await capture(scenarios.at(-1).file)

  const locatorId = await evaluate(`(() => [...document.querySelectorAll('.odt-block')]
    .find(block => block.textContent?.includes('After explicit page break.'))?.id || '')()`)
  if (!locatorId.startsWith('odt-block-')) throw new Error('WPS ODT precise locator target was not found')
  await applyPreset('professional-dark', 'dark')
  await resize(760, 720)
  await openFixture(wpsFixture, locatorId)
  await waitFor(
    `document.querySelector('#' + CSS.escape(${JSON.stringify(locatorId)}) + '.route-locator-target')?.textContent?.includes('After explicit page break.') === true`,
    'WPS ODT route locator',
  )
  scenarios.push({
    id: 'wps-dark-compact-locator',
    status: 'passed',
    state: await assertWorkspace('dark', 760, true),
    target: await assertCentered(`#${locatorId}.route-locator-target`),
    locatorId,
    file: 'wps-dark-compact-locator-760.jpg',
  })
  await capture(scenarios.at(-1).file)
}

const sourceChecks = []
for (const fixture of fixtures) {
  const sourceAfter = await fs.readFile(fixture.file)
  const sourceUnchanged = Buffer.compare(originals.get(fixture.id), sourceAfter) === 0
  if (!sourceUnchanged) throw new Error(`${fixture.id} source bytes changed during E1B audit`)
  sourceChecks.push({
    id: `${fixture.id}-source-unchanged`,
    status: 'passed',
    sourceUnchanged,
    sha256: createHash('sha256').update(sourceAfter).digest('hex'),
  })
}
const registry = JSON.parse(await fs.readFile(path.resolve('shared/file-formats.json'), 'utf8'))
const odtRegistered = registry.formats.some(format => format.extensions.includes('.odt'))
if (odtRegistered) throw new Error('.odt must remain unregistered before the E1B producer gate closes')
const checks = [
  { id: 'available-producers-open-read-only', status: 'passed', producers: fixtures.map(fixture => fixture.id) },
  { id: 'normal-and-compact-layouts-without-overflow', status: 'passed' },
  { id: 'professional-light-and-dark-themes', status: 'passed' },
  { id: 'document-search-centers-exact-block', status: 'passed' },
  { id: 'route-locator-centers-exact-block', status: 'passed', locatorKind: 'odt-block' },
  { id: 'product-exposure-remains-disabled', status: 'passed', odtRegistered },
  ...sourceChecks,
]
if (wpsFixture) {
  checks.push(
    { id: 'wps-document-search-centers-exact-block', status: 'passed' },
    { id: 'wps-route-locator-centers-exact-block', status: 'passed', locatorKind: 'odt-block' },
  )
}
await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'E1B',
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  sourceUrl: target.url,
  fixtureLocation: 'isolated temporary workspace',
  gateMode: wpsFixture ? 'closure-candidate' : 'checkpoint',
  producerMatrix: fixtures.map(fixture => fixture.id),
  viewportMatrix: ['normal-1280x820', 'compact-760x720'],
  themeMatrix: ['professional-light', 'professional-dark'],
  productExposure: 'preview-route-only-unregistered',
  writeEnabled: false,
  scenarios,
  checks,
  evidenceFiles: scenarios.map(scenario => scenario.file),
}, null, 2)}\n`)
await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`E1B ODT desktop audit passed ${checks.length} checks and captured ${scenarios.length} screenshots`)
