// Operate the real custom ARIA print selector using trusted pointer input.
// Read-only AX/DOM inspection; no form-value assignment or application handler.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {once} from 'node:events'
import {withDeadline} from './with-deadline.mjs'
export async function selectHostedBrowserPdf(output,sourceCommit,harnessSourceCommit){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 const report={status:'running',evidenceLevel:'real-WebView2-print-UI-trusted-pointer',sourceCommit,harnessSourceCommit,nativeBridgeMocked:false,sourceUserContentIncluded:false,actions:[]},file=path.join(output,'v1114-browser-print-selection.json')
 let socket,id=0;const pending=new Map()
 try{
  let target;const deadline=Date.now()+25000
  while(Date.now()<deadline){const targets=await fetch('http://127.0.0.1:9343/json/list',{signal:AbortSignal.timeout(2000)}).then(r=>r.json()),prints=targets.filter(t=>t.type==='page'&&t.url==='edge://print/');assert.ok(prints.length<=1,'the print UI must be unique');if(prints.length){target=prints[0];break}await new Promise(r=>setTimeout(r,80))}
  assert.ok(target,'the real print UI must appear');assert.match(target.webSocketDebuggerUrl,/^ws:\/\/127\.0\.0\.1:9343\/devtools\/page\//);report.targetUrl=target.url;report.targetId=target.id
  socket=new WebSocket(target.webSocketDebuggerUrl);await once(socket,'open')
  socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const p=pending.get(value.id);pending.delete(value.id);if(value.error)p.reject(Error(JSON.stringify(value.error)));else p.resolve(value.result)}})
  const send=(method,params={})=>withDeadline(()=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}))}),10000,'real print UI '+method)
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value}
  const info=n=>({nodeId:n.nodeId,backendDOMNodeId:n.backendDOMNodeId,role:n.role?.value,name:n.name?.value,value:n.value?.value,ignored:n.ignored,properties:n.properties})
  const disabled=n=>n.properties?.some(p=>p.name==='disabled'&&p.value?.value===true)
  const label=n=>['Save as PDF','Microsoft Print to PDF'].find(s=>String(n.value?.value||n.name?.value||'').trim()===s)
  const inspect=async()=>{
   const nodes=(await send('Accessibility.getFullAXTree')).nodes
   const combos=nodes.filter(n=>!n.ignored&&n.role?.value==='combobox')
   const options=nodes.filter(n=>!n.ignored&&['option','menuitem','listitem'].includes(n.role?.value))
   report.observedComboboxes=combos.map(info);report.observedOptions=options.map(info)
   const printers=combos.filter(n=>label(n));assert.ok(printers.length<=1,'the actual printer selector must be unique')
   return {printer:printers[0],options}
  }
  const wait=async(read,labelText)=>{const until=Date.now()+10000;do{const value=await read();if(value)return value;await new Promise(r=>setTimeout(r,80))}while(Date.now()<until);throw Error('Real print UI not ready: '+labelText)}
  const click=async(node,action)=>{
   assert.ok(node.backendDOMNodeId&&!disabled(node)&&!node.ignored,'only an enabled visible real UI node may be clicked')
   const object=(await send('DOM.resolveNode',{backendNodeId:node.backendDOMNodeId})).object
   const point=async()=>{const r=await send('Runtime.callFunctionOn',{objectId:object.objectId,returnByValue:true,functionDeclaration:'function(){const r=this.getBoundingClientRect();return {connected:this.isConnected,x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight}}'});assert.ok(!r.exceptionDetails);return r.result.value}
   try{
    let last,stable=Date.now(),current,settled=false;const until=Date.now()+5000
    while(Date.now()<until){current=await point();if(!last||Math.abs(last.x-current.x)>.5||Math.abs(last.y-current.y)>.5)stable=Date.now();if(Date.now()-stable>=160){settled=true;break}last=current;await new Promise(r=>setTimeout(r,40))}
    assert.ok(settled&&current.connected&&current.width>0&&current.height>0&&current.x>0&&current.y>0&&current.x<current.viewportWidth&&current.y<current.viewportHeight,'the actual print control must settle within the visible viewport')
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:current.x,y:current.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})})
    report.actions.push({action,role:node.role?.value,name:node.name?.value,point:current})
   }finally{await send('Runtime.releaseObject',{objectId:object.objectId})}
  }
  await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');await send('Accessibility.enable')
  try{await send('Page.bringToFront')}catch(error){report.activationNotice=String(error)}
  let printer=await wait(async()=>{const s=await inspect();return s.printer&&!disabled(s.printer)?s.printer:null},'the custom printer combobox')
  report.initialLabel=label(printer);await evaluate("window.__writingPrintTrace=[];for(const type of ['mousedown','click','keydown','input','change'])addEventListener(type,e=>window.__writingPrintTrace.push({type,trusted:e.isTrusted}),true)")
  if(report.initialLabel!=='Save as PDF'){
   await click(printer,'open-real-printer-combobox')
   const option=await wait(async()=>{const s=await inspect(),found=s.options.filter(n=>n.name?.value==='Save as PDF');assert.ok(found.length<=1,'the visible PDF choice must be unique');return found[0]},'the visible Save as PDF option')
   assert.equal(disabled(option),false,'the actual browser PDF option must be enabled')
   await click(option,'choose-real-Save-as-PDF-option')
   printer=await wait(async()=>{const s=await inspect();return s.printer&&label(s.printer)==='Save as PDF'?s.printer:null},'the genuinely changed printer value')
  }
  report.selectedLabel=label(printer);assert.equal(report.selectedLabel,'Save as PDF')
  report.inputTrace=await evaluate('window.__writingPrintTrace')
  const direct=report.inputTrace.filter(e=>['mousedown','click','keydown'].includes(e.type));assert.ok(direct.every(e=>e.trusted),'direct user input must be trusted')
  if(report.initialLabel!=='Save as PDF'){assert.ok(direct.filter(e=>e.type==='mousedown').length>=2);assert.ok(direct.some(e=>e.type==='click'))}
  try{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,'installed-v1114-browser-save-as-pdf.png'),Buffer.from(shot.data,'base64'))}catch(error){report.screenshotNotice=String(error)}
  report.status='passed'
 }catch(error){report.status='failed';report.failure=String(error.stack||error);try{if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++id,method:'Input.dispatchKeyEvent',params:{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}}));socket.send(JSON.stringify({id:++id,method:'Input.dispatchKeyEvent',params:{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}}))}}catch{}throw error}
 finally{await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');socket?.close()}
 return report
}
