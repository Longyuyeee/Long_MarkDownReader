import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
import {withDeadline} from './lib/with-deadline.mjs'
import {runInstalledV1122Workflow} from './lib/installed-v1-1-22-workflow.mjs'
const output=process.env.LONGEDIT_R5J_OUTPUT
assert.equal(process.env.LONGEDIT_R5I_DISPOSABLE,'1')
let socket
try{
 let target;for(let n=0;n<240;n++){const targets=await fetch('http://127.0.0.1:9343/json/list').then(r=>r.json()).catch(()=>[]);target=targets.find(t=>/^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(t.url)&&!t.url.includes('quick-note')&&!t.url.includes('external=1')&&t.webSocketDebuggerUrl);if(target)break;await new Promise(resolve=>setTimeout(resolve,150))}assert.ok(target)
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});let seq=0;const pending=new Map()
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data),entry=pending.get(data.id);if(!entry)return;pending.delete(data.id);data.error?entry.reject(Error(data.error.message)):entry.resolve(data.result)})
 const send=(method,params={})=>withDeadline(()=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))}),30000,method)
 const evaluate=async expression=>{const data=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(data.exceptionDetails)throw Error(JSON.stringify(data.exceptionDetails));return data.result.value}

 const ui=nativeUserInput({send,evaluate},{timeoutMs:60000})
 await ui.waitFor("document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('app')?.configReady===true&&!!document.querySelector('.app-navigation')",'restarted application ready')
 const navigate=async(hash,selector,label)=>{await evaluate('location.hash='+JSON.stringify(hash));await ui.waitFor('!!document.querySelector('+JSON.stringify(selector)+')',label)}
 const capture=async name=>{const image=await send('Page.captureScreenshot',{format:'jpeg'});await fs.writeFile(path.join(output,name),Buffer.from(image.data,'base64'))}
 await runInstalledV1122Workflow({send,evaluate,navigate,capture,library:process.env.LONGEDIT_R5J_LIBRARY,output,sourceCommit:process.env.LONGEDIT_R5J_SOURCE_COMMIT,installerSha256:process.env.LONGEDIT_R5J_INSTALLER_SHA256,appVersion:process.env.LONGEDIT_R5J_APP_VERSION,installedExecutable:process.env.LONGEDIT_R5J_EXECUTABLE,restart:true})
}finally{socket?.close()}
