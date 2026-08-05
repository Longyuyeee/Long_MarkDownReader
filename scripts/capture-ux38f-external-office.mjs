import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14425'
const output = path.resolve(process.env.LONGEDIT_UX38F_AUDIT_OUTPUT || 'docs/evidence/ux38f-external-office')
const sourceCommit = process.env.LONGEDIT_UX38F_SOURCE_COMMIT || ''
const paths = JSON.parse(process.env.LONGEDIT_UX38F_PATHS || '{}')
const cases = [
  { id: 'legacy-doc', key: 'legacyDoc', root: '.legacy-office', kind: 'legacy' },
  { id: 'legacy-xls', key: 'legacyXls', root: '.legacy-office', kind: 'legacy' },
  { id: 'legacy-ppt', key: 'legacyPpt', root: '.legacy-office', kind: 'legacy' },
  { id: 'wps-document', key: 'wpsDocument', root: '.external-office', kind: 'wps' },
  { id: 'wps-spreadsheet', key: 'wpsSpreadsheet', root: '.external-office', kind: 'wps' },
  { id: 'wps-presentation', key: 'wpsPresentation', root: '.external-office', kind: 'wps' },
]
if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || cases.some(item => !paths[item.key])) throw new Error('UX-38F environment is incomplete')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
const unexpectedDialogs = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  if (message.method === 'Page.javascriptDialogOpening') {
    unexpectedDialogs.push('dialog')
    socket.send(JSON.stringify({ id: ++sequence, method: 'Page.handleJavaScriptDialog', params: { accept: false } }))
  }
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description, attempts = 300) => { for (let attempt = 0; attempt < attempts; attempt += 1) { if (await evaluate(expression)) return; await delay(100) } throw new Error(`Timed out waiting for ${description}`) }
const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')) }
const openCase = async item => {
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(paths[item.key])})`)
  await waitFor(`document.querySelector(${JSON.stringify(`${item.root} main .external-panel`)}) && document.querySelectorAll(${JSON.stringify(`${item.root} .application-option`)}).length === 4`, item.id)
  await delay(500)
}
const graphRoundTrip = async item => {
  await evaluate(`location.hash = '#/graph'`)
  await waitFor(`document.querySelector('.graph-container .management-back')`, `${item.id} graph`)
  await evaluate(`document.querySelector('.graph-container .management-back').click()`)
  await waitFor(`document.querySelector(${JSON.stringify(item.root)})`, `${item.id} return`)
  await delay(450)
}
const narrowStable = root => evaluate(`(() => { const pageElement = document.querySelector(${JSON.stringify(root)}); const page = pageElement.getBoundingClientRect(); const panel = document.querySelector(${JSON.stringify(`${root} .external-panel`)}).getBoundingClientRect(); const main = document.querySelector(${JSON.stringify(`${root} main`)}); return page.left >= -1 && page.right <= innerWidth + 1 && panel.right <= page.right + 1 && main.scrollWidth <= main.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 2 })()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'library shell')
const formatResults = []
for (const item of cases) {
  await openCase(item)
  const state = await evaluate(`(() => ({
    optionCount: document.querySelectorAll(${JSON.stringify(`${item.root} .application-option`)}).length,
    unavailableCount: document.querySelectorAll(${JSON.stringify(`${item.root} .application-option.unavailable`)}).length,
    openButtonVisible: Boolean(document.querySelector(${JSON.stringify(`${item.root} .open-button`)})),
    boundaryVisible: document.querySelector(${JSON.stringify(item.root)})?.textContent?.includes('不写回') === true,
    loadError: Boolean(document.querySelector(${JSON.stringify(`${item.root} .state.error`)})),
  }))()`)
  if (state.optionCount !== 4 || !state.openButtonVisible || !state.boundaryVisible || state.loadError) throw new Error(`${item.id} workspace gate failed: ${JSON.stringify(state)}`)
  if (item.id === 'legacy-doc') {
    const target = `${paths[item.key]}-remembered.docx`
    await evaluate(`(() => { const input = document.querySelector('.legacy-office #legacy-office-target'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(target)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await delay(150)
    await graphRoundTrip(item)
    state.contextRestored = await evaluate(`document.querySelector('.legacy-office #legacy-office-target')?.value === ${JSON.stringify(target)}`)
  } else {
    await evaluate(`document.querySelector(${JSON.stringify(`${item.root} .application-option`)})?.click()`)
    const beforeState = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(paths[item.key])})?.externalApplication)`)
    await graphRoundTrip(item)
    const afterState = await evaluate(`import('/src/services/workspaceViewState.ts').then(module => module.recallWorkspaceViewState(${JSON.stringify(paths[item.key])})?.externalApplication)`)
    state.contextRestored = beforeState === 'system-default' && afterState === beforeState
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false })
  await delay(350)
  state.narrowStable = await narrowStable(item.root)
  if (!state.contextRestored || !state.narrowStable) throw new Error(`${item.id} context/narrow gate failed: ${JSON.stringify(state)}`)
  if (item.id === 'legacy-doc') {
    await evaluate(`document.querySelector('.legacy-office main').scrollTop = document.querySelector('.legacy-office main').scrollHeight`)
    await delay(200)
    await capture('legacy-doc-narrow.jpg')
  }
  if (item.id === 'wps-document') await capture('wps-document-narrow.jpg')
  formatResults.push({ id: item.id, ...state })
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
}

const evidence = {
  schemaVersion: 1,
  stage: 'UX-38F',
  sourceCommit,
  formatResults,
  allFormatsLoaded: formatResults.length === 6,
  directExternalOpenVisible: formatResults.every(item => item.openButtonVisible && item.optionCount === 4),
  capabilityBoundaryVisible: formatResults.every(item => item.boundaryVisible),
  allContextsRestored: formatResults.every(item => item.contextRestored),
  allNarrowLayoutsStable: formatResults.every(item => item.narrowStable),
  externalApplicationLaunched: false,
  conversionExecuted: false,
  runtimeErrorCount: runtimeErrors.length,
  unexpectedDialogCount: unexpectedDialogs.length,
  blockingErrorSurfaceObserved: await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`),
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshotFiles = ['legacy-doc-narrow.jpg', 'wps-document-narrow.jpg']
const screenshots = []
for (const file of screenshotFiles) { const bytes = await fs.readFile(path.join(output, file)); screenshots.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) }
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'UX-38F', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`UX-38F external Office captured: ${formatResults.length} formats, ${runtimeErrors.length} runtime errors.`)
