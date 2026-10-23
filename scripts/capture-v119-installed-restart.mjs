// Executed only after the lifecycle has stopped and relaunched the same
// installed executable, with the same owned WebView profile. No product hooks.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {assertSessionHosted} from './lib/v119-native-session-fixture.mjs'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
import {validateInstalledWorkSession} from './lib/installed-v1-1-9-evidence.mjs'
import {withDeadline} from './lib/with-deadline.mjs'
assertSessionHosted();assert.equal(process.env.LONGEDIT_R5I_DISPOSABLE,'1');assert.ok(['1.1.9','1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16'].includes(process.env.LONGEDIT_R5J_APP_VERSION))
const output=process.env.LONGEDIT_R5J_OUTPUT,reportFile=path.join(output,'installed-v119-workflow.json'),report=JSON.parse(await fs.readFile(reportFile,'utf8'))
assert.equal(report.status,'passed');assert.equal(report.sourceCommit,process.env.LONGEDIT_R5J_SOURCE_COMMIT)
assert.equal(report.executableSha256,crypto.createHash('sha256').update(await fs.readFile(process.env.LONGEDIT_R5J_EXECUTABLE)).digest('hex'))
let socket,failure
try{
 let target;for(let n=0;n<240;n++){const targets=await fetch('http://127.0.0.1:9343/json/list').then(r=>r.json()).catch(()=>[]);target=targets.find(t=>/^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(t.url)&&!t.url.includes('quick-note')&&!t.url.includes('external=1')&&t.webSocketDebuggerUrl);if(target)break;await new Promise(resolve=>setTimeout(resolve,150))}assert.ok(target)
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});let seq=0;const pending=new Map()
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data),entry=pending.get(data.id);if(!entry)return;pending.delete(data.id);data.error?entry.reject(Error(data.error.message)):entry.resolve(data.result)})
 const send=(method,params={})=>withDeadline(()=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))}),30000,method)
 const evaluate=async expression=>{const data=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(data.exceptionDetails)throw Error(JSON.stringify(data.exceptionDetails));return data.result.value}
 const ui=nativeUserInput({send,evaluate},{timeoutMs:60000}),store=`document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('app')`
 await ui.waitFor(`${store}?.configReady===true&&!!document.querySelector('.app-navigation')`,'real process restart bootstrapped')
 const version=await evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:app|version')`);assert.equal(version,process.env.LONGEDIT_R5J_APP_VERSION)
 await ui.clickText('.app-navigation a','工作台');await ui.click('#work-session-choice');await ui.key('Home','Home',36)
 const index=await evaluate(`Array.from(document.querySelector('#work-session-choice').options).findIndex(o=>o.textContent==='安装验收现场')`);assert.ok(index>0);for(let n=0;n<index;n++)await ui.key('ArrowDown','ArrowDown',40);await ui.key('Enter','Enter',13)
 await ui.clickText('.work-session-bar button','继续工作');await ui.waitFor(`Math.abs(document.querySelector('.text-workspace .cm-scroller')?.scrollTop-340)<3`,'first position restored after real process restart');const first=await evaluate(`document.querySelector('.text-workspace .cm-scroller').scrollTop`)
 await ui.clickTarget(`[...document.querySelectorAll('.workspace-tab')].find(e=>e.textContent.includes('阅读39'))`);await ui.waitFor(`document.querySelector('.text-workspace .document-title')?.textContent.includes('阅读39')&&Math.abs(document.querySelector('.text-workspace .cm-scroller')?.scrollTop-457)<3`,'last deferred position restored after real process restart');const last=await evaluate(`document.querySelector('.text-workspace .cm-scroller').scrollTop`)
 const scenes=await evaluate(`JSON.parse(localStorage.getItem('longedit.work-sessions.v1:'+encodeURIComponent(${store}.libraryPath.replaceAll(String.fromCharCode(92),'/').toLowerCase()))||'[]')`),scene=scenes.find(item=>item.name==='安装验收现场');assert.ok(scene)
 report.processRestart={status:'passed',executableSha256:report.executableSha256,nativeVersion:version,sceneFiles:scene.tabs.length,first,last,mainTargetId:target.id,evidenceLevel:'same-installed-process-image-relaunched-by-owned-lifecycle'}
 validateInstalledWorkSession(report,{appVersion:process.env.LONGEDIT_R5J_APP_VERSION,sourceCommit:process.env.LONGEDIT_R5J_SOURCE_COMMIT,artifacts:[{target:'nsis',sha256:process.env.LONGEDIT_R5J_INSTALLER_SHA256}]})
 const image=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'installed-v119-process-restart.png'),Buffer.from(image.data,'base64'))
}catch(error){failure=error;report.status='failed';report.processRestart={status:'failed',error:{message:String(error),stack:error.stack}}}finally{socket?.close();await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n')}
if(failure)throw failure
