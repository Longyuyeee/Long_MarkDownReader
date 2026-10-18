import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {pathToFileURL} from 'node:url'
import crypto from 'node:crypto'
import {withDeadline} from './with-deadline.mjs'
export async function inspectStandaloneDelivery(file,ownerRoot,output){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.LONGEDIT_R5I_DISPOSABLE,'1')
 assert.ok(path.resolve(file).toLowerCase().startsWith(path.resolve(ownerRoot).toLowerCase()+path.sep))
 await fs.access(path.join(ownerRoot,'.v119-installed-owner'))
 assert.ok(process.env.RUNNER_TEMP,'the independent browser profile must stay outside the watched library')
 const edge=path.join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),profile=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP,'longedit-html-'+crypto.randomUUID()+'-'))
 const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,pathToFileURL(file).href],{windowsHide:true,stdio:'ignore'})
 let socket;const pending=new Map();let id=0
 try{
  let port;const deadline=Date.now()+20000
  while(Date.now()<deadline){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.ok(port,'separate browser must actually start')
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),target=targets.find(t=>t.type==='page'&&t.url.startsWith('file:'));assert.ok(target)
  socket=new WebSocket(target.webSocketDebuggerUrl);await once(socket,'open')
  socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.resolve(r.result)}})
  const send=(method,params={})=>withDeadline(()=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}))}),15000,method)
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});assert.ok(!r.exceptionDetails);return r.result.value}
  const imageDeadline=Date.now()+15000
  while(Date.now()<imageDeadline){if(await evaluate(`!!document.querySelector('main')&&[...document.images].every(i=>i.complete&&i.naturalWidth>0)`))break;await new Promise(r=>setTimeout(r,100))}
  const result=await evaluate(`({url:location.href,title:document.title,text:document.querySelector('main')?.innerText,images:[...document.images].map(i=>({width:i.naturalWidth,height:i.naturalHeight,embedded:i.getAttribute('src').startsWith('data:image/')})),scripts:document.scripts.length,temporarySources:document.querySelectorAll('[srcset],[onerror],[onclick]').length})`)
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,'installed-v1114-standalone-html.png'),Buffer.from(screenshot.data,'base64'))
  return {...result,evidenceLevel:'separate-installed-Edge-headless-file-url-no-app-IPC',nativeBridgeMocked:false}
 }finally{socket?.close();child.kill()}
}
