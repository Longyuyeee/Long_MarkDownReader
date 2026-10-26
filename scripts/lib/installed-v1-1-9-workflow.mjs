import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn} from 'node:child_process'
import {withDeadline} from './with-deadline.mjs'
import {assertSessionHosted} from './v119-native-session-fixture.mjs'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {workSessionChecks,validateInstalledWorkSession} from './installed-v1-1-9-evidence.mjs'
import {installedSessionBootProbe,installedSessionBridgeProbe} from './installed-session-boot.mjs'
const q=JSON.stringify,key=value=>value.replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase()
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
export async function runInstalledV119Workflow({send,evaluate,navigate,waitFor,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,repoRoot}){
 assertSessionHosted();assert.equal(process.env.LONGEDIT_R5I_DISPOSABLE,'1');assert.ok(['1.1.9','1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const report={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),evidenceLevel:'installed-webview-input-native-picker-and-disk',sourceUserContentIncluded:false,nativeBridgeMocked:false,desktopInputUsed:false,nativePickerScope:'disposable-github-hosted-owned-process',status:'running',checks:[],inputTrace:[],nativePickers:[],draftChecks:[],quickDenials:[],sourceFiles:[],runtimeErrors:[]}
 const ui=nativeUserInput({send,evaluate},{timeoutMs:60000}),check=n=>report.checks.push({id:workSessionChecks[n],status:'passed'})
 const store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`,bar='.work-session-bar',modal='.session-transfer-dialog'
 const button=(scope,label)=>`[...document.querySelectorAll(${q(scope+' button')})].find(e=>e.textContent.trim()===${q(label)})`
 const invoke=(command,args={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${q(command)},${q(args)})`)
 const root=path.join(library,'v119-session-'+crypto.randomUUID()),relative=path.basename(root),paths=Array.from({length:40},(_,n)=>path.join(root,`阅读${String(n).padStart(2,'0')}.txt`)),draft=path.join(root,'草稿.md'),repair=path.join(root,'重新找到.txt'),exportPath=path.join(root,'已导出.longedit-session.json'),source=path.join(root,'接续.longedit-session.json'),bad=path.join(root,'损坏.longedit-session.json')
 let failure, reloadDiagnostic
 const pick=async(title,file,action)=>{
  const fileReport=path.join(output,`v119-picker-${report.nativePickers.length}.json`),child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'scripts','select-hosted-session-file.ps1'),'-Executable',installedExecutable,'-Title',title,'-SelectedPath',file,'-OwnerRoot',root,'-Report',fileReport],{windowsHide:true,stdio:'inherit'})
  const completed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Real native file selection failed: '+code)))})
  // Attach a rejection handler before triggering a potentially blocking dialog.
  completed.catch(()=>{})
  try{await action();await withDeadline(()=>completed,60000,'owned native file dialog');report.nativePickers.push(JSON.parse(await fs.readFile(fileReport,'utf8')))}finally{if(child.exitCode===null&&child.signalCode===null)child.kill()}
 }
 const menu=async label=>{await ui.clickText(bar+' button','管理现场');await ui.clickText('.n-dropdown-option-body__label',label)}
 const chooseScene=async name=>{await ui.click('#work-session-choice');await ui.key('Home','Home',36);const count=await evaluate(`Array.from(document.querySelector('#work-session-choice').options).findIndex(o=>o.textContent===${q(name)})`);assert.ok(count>=0);for(let n=0;n<count;n++)await ui.key('ArrowDown','ArrowDown',40);await ui.key('Enter','Enter',13);assert.equal(await evaluate(`document.querySelector('#work-session-choice').selectedOptions[0].textContent`),name)}
 const goHome=()=>ui.clickText('.app-navigation a','工作台')
 const records=()=>evaluate(`JSON.parse(localStorage.getItem('longedit.work-sessions.v1:'+encodeURIComponent(${q(key(library))}))||'[]')`)
 const importScene=async()=>{await menu('导入工作现场…'); /* selection is started by the menu's native picker */ }
 const readScroll=()=>evaluate(`document.querySelector('.text-workspace .cm-scroller')?.scrollTop`)
 const assertDraft=async()=>{const observed=await evaluate(`(()=>{const s=${store},t=s.tabs.find(t=>t.path===window.__v119Draft.path);return {dirty:t?.isDirty,exactModel:t===window.__v119Draft,content:t?.content,active:s.activeTabId}})()`);assert.equal(observed.dirty,true);assert.equal(observed.exactModel,true);assert.equal(observed.active,await evaluate('window.__v119Draft.id'));assert.equal(sha(Buffer.from(observed.content)),report.draftSha256);assert.equal(sha(await fs.readFile(draft)),report.sourceFiles.find(f=>f.path===draft).before);report.draftChecks.push({dirty:true,exactModel:true,sha256:report.draftSha256})}
 try{
  await navigate('#/library','.library-mode','v119 initial installed workspace')
  // Complete predecessor edits explicitly by the actual Save button; never
  // clear a dirty flag to make this version's checks easier.
  for(let n=0;n<64;n++){
   const label=await evaluate(`document.querySelector('.workspace-tab[aria-label*="有未保存的修改"]')?.getAttribute('aria-label')`);if(!label)break
   await ui.clickTarget(`[...document.querySelectorAll('.workspace-tab')].find(e=>e.getAttribute('aria-label')===${q(label)})`);await ui.clickText('button','保存');await ui.waitFor(`!document.querySelector('.workspace-tab.active[aria-label*="有未保存的修改"]')`,'predecessor explicit save')
  }
  assert.equal(await invoke('plugin:app|version'),appVersion);assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(await evaluate(`typeof window.__TAURI_INTERNALS__.invoke`),'function');check(0)
  await fs.mkdir(root,{recursive:false});await fs.writeFile(path.join(root,'.v119-installed-owner'),crypto.randomUUID(),{flag:'wx'})
  for(const file of paths)await fs.writeFile(file,Array.from({length:600},(_,n)=>`第 ${n+1} 行：真实阅读位置，文件 ${path.basename(file)}。`).join('\n'),{flag:'wx'})
  await fs.writeFile(draft,'# 当前草稿\n\n这是原磁盘正文。\n',{flag:'wx'});await fs.writeFile(repair,'真实重新定位文件，不能写入导入的内容。\n',{flag:'wx'})
  report.sourceFiles=await Promise.all([...paths,draft,repair].map(async file=>({path:file,before:sha(await fs.readFile(file))})))
  const bundle={kind:'longedit-work-session',schemaVersion:1,name:'安装验收现场',savedAt:Date.now(),files:[...paths.map((file,n)=>({relativePath:relative+'/'+path.basename(file),...(n===0?{pinned:true}:{}),view:{scrollTop:340+n*3,scrollLeft:0}})),{relativePath:relative+'/缺失.txt'}],activePath:relative+'/'+path.basename(paths[0]),search:{query:'私人搜索词',types:['text'],scroll:40},reference:{relativePath:relative+'/'+path.basename(paths[1]),query:'私人参考词'}}
  await fs.writeFile(source,JSON.stringify(bundle),{flag:'wx'});await fs.writeFile(bad,JSON.stringify({...bundle,schemaVersion:999}),{flag:'wx'})
  await evaluate(`window.__v119Trace=[];window.__v119Errors=[];for(const type of ['click','keydown','input'])document.addEventListener(type,e=>window.__v119Trace.push({type,key:e.key||'',trusted:e.isTrusted}),true);addEventListener('error',e=>window.__v119Errors.push(e.message))`)
  await navigate('#/library?path='+encodeURIComponent(draft),'.library-mode','v119 draft document');await ui.waitFor(`document.querySelector('#vditor-lib .vditor-wysiwyg')?.textContent.includes('这是原磁盘正文')`,'actual Markdown draft loaded')
  await ui.fill('#vditor-lib .vditor-wysiwyg [contenteditable="true"]','我正在写客户交付，请不要自动保存或替换这份草稿。');await ui.waitFor(`${store}.tabs.some(t=>t.isDirty&&t.content?.includes('我正在写客户交付'))`,'trusted draft input')
  await evaluate(`window.__v119Draft=${store}.tabs.find(t=>t.isDirty&&t.content?.includes('我正在写客户交付'))`);report.draftSha256=sha(Buffer.from(await evaluate('window.__v119Draft.content')))
  await goHome();await pick('选择工作现场文件',source,importScene);await ui.waitFor(`document.querySelectorAll('${modal} .session-file-row').length===41&&!document.querySelector('${modal} .session-file-list[aria-busy="true"]')`,'real 40 ready and one missing preview');await capture('installed-v119-import.jpg')
  assert.match(await evaluate(`document.querySelector('${modal}').textContent`),/未找到文件/);await ui.clickTarget(button(modal,'导入并保存记录'));await ui.waitFor(`!document.querySelector('${modal}')`,'import stores only record');assert.equal((await records()).filter(item=>item.name==='安装验收现场').length,1);await assertDraft();check(1)
  await pick('选择工作现场文件',source,importScene);await ui.waitFor(`document.querySelector('${modal} .session-file-state.ready')`,'repeat preview');await ui.clickTarget(button(modal,'导入并保存记录'));await ui.waitFor(`!document.querySelector('${modal}')`,'repeat deduplicated');assert.equal((await records()).filter(item=>item.name==='安装验收现场').length,1);check(2)
  await chooseScene('安装验收现场');await ui.clickText(bar+' button','继续工作');await ui.waitFor(`document.querySelector('${modal}')?.textContent.includes('未找到文件')`,'partial restore preview');await ui.clickTarget(button(modal,'继续可用文件'));await ui.waitFor(`!document.querySelector('${modal}')`,'partial restore finished');await assertDraft();assert.equal((await records()).find(item=>item.name==='安装验收现场').tabs.length,41);check(3)
  await goHome();await chooseScene('安装验收现场');await ui.clickText(bar+' button','继续工作');await ui.waitFor(`document.querySelector('${modal}')?.textContent.includes('未找到文件')`,'repair preview')
  await pick('选择目标资料库内的文件',repair,()=>ui.click(`${modal} button[aria-label=${q('重新定位 '+relative+'/缺失.txt')}]`));await ui.waitFor(`document.querySelector('${modal}')?.textContent.includes('重新找到.txt')&&!document.querySelector('${modal} .session-file-list[aria-busy="true"]')`,'real inside relocation');await ui.clickTarget(button(modal,'继续可用文件'));await ui.waitFor(`!document.querySelector('${modal}')`,'repair applied');await assertDraft();assert.equal((await records()).find(item=>item.name==='安装验收现场').tabs.some(tab=>key(tab.path)===key(repair)),true);check(4)
  await goHome();await chooseScene('安装验收现场');await menu('导出所选现场…');assert.equal(await evaluate(`document.querySelector('${modal} input[type="checkbox"]').checked`),false)
  await pick('导出工作现场（请选择新文件）',exportPath,()=>ui.clickTarget(button(modal,'导出现场')));await ui.waitFor(`!document.querySelector('${modal}')`,'export new file');const exported=JSON.parse(await fs.readFile(exportPath,'utf8'));assert.equal(exported.search,undefined);assert.equal(exported.reference,undefined);assert.ok(!JSON.stringify(exported).includes('我正在写客户交付'));assert.ok(!JSON.stringify(exported).includes(library));check(5)
  const exportHash=sha(await fs.readFile(exportPath));await assert.rejects(()=>invoke('export_work_session_bundle',{targetPath:exportPath,bundle:exported}));assert.equal(sha(await fs.readFile(exportPath)),exportHash)
  const recordBefore=JSON.stringify(await records());await pick('选择工作现场文件',bad,importScene);await ui.waitFor(`document.querySelector('${bar} [role="status"]')?.textContent.includes('失败')`,'bad schema clearly rejected');assert.equal(JSON.stringify(await records()),recordBefore);check(6)
  // Preserve the draft until all scene mutation checks above have completed.
  // Now use explicit Save, then consume both ends of the 40-entry view queue.
  report.beforeExplicitSave=await Promise.all(report.sourceFiles.map(async file=>({path:file.path,sha256:sha(await fs.readFile(file.path))})))
  for(const file of report.sourceFiles)assert.equal(report.beforeExplicitSave.find(item=>item.path===file.path).sha256,file.before)
  await ui.clickText('.app-navigation a','资料库');await ui.clickTarget(`document.querySelector('[data-testid="library-explicit-save"]')`);await ui.waitFor(`!window.__v119Draft.isDirty`,'explicit save after protection evidence');await goHome();await chooseScene('安装验收现场');await ui.clickText(bar+' button','继续工作');await ui.waitFor(`!!document.querySelector('.text-workspace .cm-scroller')&&Math.abs(document.querySelector('.text-workspace .cm-scroller').scrollTop-340)<3`,'first staged position actually consumed');const first=await readScroll()
  await ui.clickTarget(`[...document.querySelectorAll('.workspace-tab')].find(e=>e.textContent.includes('阅读39'))`);await ui.waitFor(`document.querySelector('.text-workspace .document-title')?.textContent.includes('阅读39')&&Math.abs(document.querySelector('.text-workspace .cm-scroller')?.scrollTop-457)<3`,'last unopened staged position actually consumed');const last=await readScroll();report.positions={count:40,first,last};await capture('installed-v119-reading.jpg');check(7)
  report.inputTrace=await evaluate('window.__v119Trace');report.runtimeErrors=await evaluate('window.__v119Errors')
  reloadDiagnostic=await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__v119ReloadErrors=[];addEventListener('error',e=>window.__v119ReloadErrors.push(e.message));addEventListener('unhandledrejection',e=>window.__v119ReloadErrors.push(String(e.reason)))"})
  const origin=await evaluate('performance.timeOrigin');await send('Page.reload');let bootReady=false;for(let n=0;n<600;n++){try{if(await evaluate(installedSessionBootProbe(origin))){bootReady=true;break}}catch(error){if(!/context|navigat/i.test(String(error)))throw error}await new Promise(resolve=>setTimeout(resolve,100))}assert.equal(bootReady,true,'the reloaded Vue/Pinia and real reader must finish initialization')
  await ui.waitFor(`Math.abs(document.querySelector('.text-workspace .cm-scroller')?.scrollTop-457)<3`,'reading metadata survives WebView restart');report.positions.afterReload=await readScroll();assert.equal((await records()).find(item=>item.name==='安装验收现场').tabs.length,41);check(8)
  // Verify actual secondary WebView IPC instead of calling a Rust helper.
  await invoke('open_quick_note');let quick;for(let n=0;n<160;n++){const targets=await fetch('http://127.0.0.1:9343/json/list').then(r=>r.json());quick=targets.find(t=>t.url.includes('quick-note')&&t.webSocketDebuggerUrl);if(quick)break;await new Promise(resolve=>setTimeout(resolve,100))}assert.ok(quick)
  const socket=new WebSocket(quick.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});let seq=0
  const evaluateQuick=expression=>{const id=++seq;return withDeadline(()=>new Promise((resolve,reject)=>{const listener=event=>{const response=JSON.parse(event.data);if(response.id!==id)return;socket.removeEventListener('message',listener);if(response.error)reject(Error(response.error.message));else if(response.result.exceptionDetails)reject(Error(JSON.stringify(response.result.exceptionDetails)));else resolve(response.result.result?.value)};socket.addEventListener('message',listener);socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))}),30000,'actual secondary WebView evaluation')}
  try{
   report.quickBridgeReady=false
   for(let n=0;n<160;n++){if(await evaluateQuick(installedSessionBridgeProbe())){report.quickBridgeReady=true;break}await new Promise(resolve=>setTimeout(resolve,100))}
   assert.equal(report.quickBridgeReady,true,'the real secondary native bridge must initialize before testing permissions')
   for(const [command,args]of [['read_work_session_bundle',{sourcePath:source}],['export_work_session_bundle',{targetPath:path.join(root,'quick-must-not-write.longedit-session.json'),bundle:exported}],['preflight_work_session',{libraryRoot:library,relativePaths:[relative+'/草稿.md']}],['locate_work_session_file',{libraryRoot:library,path:repair}]]){
    const result=await evaluateQuick(`(async()=>{try{await window.__TAURI_INTERNALS__.invoke(${q(command)},${q(args)});return {rejected:false}}catch(e){return {rejected:true,error:String(e)}}})()`);report.quickDenials.push({command,...result});assert.equal(result.rejected,true);assert.match(result.error,/主工作台/)
   }
  }finally{socket.close()}
  assert.ok(report.quickDenials.every(item=>item.rejected));await assert.rejects(()=>fs.access(path.join(root,'quick-must-not-write.longedit-session.json')));check(9)
  // The Markdown source was explicitly saved, so compare it against the
  // protected pre-save checkpoints rather than misreporting it as unchanged.
  for(const file of report.sourceFiles)file.after=sha(await fs.readFile(file.path))
  report.explicitSave={path:draft,after:sha(await fs.readFile(draft)),afterAllDraftChecks:true};assert.match(await fs.readFile(draft,'utf8'),/我正在写客户交付/);check(10)
  const reloadErrors=await evaluate('window.__v119ReloadErrors');assert.ok(Array.isArray(reloadErrors));report.runtimeErrors.push(...reloadErrors)
  report.errorOverlay=await evaluate(`!!document.querySelector('.app-error-overlay,.global-error-overlay,#app-startup-error')`);await capture('installed-v119-final.jpg');check(11);report.status='passed';validateInstalledWorkSession(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]},{beforeProcessRestart:true})
 }catch(error){failure=error;report.status='failed';report.error={message:String(error),stack:error.stack};report.generatedFiles=await fs.readdir(root).catch(()=>[]);report.exportDiscoveries=[];for(const folder of [root,repoRoot,path.dirname(installedExecutable),path.join(process.env.USERPROFILE||root,'Documents')]){const names=await fs.readdir(folder).catch(()=>[]);report.exportDiscoveries.push(...names.filter(name=>name.endsWith('.longedit-session.json')).map(name=>path.join(folder,name)))};await capture('installed-v119-failure.jpg').catch(()=>{})}
 finally{if(reloadDiagnostic?.identifier)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:reloadDiagnostic.identifier}).catch(()=>{});await fs.writeFile(path.join(output,'installed-v119-workflow.json'),JSON.stringify(report,null,2)+'\n')}
 if(failure)throw failure
}
