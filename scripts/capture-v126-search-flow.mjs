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
  const point = await evaluate(`(()=>{const b=${expression};if(!b)throw Error('Missing button');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}
const button = (text, selector = 'button') => clickElement(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)})`)
const navigate = async (file, query = '') => { await evaluate(`location.hash=${JSON.stringify('/library?path=' + encodeURIComponent(path.join(library, file)) + query)}`); await pause(350) }
try {
  await send('Page.enable'); await send('Runtime.enable')
  // Run against a newly launched isolated process: reloading a dirty editor
  // raises its intentional unsaved-changes dialog and is not a clean reset.
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
  await wait('Boolean(window.__TAURI_INTERNALS__)', 'native backend')
  await navigate('Note.md', '&search=' + encodeURIComponent('预算'))
  await wait("document.querySelectorAll('.knowledge-preview-button').length > 0", 'search results')
  await wait("[...document.querySelectorAll('#vditor-lib [contenteditable=true]')].some(e=>e.getClientRects().length && e.textContent.includes('我的笔记'))", 'Markdown ready')
  await clickElement("[...document.querySelectorAll('.knowledge-result-group')].find(e=>e.textContent.includes('Budget.md')).querySelector('.knowledge-result-open')")
  await wait("decodeURIComponent(location.hash).includes('Budget.md') && document.querySelector('#vditor-lib')?.textContent.includes('项目预算')", 'normal result opens in main editor')
  await check('ordinary result click never opens side reference', "!document.querySelector('.search-document-preview')")
  await navigate('Note.md', '&search=' + encodeURIComponent('预算'))
  await wait("[...document.querySelectorAll('#vditor-lib [contenteditable=true]')].some(e=>e.getClientRects().length && e.textContent.includes('我的笔记'))", 'return to writing')
  await evaluate(`(()=>{const e=[...document.querySelectorAll('#vditor-lib [contenteditable=true]')].find(e=>e.getClientRects().length);e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);window.getSelection().removeAllRanges();window.getSelection().addRange(r)})()`)
  await send('Input.insertText', { text: '\n未保存草稿 UX26' })
  await clickElement("[...document.querySelectorAll('.knowledge-result-group')].find(e=>e.textContent.includes('Budget.md')).querySelector('.knowledge-preview-button')")
  await wait("document.querySelector('.preview-text')?.textContent.includes('预算')", 'content preview')
  // The explicit side-reference action docks immediately; no pinning step.
  await check('reference is docked alongside current draft', "Boolean(document.querySelector('.search-document-preview.pinned')) && document.querySelector('#vditor-lib').textContent.includes('未保存草稿 UX26')")
  // Capture the payload without replacing the user's system clipboard.
  await evaluate("window.__ux26Copied='';Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.__ux26Copied=text}})")
  await evaluate("(()=>{const e=document.querySelector('.preview-text');const r=document.createRange();r.selectNodeContents(e);window.getSelection().removeAllRanges();window.getSelection().addRange(r);e.dispatchEvent(new Event('pointerup',{bubbles:true}))})()")
  await button('复制选中文字及来源')
  await wait("window.__ux26Copied.includes('longedit://source?')", 'excerpt payload')
  await check('excerpt includes quoted content and a source', "window.__ux26Copied.startsWith('> ') && window.__ux26Copied.includes('Budget.md')")
  await navigate('Note.md', '&search=' + encodeURIComponent('计划'))
  await check('reference survives changed search and draft survives navigation', "document.querySelector('.search-document-preview.pinned strong').textContent === 'Budget.md' && document.querySelector('#vditor-lib').textContent.includes('未保存草稿 UX26')")
  await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 820, deviceScaleFactor: 1, mobile: false })
  await pause(300)
  await check('narrow reference does not cover editor', "(()=>{const a=document.querySelector('.editor-main').getBoundingClientRect(),b=document.querySelector('.search-document-preview.pinned').getBoundingClientRect();return b.top>=a.bottom-2 && b.bottom<=innerHeight+2})()")
  await check('narrow reference text and main-open action remain visible', "(()=>{const p=document.querySelector('.search-document-preview'),t=p.querySelector('.preview-text').getBoundingClientRect(),b=p.querySelector('.preview-open').getBoundingClientRect();return t.height>=40 && b.bottom<=innerHeight && b.top>=t.bottom})()")
  await fs.writeFile(path.join(output, 'reference-narrow.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 620, deviceScaleFactor: 1, mobile: false })
  await pause(150)
  await check('short window can reach reference footer', "(()=>{const p=document.querySelector('.search-document-preview');p.scrollTop=p.scrollHeight;return p.querySelector('.preview-open').getBoundingClientRect().bottom<=innerHeight})()")
  await button('返回编辑', '.search-document-preview button')
  await wait("!document.querySelector('.search-document-preview')", 'return to editor')
  await check('return to editor focuses the main editor', "Boolean(document.activeElement?.closest('.editor-main'))")
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
  await navigate('Note.md', '&search=' + encodeURIComponent('预算'))
  await wait("document.querySelectorAll('.knowledge-preview-button').length > 0", 'reference action after return')
  await clickElement("[...document.querySelectorAll('.knowledge-result-group')].find(e=>e.textContent.includes('Budget.md')).querySelector('.knowledge-preview-button')")
  await wait("document.querySelector('.preview-text')?.textContent.includes('预算')", 'reopen reference')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
  await button('在主编辑区打开', '.search-document-preview button')
  await wait("document.querySelector('.search-navigation')?.textContent.includes('1 / 3')", 'first Markdown match')
  await button('下一处', '.search-navigation button')
  await check('Markdown next match', "document.querySelector('.search-navigation').textContent.includes('2 / 3') && window.getSelection().toString()==='预算'")
  await fs.writeFile(path.join(output, 'reference-wide.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await navigate('Note.md')
  await wait("document.querySelector('#vditor-lib')?.textContent.includes('未保存草稿 UX26')", 'draft restoration')
  await evaluate(`(()=>{const e=[...document.querySelectorAll('#vditor-lib [contenteditable=true]')].find(e=>e.getClientRects().length);e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);window.getSelection().removeAllRanges();window.getSelection().addRange(r);const data=new DataTransfer();data.setData('text/plain',window.__ux26Copied);e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))})()`)
  await wait("Boolean(document.querySelector('#vditor-lib a[href^=\"longedit://source\"]'))", 'pasted source link')
  await evaluate("document.querySelector('#vditor-lib a[href^=\"longedit://source\"]').click()")
  await wait("decodeURIComponent(location.hash).includes('Budget.md')", 'source link returns to original')
  checks.push('pasted excerpt source opens the original file')
  await check('no global error overlay', "!document.querySelector('.crash-fallback')")
  if ((await fs.readFile(path.join(library, 'Note.md'), 'utf8')).includes('UX26')) throw new Error('Draft was unexpectedly saved')
  checks.push('source file remains unchanged')
  const sourceHashes = {}
  for (const file of ['src/views/LibraryMode.vue', 'src/components/SearchDocumentPreview.vue', 'scripts/capture-v126-search-flow.mjs', 'src-tauri/target/debug/tauri-app.exe']) {
    sourceHashes[file] = createHash('sha256').update(await fs.readFile(file)).digest('hex')
  }
  await fs.writeFile(path.join(output, 'search-flow.json'), JSON.stringify({ status: 'passed-real-tauri-debug-webview2', capturedAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes, checks, clipboard: 'payload-intercepted-system-clipboard-untouched', sourceUserContentIncluded: false, limitations: ['debug-native-backend-not-installed-release', 'generated-markdown-fixtures', 'range-selection-and-route-setup-automated', 'buttons-clicked-through-CDP-pointer-input'] }, null, 2))
} catch (error) {
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), checks, body: await evaluate('document.body.innerText.slice(0,3500)') }, null, 2))
  throw error
} finally { socket.close() }
