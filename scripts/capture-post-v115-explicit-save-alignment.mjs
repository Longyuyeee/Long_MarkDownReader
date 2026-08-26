import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_EXPLICIT_SAVE_OUTPUT)
const fixture = path.resolve(process.env.LONGEDIT_EXPLICIT_SAVE_FIXTURE)
const mode = process.env.LONGEDIT_EXPLICIT_SAVE_MODE
const marker = `explicit-save-${mode}-verified`
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const hash = async () => crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex')
const beforeSha256 = await hash()

let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && /127\.0\.0\.1:9000|localhost:9000/.test(item.url))
  if (!target) await delay(100)
}
if (!target?.webSocketDebuggerUrl) throw new Error('WebView target missing')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let id = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text)
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })) })
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
const wait = async (expression, description) => {
  for (let attempt = 0; attempt < 600; attempt += 1) { if (await evaluate(expression)) return; await delay(50) }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,1600)})`)
  throw new Error(`Timeout: ${description}; ${JSON.stringify(state)}`)
}
const capture = async name => { const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true }); await fs.writeFile(path.join(output, name), Buffer.from(image.data, 'base64')) }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await wait(`document.querySelector('.library-mode')!==null`, 'library initialization')
await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(fixture)})`)
await wait(`[...document.querySelectorAll('#vditor-lib [contenteditable="true"]')].some(e=>e instanceof HTMLElement&&e.offsetParent!==null) && document.body.innerText.includes('Explicit Save Test')`, 'Markdown editor ready')
const focused = await evaluate(`(()=>{const e=[...document.querySelectorAll('#vditor-lib [contenteditable="true"]')].find(x=>x instanceof HTMLElement&&x.offsetParent!==null);if(!(e instanceof HTMLElement))return false;e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);return document.activeElement===e||e.contains(document.activeElement)})()`)
if (!focused) throw new Error('Cannot focus Markdown editor')
await send('Input.insertText', { text: `\n${marker}` })
await wait(`document.querySelector('.workspace-tab.active')?.getAttribute('aria-label')?.includes('有未保存的修改')===true`, 'dirty Markdown state')
await delay(3500)
const afterWaitSha256 = await hash()
const dirtyStateRetainedAfterWait = await evaluate(`document.querySelector('.workspace-tab.active')?.getAttribute('aria-label')?.includes('有未保存的修改')===true`)

if (mode === 'baseline') {
  if (afterWaitSha256 === beforeSha256) throw new Error('Baseline did not reproduce automatic source write')
  await capture('baseline-autowrite-1280.jpg')
  await fs.writeFile(path.join(output, 'baseline-evidence.json'), `${JSON.stringify({ stage: 'explicit-save-baseline', actual: { beforeSha256, afterWaitSha256, baselineSourceChangedWithoutSave: true, dirtyStateRetainedAfterWait, runtimeErrors: runtimeErrors.length }, evidenceFiles: ['baseline-autowrite-1280.jpg'] }, null, 2)}\n`)
  socket.close()
  console.log('Pre-fix Markdown automatic source write reproduced in real Tauri')
  process.exit(0)
}

if (afterWaitSha256 !== beforeSha256) throw new Error('Current source changed without explicit save')
if (!dirtyStateRetainedAfterWait) throw new Error('Current dirty state was cleared without explicit save')
await capture('draft-unsaved-1280.jpg')
const clicked = await evaluate(`(()=>{const e=document.querySelector('[data-testid="library-explicit-save"]');if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true})()`)
if (!clicked) throw new Error('Cannot click explicit save')
for (let attempt = 0; attempt < 100 && await hash() === beforeSha256; attempt += 1) await delay(50)
const afterSaveSha256 = await hash()
if (afterSaveSha256 === beforeSha256) throw new Error('Explicit save did not change source')
const savedText = await fs.readFile(fixture, 'utf8')
if (!savedText.includes(marker)) throw new Error('Explicit save omitted inserted marker')
await send('Page.reload', { ignoreCache: true })
await wait(`[...document.querySelectorAll('#vditor-lib [contenteditable="true"]')].some(e=>e instanceof HTMLElement&&e.offsetParent!==null) && document.body.innerText.includes(${JSON.stringify(marker)})`, 'saved content reopened after reload')
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
await delay(300)
const responsive720 = await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`)
await capture('saved-reopen-720.jpg')
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)
await fs.writeFile(path.join(output, 'current-evidence.json'), `${JSON.stringify({ stage: 'explicit-save-current', actual: { beforeSha256, afterWaitSha256, afterSaveSha256, currentSourceUnchangedAfterWait: true, dirtyStateRetainedAfterWait, explicitSaveChangedSource: true, savedContentReopened: true, responsive720, runtimeErrors: runtimeErrors.length }, evidenceFiles: ['draft-unsaved-1280.jpg', 'saved-reopen-720.jpg'] }, null, 2)}\n`)
socket.close()
console.log('Current Markdown explicit-save workflow passed in real Tauri')
