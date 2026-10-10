import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9355'
const library = process.env.LONGEDIT_E2E_LIBRARY
const output = process.env.LONGEDIT_UX26_OUTPUT
if (!library || !output) throw new Error('Generated test library and output are required')
await fs.mkdir(output, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let target
for (let i = 0; i < 100; i++) {
  try { target = (await fetch(endpoint + '/json').then(r => r.json())).find(t => t.type === 'page' && t.webSocketDebuggerUrl) } catch {}
  if (target) break
  await pause(200)
}
if (!target) throw new Error('Tauri WebView unavailable')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await once(socket, 'open')
let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data)
  if (pending.has(data.id)) { const p = pending.get(data.id); pending.delete(data.id); clearTimeout(p.timer); data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result) }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, 20000)
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const wait = async (expression, label) => {
  for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(150) }
  throw new Error(`Timed out: ${label}; ${await evaluate('document.body.innerText.slice(0,2200)')}`)
}
const checks = []
const check = async (name, expression) => { if (!await evaluate(expression)) throw new Error(name); checks.push(name); console.log('PASS ' + name) }
const clickElement = async expression => {
  let point
  for (let i = 0; i < 100; i++) {
    point = await evaluate(`(()=>{const b=${expression};if(!b)throw Error('Missing button');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return b.contains(document.elementFromPoint(x,y)) ? {x,y} : null})()`)
    if (point) break
    await pause(100)
  }
  if (!point) throw new Error('Control remains covered: ' + expression)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}
const button = (text, selector = 'button') => clickElement(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)})`)
const navigate = async (file, query = '') => { await evaluate(`location.hash=${JSON.stringify('/library?path=' + encodeURIComponent(path.join(library, file)) + query)}`); await pause(350) }
try {
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {width:1280,height:820,deviceScaleFactor:1,mobile:false})
  await wait("document.body.innerText.includes('Plain.txt')", 'isolated library initialized')
  await navigate('Note.md')
  await wait("document.querySelector('#vditor-lib')?.textContent.includes('我的笔记')", 'initial editor ready')
  await navigate('Paper.pdf')
  await wait("document.querySelector('canvas')", 'PDF page rendered')
  await pause(1500)
  await fs.writeFile(path.join(output,'pdf-main.png'), Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await navigate('Note.md','&search='+encodeURIComponent('Public Page Two'))
  await wait("document.querySelector('.knowledge-preview-button')", 'PDF page-two search')
  await clickElement("document.querySelector('.knowledge-preview-button')")
  await wait("document.querySelector('.preview-text')?.textContent.includes('Public Page Two')", 'PDF reference text')
  await check('PDF reference identifies page two', "document.querySelector('.preview-state').textContent.includes('第 2 页')")
  await button('在主编辑区打开','.search-document-preview button')
  await wait("new URLSearchParams(location.hash.split('?')[1]).get('page')==='2' && document.querySelector('.page-jump input')?.value==='2' && document.querySelector('#pdf-page-2 canvas')", 'PDF page-two actually rendered and selected')
  await evaluate("(()=>{const e=document.querySelector('.preview-text'),r=document.createRange();r.selectNodeContents(e);window.getSelection().removeAllRanges();window.getSelection().addRange(r);e.dispatchEvent(new Event('pointerup',{bubbles:true}))})()")
  await check('PDF main workspace cannot receive Markdown insertions', "[...document.querySelectorAll('.excerpt-actions button')].some(b=>b.disabled && b.textContent.includes('Markdown'))")
  await fs.writeFile(path.join(output,'pdf-reference.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await navigate('Note.md','&search='+encodeURIComponent('budget'))
  await wait("[...document.querySelectorAll('.knowledge-result-group')].some(e=>e.textContent.includes('Plain.txt'))", 'plain text search')
  await clickElement("[...document.querySelectorAll('.knowledge-result-group')].find(e=>e.textContent.includes('Plain.txt')).querySelector('.knowledge-preview-button')")
  await wait("document.querySelector('.preview-text')?.textContent.includes('budget')", 'plain text reference')
  await button('在主编辑区打开','.search-document-preview button')
  await wait("decodeURIComponent(location.hash).includes('Plain.txt') && document.querySelector('.search-navigation')?.textContent.includes('1 / 2')", 'plain text match navigation')
  await check('plain text opens in main with preserved reference', "document.querySelector('.search-document-preview strong').textContent==='Plain.txt'")
  await button('下一处','.search-navigation button')
  await check('plain text next match', "document.querySelector('.search-navigation').textContent.includes('2 / 2')")
  await fs.writeFile(path.join(output,'plain-text.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await fs.writeFile(path.join(output,'cross-format.json'),JSON.stringify({status:'passed-real-tauri-debug-webview2',checks,capturedAt:new Date().toISOString(),sourceUserContentIncluded:false},null,2))
} catch(error) {
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),checks,body:await evaluate('document.body.innerText.slice(0,3500)')},null,2));throw error
} finally {socket.close()}
