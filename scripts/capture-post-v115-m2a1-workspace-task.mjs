import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M2A1_AUDIT_OUTPUT)
const fixture = path.resolve(process.env.LONGEDIT_M2A1_FIXTURE)
const hash = async () => crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const before = await hash()
let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && (item.url.includes('127.0.0.1:9000') || item.url.includes('localhost:9000')))
  if (!target) await delay(100)
}
if (!target?.webSocketDebuggerUrl) throw new Error('WebView target missing')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let id = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text)
  if (!pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id
  pending.set(requestId, { resolve, reject })
  socket.send(JSON.stringify({ id: requestId, method, params }))
})
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
const wait = async (expression, description) => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,1600),html:document.querySelector('#app')?.innerHTML?.slice(0,800)})`)
  throw new Error(`Timeout: ${description}; state=${JSON.stringify(state)}`)
}
const click = async selector => {
  const clicked = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true})()`)
  if (!clicked) throw new Error(`Cannot click ${selector}`)
}
const clickDialog = async label => {
  const clicked = await evaluate(`(()=>{const e=[...document.querySelectorAll('.n-dialog__action button')].find(x=>x.textContent?.includes(${JSON.stringify(label)}));if(!(e instanceof HTMLButtonElement))return false;e.click();return true})()`)
  if (!clicked) throw new Error(`Cannot click dialog action ${label}`)
}
const capture = async name => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true })
  await fs.writeFile(path.join(output, name), Buffer.from(screenshot.data, 'base64'))
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await wait(`document.querySelector('.library-mode')!==null && document.body.innerText.includes('today-plan.md')`, 'library initialization')
await evaluate(`location.hash='#/workspace'`)
await wait(`document.querySelector('[data-testid="m2a1-task-complete"]')!==null && document.body.innerText.includes('Complete real workspace task')`, 'workspace task ready')
await capture('before-1280.jpg')

await click('[data-testid="m2a1-task-complete"]')
await wait(`document.querySelector('.n-dialog__action')!==null`, 'completion confirmation')
await clickDialog('取消')
await delay(250)
if (await hash() !== before) throw new Error('Source changed after cancelling task completion')

await click('[data-testid="m2a1-task-complete"]')
await wait(`document.querySelector('.n-dialog__action')!==null`, 'second completion confirmation')
await clickDialog('完成待办')
await wait(`document.querySelector('[data-testid="m2a1-task-undo"]')!==null && !document.body.innerText.includes('第 2 行')`, 'completed task and undo notice')
const completedBytes = await fs.readFile(fixture)
const completedText = completedBytes.toString('utf8')
if (!completedText.includes('- [x] Complete real workspace task\r\n')) throw new Error('Completed task did not write expected marker with CRLF')
const completedHash = await hash()
if (completedHash === before) throw new Error('Source digest did not change after completion')
await evaluate(`document.querySelector('[data-testid="m2a1-task-section"]')?.scrollIntoView({block:'center'})`)
await delay(200)
await capture('completed-1280.jpg')

await click('[data-testid="m2a1-task-undo"]')
await wait(`document.querySelector('[data-testid="m2a1-task-complete"]')!==null && document.body.innerText.includes('第 2 行')`, 'task restored after undo')
const afterUndo = await hash()
if (afterUndo !== before) throw new Error('Undo did not restore original bytes')
await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 680, deviceScaleFactor: 1, mobile: false })
await delay(300)
const responsive = await evaluate(`(()=>{const e=document.querySelector('.workspace-home');return Boolean(e&&e.scrollWidth<=e.clientWidth+1&&document.querySelector('[data-testid="m2a1-task-complete"]'))})()`)
if (!responsive) throw new Error('760px workspace task layout overflow')
await capture('restored-760.jpg')
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)

const evidence = {
  schemaVersion: 1,
  stage: 'M2A1',
  expected: {
    confirmationBeforeWrite: true,
    cancelKeepsSourceUnchanged: true,
    completeWritesOriginal: true,
    undoRestoresOriginalBytes: true,
    responsiveDesktop: true,
    runtimeErrors: 0
  },
  actual: {
    beforeSha256: before,
    completedSha256: completedHash,
    afterUndoSha256: afterUndo,
    confirmationObserved: true,
    cancelSourceUnchanged: true,
    completedMarker: '- [x] Complete real workspace task',
    undoRestoredOriginalBytes: true,
    utf8BomPreserved: completedBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    crlfPreserved: completedText.includes('\r\n'),
    responsive760: true,
    runtimeErrors: runtimeErrors.length
  },
  evidenceFiles: ['before-1280.jpg', 'completed-1280.jpg', 'restored-760.jpg'],
  sourceUserContentIncluded: false,
  releaseCandidate: false
}
await fs.writeFile(path.join(output, 'desktop-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log('M2A1 real Tauri workspace task audit passed')
