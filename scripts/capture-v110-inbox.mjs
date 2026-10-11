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
  const wait=async(expression,label)=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await pause(100)}throw Error(label)}
  await wait("document.body.innerText.includes('Note.md')",'library ready')
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:820,deviceScaleFactor:1,mobile:false})
  const click=async(selector)=>{let p;for(let i=0;i<100;i++){p=await evaluate(`(()=>{const e=${selector};if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`);if(p)break;await pause(50)}if(!p)throw Error('Control unavailable '+selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1})}
  const button=text=>click(`[...document.querySelectorAll('.inbox-browser button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`)
  const checks=[];const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)}
  const lib=process.env.LONGEDIT_E2E_LIBRARY,inbox=path.join(lib,'Inbox')
  await click("document.querySelector('.inbox-shortcut')")
  await wait("!!document.querySelector('.inbox-browser [role=alert]')",'missing Inbox distinguished')
  check('missing Inbox is not reported empty',!await evaluate("document.querySelector('.inbox-browser').textContent.includes('暂无可浏览')"))
  await fs.mkdir(path.join(inbox,'项目'),{recursive:true})
  await fs.writeFile(path.join(inbox,'收集记录.md'),'# 收集记录\n\n会议后再归档。')
  await fs.writeFile(path.join(inbox,'项目','子笔记.md'),'# 子笔记')
  await button('重试读取')
  await wait("document.querySelector('.inbox-browser').textContent.includes('收集记录.md')",'real files listed')
  check('file and folder counts correct',await evaluate("document.querySelector('.inbox-browser').textContent.includes('1 个文件 · 1 个文件夹')"))
  await click("[...document.querySelectorAll('.inbox-browser li button')].find(e=>e.textContent.includes('收集记录.md'))")
  await wait("document.querySelector('#vditor-lib')?.textContent.includes('会议后再归档')",'file opened in main')
  check('inbox file opens in main editor',true)
  await fs.mkdir(output,{recursive:true})
  await fs.writeFile(path.join(output,'inbox-main.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await click("[...document.querySelectorAll('.inbox-browser li button')].find(e=>e.textContent.includes('项目'))")
  await wait("document.querySelector('.inbox-browser').textContent.includes('子笔记.md')",'folder browsing')
  await button('↑ 上一级')
  await wait("document.querySelector('.inbox-browser').textContent.includes('收集记录.md')",'return parent')
  check('folder browsing returns to Inbox',true)
  await fs.rename(path.join(inbox,'收集记录.md'),path.join(inbox,'重命名记录.md'))
  await button('刷新')
  await wait("document.querySelector('.inbox-browser').textContent.includes('重命名记录.md')",'refresh rename')
  check('refresh removes stale name',!await evaluate("document.querySelector('.inbox-browser').textContent.includes('收集记录.md')"))
  await button('← 全部文件')
  check('return restores existing file tree',await evaluate("!document.querySelector('.inbox-browser') && document.querySelector('.tree-viewport').getBoundingClientRect().height>0"))
  await click("document.querySelector('.inbox-shortcut')")
  await wait("!!document.querySelector('.inbox-browser li')",'reopen')
  await evaluate("document.querySelector('.search-control-row input').focus()")
  await send('Input.insertText',{text:'Note'})
  await wait("!document.querySelector('.inbox-browser')",'search restores results surface')
  check('typing search exits Inbox without losing query',await evaluate("document.querySelector('.search-control-row input').value==='Note'"))
  check('all seven sidebar tabs retained',await evaluate("document.querySelectorAll('[role=tablist][aria-label=侧边栏导航] [role=tab]').length===7"))
  await fs.writeFile(path.join(output,'checks.json'),JSON.stringify({checks,scope:'Isolated real library browsing; no archive implementation'},null,2)+'\n')
  console.log(JSON.stringify(checks))
} finally { socket.close() }
