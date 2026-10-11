import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
const endpoint=process.env.LONGEDIT_CDP_ENDPOINT, output=process.env.LONGEDIT_UX26_OUTPUT
if(!endpoint||!output) throw Error('Isolated runner required')
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const connections=[]
async function connect(target) {
  const socket=new WebSocket(target.webSocketDebuggerUrl); await once(socket,'open')
  const pending=new Map();let id=0
  socket.addEventListener('message',e=>{const d=JSON.parse(e.data),p=pending.get(d.id);if(!p)return;pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result)})
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error(method+' timeout'))},15000);pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params}))})
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
  const c={send,evaluate,socket};connections.push(c);return c
}
async function wait(fn,label){for(let i=0;i<150;i++){if(await fn())return;await pause(100)}throw Error(label)}
const targets=()=>fetch(endpoint+'/json').then(r=>r.json())
const checks=[]
const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)}
async function click(c,selector){let p;await wait(async()=>{p=await c.evaluate(`(()=>{const e=${selector};if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`);return !!p},'click target unobstructed');await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1})}
try{
  let mainTarget
  await wait(async()=>{try{mainTarget=(await targets()).find(t=>t.type==='page');return !!mainTarget}catch{return false}},'main target')
  const main=await connect(mainTarget)
  await wait(()=>main.evaluate("document.body.innerText.includes('Note.md')"),'library initialized')
  await main.evaluate("window.__TAURI_INTERNALS__.invoke('open_quick_note')")
  let quickTarget
  await wait(async()=>{quickTarget=(await targets()).find(t=>t.type==='page'&&t.id!==mainTarget.id&&t.url.includes('quick-note'));return !!quickTarget},'native quick window')
  const quick=await connect(quickTarget)
  await wait(()=>quick.evaluate("!!document.querySelector('textarea')"),'quick editor')
  check('real quick-note window identity',await quick.evaluate("window.__TAURI_INTERNALS__.metadata.currentWindow.label==='quick-note' && document.querySelector('.app-container').dataset.windowRole==='external'"))
  await main.evaluate("window.__TAURI_INTERNALS__.invoke('open_quick_note')")
  check('reopening reuses same window', (await targets()).filter(t=>t.type==='page'&&t.url.includes('quick-note')).length===1)
  await quick.evaluate("document.querySelector('textarea').focus()")
  await quick.send('Input.insertText',{text:'关闭前请保留这段会议记录'})
  await click(quick,"document.querySelector('button[aria-label=关闭快速笔记]')")
  await wait(()=>quick.evaluate("!!document.querySelector('[role=alertdialog]')"),'unsaved close confirmation')
  await click(quick,"[...document.querySelectorAll('[role=alertdialog] button')].find(e=>e.textContent==='取消')")
  check('cancel closing preserves draft',await quick.evaluate("document.querySelector('textarea').value==='关闭前请保留这段会议记录'"))
  await fs.mkdir(output,{recursive:true})
  await fs.writeFile(path.join(output,'native-quick-note.png'),Buffer.from((await quick.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await quick.evaluate("(()=>{const e=document.querySelector('select[aria-label=保存后操作]');e.value='open';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
  await click(quick,"[...document.querySelectorAll('button')].find(e=>e.textContent==='保存笔记')")
  await wait(()=>main.evaluate("decodeURIComponent(location.hash).includes('快速笔记_')"),'main navigation').catch(async error=>{console.log('Quick window:',await quick.evaluate('document.body.innerText'));console.log('Main:',await main.evaluate('location.hash + document.body.innerText'));throw error})
  await wait(()=>main.evaluate("!!document.querySelector('#vditor-lib')?.textContent.includes('关闭前请保留这段会议记录')"),'saved text in main editor')
  check('saved note opened in main editor',true)
  await wait(async()=>!(await targets()).some(t=>t.id===quickTarget.id),'quick window closed after acknowledged open')
  check('quick window closes after handoff',true)
  await fs.writeFile(path.join(output,'main-opened-note.png'),Buffer.from((await main.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await fs.writeFile(path.join(output,'window-checks.json'),JSON.stringify({checks,scope:'Native window created through the same production command as tray action; tray icon not physically clicked'},null,2)+'\n')
  console.log(JSON.stringify(checks))
}finally{for(const c of connections)c.socket.close()}
