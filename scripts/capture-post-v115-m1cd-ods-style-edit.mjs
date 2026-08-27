import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const origin = process.env.LONGEDIT_M1CD_APP_ORIGIN
const output = path.resolve(process.env.LONGEDIT_M1CD_AUDIT_OUTPUT || '.')
const source = path.resolve(process.env.LONGEDIT_M1CD_SOURCE || '')
const target = path.resolve(process.env.LONGEDIT_M1CD_TARGET || '')
const bridge = path.resolve(process.env.LONGEDIT_M1CD_RESULT_BRIDGE || '')
if (!endpoint || !origin || !source || !target || !bridge) throw new Error('M1C-D desktop environment is incomplete')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const waitForPage = async () => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const pages = await (await fetch(`${endpoint}/json`)).json()
      const page = pages.find(item => item.type === 'page' && item.url.startsWith(origin) && item.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await delay(250)
  }
  throw new Error('M1C-D Tauri WebView target missing after 60 seconds')
}
const page = await waitForPage()
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
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
const waitFor = async (expression, label) => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({ hash: location.hash, text: document.body?.innerText?.slice(0, 1200) })`)
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`)
}
const capture = async file => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(screenshot.data, 'base64'))
}
const clickByLabel = label => evaluate(`(() => { const e=[...document.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===${JSON.stringify(label)}&&!node.disabled);if(!(e instanceof HTMLButtonElement))return false;e.click();return true })()`)
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'exception')
})

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null && !document.querySelector('.page-loader')`, 'library initialization')
const sourceBefore = await digest(source)
await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(source)})`)
await waitFor(`document.querySelector('[data-testid="m1cb-ods-edit-banner"]')!==null && document.getElementById('ods-sheet-1:A1')!==null`, 'editable ODS workspace')
await evaluate(`document.getElementById('ods-sheet-1:A1')?.click()`)
await waitFor(`document.querySelector('[data-testid="m1cd-ods-style-controls"] select')?.value==='Default'`, 'A1 default style selection')
await evaluate(`(() => { const e=document.querySelector('[data-testid="m1cd-ods-style-controls"] select');if(!(e instanceof HTMLSelectElement))return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'Good');e.dispatchEvent(new Event('change',{bubbles:true}));return true })()`)
await waitFor(`document.querySelector('[data-testid="m1cd-ods-style-controls"] select')?.value==='Good' && getComputedStyle(document.getElementById('ods-sheet-1:A1')).backgroundColor==='rgb(204, 255, 204)'`, 'Good style draft preview')
if (await digest(source) !== sourceBefore) throw new Error('source changed while editing the style draft')
if (!await clickByLabel('撤销单元格修改')) throw new Error('style undo action unavailable')
await waitFor(`document.querySelector('[data-testid="m1cd-ods-style-controls"] select')?.value==='Default'`, 'style undo result')
if (!await clickByLabel('重做单元格修改')) throw new Error('style redo action unavailable')
await waitFor(`document.querySelector('[data-testid="m1cd-ods-style-controls"] select')?.value==='Good'`, 'style redo result')
await capture('ods-style-draft.jpg')
if (!await clickByLabel('另存 ODS 副本')) throw new Error('style save-copy action unavailable')
await waitFor(`document.querySelector('.n-dialog__action')!==null`, 'style save-copy prompt')
await evaluate(`(() => { const e=document.querySelector('.n-dialog input');if(!(e instanceof HTMLInputElement))return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(path.basename(target))});e.dispatchEvent(new Event('input',{bubbles:true}));return true })()`)
await evaluate(`([...document.querySelectorAll('.n-dialog__action button')].find(e=>e.textContent.includes('保存副本')))?.click()`)
await waitFor(`location.hash.includes(${JSON.stringify(path.basename(target))}) && document.querySelector('.odf-workspace .identity strong')?.textContent.trim()===${JSON.stringify(path.basename(target))} && document.getElementById('ods-sheet-1:A1')!==null`, 'styled copy reopen')
await waitFor(`getComputedStyle(document.getElementById('ods-sheet-1:A1')).backgroundColor==='rgb(204, 255, 204)' && getComputedStyle(document.getElementById('ods-sheet-1:A1')).color==='rgb(0, 102, 0)'`, 'styled copy visual reopen')
await evaluate(`document.getElementById('ods-sheet-1:A1')?.click()`)
await waitFor(`document.querySelector('[data-testid="m1cd-ods-style-controls"] select')?.value==='Good'`, 'styled copy semantic reopen')
await capture('ods-style-copy-reopen.jpg')
await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
await delay(300)
const responsive = await evaluate(`(() => { const e=document.querySelector('.odf-workspace');const controls=document.querySelector('[data-testid="m1cd-ods-style-controls"]');return !!e&&!!controls&&e.scrollWidth<=e.clientWidth+1&&controls.getBoundingClientRect().width>0 })()`)
if (!responsive) throw new Error('M1C-D ODS style workspace overflows at 960x720')
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)
const result = {
  sourceBeforeSha256: sourceBefore,
  sourceAfterSha256: await digest(source),
  targetSha256: await digest(target),
  initialStyle: 'Default',
  expectedStyle: 'Good',
  uiReopenedStyle: 'Good',
  uiBackgroundColor: 'rgb(204, 255, 204)',
  uiTextColor: 'rgb(0, 102, 0)',
  undoRedo: true,
  explicitCopySave: true,
  responsive960x720: true,
  runtimeErrors: 0,
}
await fs.writeFile(bridge, `${JSON.stringify(result, null, 2)}\n`)
socket.close()
console.log('M1C-D real Tauri ODS style-edit flow passed')
