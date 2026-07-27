import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const fixture = path.resolve(process.env.LONGEDIT_C4E_SOURCE || '')
const reportPath = path.resolve(process.env.LONGEDIT_C4E_GENERATION_REPORT || '')
if (!fixture || !reportPath) throw new Error('C4E source and generation report paths are required')
const library = path.dirname(fixture)

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
const waitFor = async (expression, description, attempts = 400) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const setValue = async (selector, value) => {
  const updated = await evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)})
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) return false
    const prototype = control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, ${JSON.stringify(value)})
    control.dispatchEvent(new Event('input', { bubbles: true }))
    control.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  if (!updated) throw new Error(`Unable to set ${selector}`)
}
const click = async selector => {
  const clicked = await evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)})
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Unable to click ${selector}`)
}
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const sourceBytes = await fs.readFile(fixture)

const loadSource = async run => {
  await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(fixture)}) + '&c4eRun=${run}'; location.reload()`)
  await waitFor(
    `document.querySelector('.pptx-workspace') !== null
      && document.querySelector('.document-identity')?.textContent?.includes('c4e-source-wps.pptx') === true
      && document.querySelector('.pptx-status')?.textContent?.includes('3 张幻灯片') === true
      && document.querySelector('.page-loader') === null`,
    `C4E source reload ${run}`,
  )
  await click('button[title="验证隔离编辑基线"]')
  await waitFor(`document.querySelector('.edit-baseline .verified-badge') !== null`, `C4E baseline ${run}`)
}
const saveCandidate = async fileName => {
  await waitFor(`document.querySelector('[data-testid="c4d-save-panel"]') !== null`, `${fileName} save candidate`)
  await setValue('[data-testid="c4d-copy-file-name"]', fileName)
  await click('[data-testid="c4d-save-copy"]')
  await waitFor(
    `document.querySelector('.c4d-save-report')?.textContent?.includes('结构复开通过') === true
      && document.querySelector('.c4d-save-report')?.textContent?.includes('语义复开通过') === true
      && document.querySelector('.c4d-save-report')?.textContent?.includes('源文件不变是') === true`,
    `${fileName} reliable save`,
  )
}

await send('Page.enable')
await send('Runtime.enable')
await loadSource(1)
await setValue('[data-testid="c4b-text-value"]', 'LongEdit C4E WPS Text')
await click('[data-testid="c4b-text-preview"]')
await waitFor(`document.querySelector('.isolated-text-patch .patch-report')?.textContent?.includes('语义复读通过') === true`, 'C4E text preview')
await saveCandidate('c4e-text-copy.pptx')

await loadSource(2)
const shapeTarget = await evaluate(`(() => {
  const select = document.querySelector('[data-testid="c4c-style-target"]')
  if (!(select instanceof HTMLSelectElement)) return ''
  return [...select.options].find(option => option.textContent?.includes('形状'))?.value || ''
})()`)
if (!shapeTarget) throw new Error('C4E shape-text target was not exposed')
await setValue('[data-testid="c4c-style-target"]', shapeTarget)
await setValue('[data-testid="c4c-font-size"]', '24')
await setValue('[data-testid="c4c-font-family"]', 'Aptos')
await setValue('[data-testid="c4c-color"]', '#2f6fed')
await setValue('[data-testid="c4c-alignment"]', 'center')
await click('[data-testid="c4c-style-preview"]')
await waitFor(`document.querySelector('.style-patch-report')?.textContent?.includes('语义复读通过') === true`, 'C4E style preview')
await saveCandidate('c4e-style-copy.pptx')

await loadSource(3)
await setValue('[data-testid="c4c-alt-text"]', 'LongEdit C4E WPS accessible picture')
await click('[data-testid="c4c-alt-preview"]')
await waitFor(`document.querySelector('.alt-patch-report')?.textContent?.includes('语义复读通过') === true`, 'C4E alt-text preview')
await saveCandidate('c4e-alt-text-copy.pptx')

if (Buffer.compare(sourceBytes, await fs.readFile(fixture)) !== 0) throw new Error('C4E source changed while generating output copies')
const outputs = []
for (const [operation, file] of [
  ['text', 'c4e-text-copy.pptx'],
  ['style', 'c4e-style-copy.pptx'],
  ['imageAltText', 'c4e-alt-text-copy.pptx'],
]) {
  const bytes = await fs.readFile(path.join(library, file))
  outputs.push({ operation, file, sha256: sha256(bytes), bytes: bytes.length })
}
await fs.mkdir(path.dirname(reportPath), { recursive: true })
await fs.writeFile(reportPath, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  generator: 'LongEdit C4D reliable save-copy UI in Tauri Debug WebView2',
  sourceFile: path.basename(fixture),
  sourceSha256: sha256(sourceBytes),
  sourceUnchanged: true,
  outputs,
}, null, 2)}\n`)
socket.close()
console.log('C4E generated 3 reliable PPTX output copies without changing the source')
