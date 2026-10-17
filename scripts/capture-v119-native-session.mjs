// Backend integration only. Actual WebView2/Tauri invoke, never a simulated IPC
// adapter, direct Rust-function bridge, desktop takeover or installer claim.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {withDeadline} from './lib/with-deadline.mjs'
import {assertSessionHosted,createSessionFixture,sessionFixturePaths,sessionProductCommit,validateNativeSessionReport} from './lib/v119-native-session-fixture.mjs'
assertSessionHosted()
const [phase,root,output]=process.argv.slice(2),fixture=sessionFixturePaths(root)
if(phase==='fixture'){await createSessionFixture(root);process.exit(0)}
assert.ok(['baseline','restart'].includes(phase));await fs.access(path.join(root,'.v119-session-owner'))
const executableSha256=crypto.createHash('sha256').update(await fs.readFile(process.env.LONGEDIT_NATIVE_EXECUTABLE)).digest('hex')
const checks=[],calls=[],sockets=[],report={schemaVersion:1,phase,status:'running',productCommit:sessionProductCommit,harnessCommit:process.env.GITHUB_SHA,executableSha256,runtimeBaseVersion:'1.1.8',evidenceLevel:'debug-tauri-wry-real-session-ipc-not-installed',releaseCandidate:false,isInstaller:false,sourceUserContentIncluded:false,desktopInputUsed:false,checks,calls}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const digest=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const files=[path.join(fixture.library,'项目','纪要.md'),path.join(fixture.library,'参考.md'),path.join(fixture.target,'项目','纪要.md'),path.join(fixture.target,'参考.md'),path.join(fixture.outside,'outside.md')]
const before=await Promise.all(files.map(digest))
async function connect(predicate,label){
 let target,lastTargets=[]
 for(let n=0;n<160;n++){
  const targets=await fetch('http://127.0.0.1:9458/json/list',{signal:AbortSignal.timeout(2000)}).then(r=>r.json()).catch(()=>[])
  lastTargets=targets.map(({url,title,type})=>({url,title,type}));target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl&&predicate(item));if(target)break;await delay(250)
 }
 if(!target){report.connectionDiagnostics=lastTargets;throw Error('Intended session WebView target unavailable')}
 const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let seq=0;sockets.push(socket)
 await withDeadline(()=>new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})}),10000,'connect session WebView')
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data),entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result)})
 const send=(method,params)=>withDeadline(()=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))}),30000,method)
 const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value}
 return {evaluate,run:(fn,...args)=>evaluate(`(${fn.toString()})(${args.map(arg=>JSON.stringify(arg)).join(',')})`),invoke:async(command,args={})=>{
  const result=await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(error){return {ok:false,error:String(error)}}})()`)
  calls.push({window:label,command,ok:result.ok});if(!result.ok)throw Error(result.error);return result.value
 }}
}
try{
 const main=await connect(target=>target.url.startsWith('http://127.0.0.1:14200/')&&!target.url.includes('quick-note'),'main')
 const ready=`(()=>{const store=document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('app');return !!window.__TAURI_INTERNALS__?.invoke && store?.configReady===true && store.activeLibraryPath===${JSON.stringify(fixture.library)}})()`
 for(let n=0;n<600&&!await main.evaluate(ready);n++)await delay(100)
 assert.equal(await main.evaluate(ready),true);assert.equal(await main.invoke('plugin:app|version'),'1.1.8')
 const config=await main.invoke('get_config');assert.equal(config.activeLibraryPath,fixture.library);assert.deepEqual(config.libraries.map(lib=>lib.path),[fixture.library,fixture.target])
 const preflight=relativePaths=>main.invoke('preflight_work_session',{libraryRoot:fixture.target,relativePaths})
 if(phase==='restart'){
  const baseline=JSON.parse(await fs.readFile(path.join(output,'baseline.json'),'utf8'));validateNativeSessionReport(baseline,'baseline');assert.equal(baseline.executableSha256,executableSha256)
  const bundle=await main.invoke('read_work_session_bundle',{sourcePath:fixture.exportPath});assert.equal(bundle.files[0].relativePath,'项目/纪要.md');assert.equal(await digest(fixture.exportPath),baseline.exportSha256)
  checks.push('same-program-and-export-survive-process-restart')
  const restored=await main.run(async root=>{const {readWorkSessions}=await import('/src/utils/workSessions.ts');return readWorkSessions(localStorage,root)},fixture.target)
  assert.equal(restored.length,1);assert.equal(restored[0].name,'客户交付');assert.ok(restored[0].tabs[0].path.replaceAll('\\','/').endsWith('/新资料 & 中文/项目/纪要.md'))
  const frame=await preflight(['项目/纪要.md','缺失.pdf','参考.md']);assert.deepEqual(frame.files.map(item=>item.state),['ready','missing','ready'])
  checks.push('real-webview-stored-scene-survives-process-restart')
 }else{
  checks.push('runtime-and-config-identity')
  const bundle=await main.run(async root=>{const {exportableWorkSession}=await import('/src/utils/portableWorkSession.ts');const file=root+'/项目/纪要.md';return exportableWorkSession({version:1,id:'generated',name:'客户交付',libraryRoot:root,savedAt:100,tabs:[{id:file,path:file,title:'纪要.md',isDirty:true,content:'PRIVATE DOCUMENT BODY',pinned:true},{id:root+'/缺失.pdf',path:root+'/缺失.pdf',title:'缺失.pdf',isDirty:false}],activeTabId:file,views:{[file]:{scrollTop:120,scrollLeft:0,draft:'PRIVATE DRAFT'}},search:{query:'预算',types:['markdown'],selected:'PRIVATE EXCERPT',scroll:40},reference:{path:root+'/参考.md',title:'参考',query:'预算',content:'PRIVATE REFERENCE'}})},fixture.library)
  await main.invoke('export_work_session_bundle',{targetPath:fixture.exportPath,bundle})
  const exported=await fs.readFile(fixture.exportPath,'utf8');assert.ok(!exported.includes('PRIVATE'));assert.ok(!exported.includes(fixture.library));assert.ok(!exported.includes('selected'))
  assert.deepEqual(await main.invoke('read_work_session_bundle',{sourcePath:fixture.exportPath}),bundle)
  report.exportSha256=await digest(fixture.exportPath);checks.push('metadata-export-whitelist-and-real-roundtrip')
  await assert.rejects(()=>main.invoke('export_work_session_bundle',{targetPath:fixture.exportPath,bundle}));assert.equal(await digest(fixture.exportPath),report.exportSha256)
  const invalidTarget=path.join(root,'never-created.longedit-session.json');await assert.rejects(()=>main.invoke('export_work_session_bundle',{targetPath:invalidTarget,bundle:{...bundle,content:'PRIVATE'}}));await assert.rejects(()=>fs.access(invalidTarget))
  checks.push('existing-export-and-invalid-fields-never-write')
  for(const [name,content] of [['bad-schema',JSON.stringify({...bundle,schemaVersion:999})],['unknown-field',JSON.stringify({...bundle,content:'PRIVATE'})],['oversize',' '.repeat(256*1024+1)]]){
   const sourcePath=path.join(root,name+'.longedit-session.json');await fs.writeFile(sourcePath,content,{flag:'wx'});const hash=await digest(sourcePath);await assert.rejects(()=>main.invoke('read_work_session_bundle',{sourcePath}));assert.equal(await digest(sourcePath),hash)
  }
  checks.push('invalid-schema-and-oversize-import-preserve-bytes')
  const frame=await preflight(['项目/纪要.md','缺失.pdf','参考.md']);assert.deepEqual(frame.files.map(item=>item.state),['ready','missing','ready']);assert.ok(!JSON.stringify(frame).includes('PRIVATE'))
  const available=await main.run(async(bundle,root,frame)=>{const m=await import('/src/utils/portableWorkSession.ts');return m.availableWorkSession(m.materializeWorkSession(bundle,root,'imported'),frame)},bundle,fixture.target,frame)
  assert.equal(available.session.tabs.length,1);assert.equal(available.missing.length,1);assert.ok(available.session.reference.path)
  checks.push('configured-new-root-partial-preflight')
  for(const relativePaths of [['../outside.md'],['note.md','NOTE.MD'],Array.from({length:130},(_,n)=>`${n}.md`)])await assert.rejects(()=>preflight(relativePaths))
  await assert.rejects(()=>main.invoke('preflight_work_session',{libraryRoot:fixture.outside,relativePaths:['outside.md']}));checks.push('traversal-duplicates-and-unconfigured-root-rejected')
  const rejected=await preflight(['目录别名/outside.md','secrets.json','program.exe']);assert.deepEqual(rejected.files.map(item=>item.state),['unavailable','unavailable','unsupported']);assert.ok(rejected.files.every(item=>!item.path));await assert.rejects(()=>preflight(['.longedit/config.json']))
  checks.push('canonical-junction-and-private-files-rejected')
  const located=await main.invoke('locate_work_session_file',{libraryRoot:fixture.target,path:path.join(fixture.target,'项目','纪要.md')});assert.equal(located.relativePath,'项目/纪要.md');assert.equal(located.state,'ready')
  for(const selected of [fixture.target,path.join(fixture.outside,'outside.md'),path.join(fixture.target,'目录别名','outside.md')])await assert.rejects(()=>main.invoke('locate_work_session_file',{libraryRoot:fixture.target,path:selected}))
  checks.push('locate-real-inside-file-only')
  await main.invoke('open_quick_note');const quick=await connect(target=>target.url.includes('quick-note'),'quick-note')
  const quickExport=path.join(root,'quick-never-created.longedit-session.json')
  for(const [command,args] of [['export_work_session_bundle',{targetPath:quickExport,bundle}],['read_work_session_bundle',{sourcePath:fixture.exportPath}],['preflight_work_session',{libraryRoot:fixture.target,relativePaths:['项目/纪要.md']}],['locate_work_session_file',{libraryRoot:fixture.target,path:path.join(fixture.target,'项目','纪要.md')}]])await assert.rejects(()=>quick.invoke(command,args),/主工作台/)
  await assert.rejects(()=>fs.access(quickExport));checks.push('secondary-window-rejects-all-four-session-commands')
  const imported=await main.run(async(bundle,root)=>{const p=await import('/src/utils/portableWorkSession.ts'),s=await import('/src/services/workSessionTransfer.ts');const fingerprint=await s.portableSessionFingerprint(bundle),entry=p.materializeWorkSession(bundle,root,'imported');const first=s.importWorkSessionRecord(localStorage,entry,fingerprint),second=s.importWorkSessionRecord(localStorage,{...entry,id:'again'},fingerprint);return {first,second,raw:localStorage.getItem((await import('/src/utils/workSessions.ts')).workSessionKey(root))}},bundle,fixture.target)
  assert.equal(imported.first.duplicate,false);assert.equal(imported.second.duplicate,true);assert.equal(JSON.parse(imported.raw).length,1);assert.ok(!imported.raw.includes('PRIVATE'));checks.push('real-webview-storage-import-is-idempotent')
  assert.deepEqual(await Promise.all(files.map(digest)),before);checks.push('metadata-actions-preserve-document-bytes')
 }
 assert.deepEqual(await Promise.all(files.map(digest)),before);report.status='passed';validateNativeSessionReport(report,phase)
}catch(error){report.status='failed';report.error={message:String(error),stack:error?.stack};throw error}
finally{for(const socket of sockets)socket.close();await fs.writeFile(path.join(output,phase+'.json'),JSON.stringify(report,null,2)+'\n')}
