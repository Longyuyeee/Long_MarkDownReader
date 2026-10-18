// Read the real browser print UI and operate it with trusted Tab/arrow keys.
// Never set select.value, dispatch a DOM event or call an application handler.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {once} from 'node:events'
import {withDeadline} from './with-deadline.mjs'
export async function selectHostedBrowserPdf(output,sourceCommit,harnessSourceCommit){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 const report={status:'running',evidenceLevel:'real-WebView2-print-UI-trusted-keyboard',sourceCommit,harnessSourceCommit,nativeBridgeMocked:false,sourceUserContentIncluded:false,actions:[]},file=path.join(output,'v1114-browser-print-selection.json')
 let socket,id=0;const pending=new Map()
 try{
  let target;const deadline=Date.now()+25000
  while(Date.now()<deadline){const targets=await fetch('http://127.0.0.1:9343/json/list',{signal:AbortSignal.timeout(2000)}).then(r=>r.json()),prints=targets.filter(t=>t.type==='page'&&t.url==='edge://print/');assert.ok(prints.length<=1,'only the new owned print UI may be targeted');if(prints.length){target=prints[0];break}await new Promise(r=>setTimeout(r,80))}
  assert.ok(target,'the actual browser print target must appear');assert.match(target.webSocketDebuggerUrl,/^ws:\/\/127\.0\.0\.1:9343\/devtools\/page\//);report.targetUrl=target.url;report.targetId=target.id
  socket=new WebSocket(target.webSocketDebuggerUrl);await once(socket,'open');socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const p=pending.get(value.id);pending.delete(value.id);if(value.error)p.reject(Error(JSON.stringify(value.error)));else p.resolve(value.result)}})
  const send=(method,params={})=>withDeadline(()=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}))}),10000,'real print UI '+method)
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value}
  const key=async(name,code,virtual)=>{await send('Input.dispatchKeyEvent',{type:name==='Enter'?'keyDown':'rawKeyDown',key:name,code,windowsVirtualKeyCode:virtual,...(name==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code,windowsVirtualKeyCode:virtual})}
  const inspect=async()=>{
   const tree=(await send('DOM.getDocument',{depth:-1,pierce:true})).root,nodes=[]
   report.controlNodes=[]
   const walk=n=>{if(n.localName==='select')nodes.push(n);if(['select','input'].includes(n.localName)||(n.attributes||[]).includes('combobox'))report.controlNodes.push({tag:n.localName,attributes:n.attributes});for(const c of [...(n.children||[]),...(n.shadowRoots||[]),...(n.contentDocument?[n.contentDocument]:[])])walk(c)};walk(tree)
   const selects=[]
   for(const n of nodes){const object=(await send('DOM.resolveNode',{nodeId:n.nodeId})).object;const value=await send('Runtime.callFunctionOn',{objectId:object.objectId,returnByValue:true,functionDeclaration:'function(){return {id:this.id,value:this.value,selectedIndex:this.selectedIndex,focused:this.matches(":focus")||this.getRootNode().activeElement===this,disabled:this.disabled,connected:this.isConnected,options:Array.from(this.options).map(o=>({label:o.label.trim(),value:o.value,disabled:o.disabled}))}}'});await send('Runtime.releaseObject',{objectId:object.objectId});assert.ok(!value.exceptionDetails);selects.push(value.result.value)}
   report.observedSelects=selects
   const found=selects.filter(s=>s.connected&&s.options.some(o=>o.label==='Save as PDF'))
   assert.ok(found.length<=1,'the printer selector must be unique');return found[0]||null
  }
  const readySelect=async()=>{const until=Date.now()+10000;do{const s=await inspect();report.documentReadyState=await evaluate('document.readyState');if(s&&!s.disabled&&!s.options.find(o=>o.label==='Save as PDF').disabled)return s;await new Promise(r=>setTimeout(r,80))}while(Date.now()<until);throw Error('The real print UI did not expose an enabled Save as PDF option within its readiness budget')}
  await send('Page.enable');await send('Runtime.enable');await send('Page.bringToFront');await evaluate(`window.__writingPrintTrace=[];for(const type of ['keydown','input','change'])addEventListener(type,e=>window.__writingPrintTrace.push({type,trusted:e.isTrusted}),true)`)
  let state=await readySelect();report.initialLabel=state.options[state.selectedIndex]?.label
  for(let n=0;n<80&&!state.focused;n++){await key('Tab','Tab',9);await new Promise(r=>setTimeout(r,30));state=await readySelect();report.actions.push('Tab')}
  assert.ok(state.focused,'the printer selector must have actual keyboard focus')
  if(state.options[state.selectedIndex]?.label!=='Save as PDF'){
   await key('Home','Home',36);report.actions.push('Home');await new Promise(r=>setTimeout(r,80));state=await readySelect()
   for(let n=0;n<state.options.length+2&&state.options[state.selectedIndex]?.label!=='Save as PDF';n++){await key('ArrowDown','ArrowDown',40);report.actions.push('ArrowDown');await new Promise(r=>setTimeout(r,80));state=await readySelect()}
   await key('Tab','Tab',9);report.actions.push('Tab-to-commit-selection');await new Promise(r=>setTimeout(r,80));state=await readySelect()
  }
  report.selectedLabel=state.options[state.selectedIndex]?.label;assert.equal(report.selectedLabel,'Save as PDF','requesting an option is not equivalent to a real selection')
  report.inputTrace=await evaluate('window.__writingPrintTrace');assert.ok(report.inputTrace.filter(e=>e.type==='keydown').every(e=>e.trusted));if(report.initialLabel!=='Save as PDF')assert.ok(report.inputTrace.some(e=>['change','input'].includes(e.type)&&e.trusted),'a real changed selection requires trusted input')
  try{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,'installed-v1114-browser-save-as-pdf.png'),Buffer.from(shot.data,'base64'))}catch(error){report.screenshotNotice=String(error)}
  report.status='passed'
 }catch(error){report.status='failed';report.failure=String(error.stack||error);try{if(socket?.readyState===WebSocket.OPEN){const n=++id;socket.send(JSON.stringify({id:n,method:'Input.dispatchKeyEvent',params:{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}}));socket.send(JSON.stringify({id:++id,method:'Input.dispatchKeyEvent',params:{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}}))}}catch{}throw error}
 finally{await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');socket?.close()}
 return report
}
