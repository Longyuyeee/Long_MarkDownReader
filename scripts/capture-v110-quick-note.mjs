import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = process.env.LONGEDIT_UX26_OUTPUT
if (!endpoint || !output) throw new Error('Isolated runner environment required')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let target
for (let i = 0; i < 100; i++) {
  try { target = (await fetch(endpoint + '/json').then(r => r.json())).find(t => t.type === 'page') } catch {}
  if (target) break
  await pause(200)
}
if (!target?.webSocketDebuggerUrl) throw new Error('No isolated WebView')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await once(socket, 'open')
let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data)
  const p = pending.get(data.id)
  if (!p) return
  pending.delete(data.id); clearTimeout(p.timer)
  data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')) }, 20000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
try {
  await send('Page.enable')
  let booted = false
  for (let i = 0; i < 150; i++) {
    if (await evaluate("document.body.innerText.includes('Note.md')")) { booted = true; break }
    await pause(200)
  }
  if (!booted) throw new Error('Isolated library did not initialize: ' + await evaluate('document.body.innerText'))
  await send('Emulation.setDeviceMetricsOverride', { width: 560, height: 460, deviceScaleFactor: 1, mobile: false })
  await evaluate("location.hash='/quick-note'")
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (await evaluate("!!document.querySelector('.quick-note-window textarea')")) { ready = true; break }
    await pause(100)
  }
  if (!ready) throw new Error('QuickNote route not rendered: ' + await evaluate('location.href + document.body.innerText'))
  await pause(500)
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, 'quick-note-after.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  const observed = await evaluate("({text:document.querySelector('.quick-note-window').innerText,textarea:!!document.querySelector('textarea'),viewport:{width:innerWidth,height:innerHeight}})")
  await fs.writeFile(path.join(output, 'observation.json'), JSON.stringify({ scope: 'Debug WebView QuickNote route; real filesystem capture tests, not tray lifecycle', observed }, null, 2) + '\n')
  const checks = []
  const check = (name, value) => { if (!value) throw new Error(name); checks.push(name) }
  const choose = async (label, value) => evaluate(`(()=>{const e=document.querySelector('select[aria-label="${label}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  const type = async text => { await evaluate("document.querySelector('textarea').focus()"); await send('Input.insertText', {text}) }
  const save = async () => {
    const p = await evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent==='保存笔记'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1})
    await pause(1000)
  }
  const lib = process.env.LONGEDIT_E2E_LIBRARY
  check('three selectors share one row at 560px', await evaluate("(()=>{const a=[...document.querySelectorAll('.capture-toolbar select')].map(e=>e.getBoundingClientRect().top);return a.length===3 && Math.max(...a)-Math.min(...a)<2})()"))
  await choose('保存后操作','continue')
  await save()
  check('empty note does not create Inbox', !await fs.stat(path.join(lib,'Inbox')).catch(()=>null))
  await type('会议结束后先记下来，稍后整理。')
  await save()
  const files = (await fs.readdir(path.join(lib,'Inbox'))).filter(f=>f.endsWith('.md'))
  check('one real note in Inbox', files.length===1)
  check('saved Chinese content matches', await fs.readFile(path.join(lib,'Inbox',files[0]),'utf8')==='会议结束后先记下来，稍后整理。')
  check('continue clears successfully saved body', await evaluate("document.querySelector('textarea').value===''"))
  await choose('模板','会议纪要')
  check('existing meeting template reused', await evaluate("document.querySelector('textarea').value.includes('## 待办事项')"))
  await save()
  check('second note does not overwrite first', (await fs.readdir(path.join(lib,'Inbox'))).filter(f=>f.endsWith('.md')).length===2)
  // Turn the isolated Inbox into an occupied file to exercise a real native write failure.
  await fs.rename(path.join(lib,'Inbox'),path.join(lib,'Inbox-saved'))
  await fs.writeFile(path.join(lib,'Inbox'),'occupied fixture')
  await type('保存失败也不能丢掉这段话')
  await save()
  check('write failure preserves body', await evaluate("document.querySelector('textarea').value==='保存失败也不能丢掉这段话'"))
  check('failure clearly reported', await evaluate("document.querySelector('[role=status]').textContent.includes('保存失败')"))
  await fs.unlink(path.join(lib,'Inbox'))
  await fs.rename(path.join(lib,'Inbox-saved'),path.join(lib,'Inbox'))
  await save()
  check('retry after target repair creates exactly one more note', (await fs.readdir(path.join(lib,'Inbox'))).filter(f=>f.endsWith('.md')).length===3)
  await send('Emulation.setDeviceMetricsOverride',{width:400,height:300,deviceScaleFactor:1,mobile:false})
  await pause(200)
  check('narrow footer stays visible', await evaluate("document.querySelector('footer').getBoundingClientRect().bottom<=innerHeight"))
  await fs.writeFile(path.join(output,'quick-note-narrow.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await fs.writeFile(path.join(output,'checks.json'),JSON.stringify({checks,scope:'No tray creation, close confirmation, native directory picker or main-window handoff verified'},null,2)+'\n')
  console.log(JSON.stringify(checks))
} finally { socket.close() }
