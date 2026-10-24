import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {withDeadline} from './with-deadline.mjs'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {visibleMarkdownInput} from './visible-markdown-input.mjs'
import {observedNativeCommand} from './observed-native-command.mjs'
import {tagCollectionChecks,validateInstalledTagCollections} from './installed-v1-1-10-evidence.mjs'
const q=JSON.stringify,hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
async function secondary(predicate){
 let target;for(let n=0;n<200;n++){const targets=await fetch('http://127.0.0.1:9343/json/list').then(r=>r.json());target=targets.find(t=>t.webSocketDebuggerUrl&&predicate(t));if(target)break;await new Promise(resolve=>setTimeout(resolve,100))}assert.ok(target,'actual secondary WebView exists')
 const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let seq=0
 await withDeadline(()=>new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})}),10000,'secondary connection')
 socket.addEventListener('message',event=>{const response=JSON.parse(event.data),task=pending.get(response.id);if(!task)return;pending.delete(response.id);response.error?task.reject(Error(response.error.message)):task.resolve(response.result)})
 const send=(method,params)=>withDeadline(()=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))}),30000,method)
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
 return {send,evaluate,close:()=>socket.close()}
}
export async function runInstalledV1110Workflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(process.env.LONGEDIT_R5I_DISPOSABLE,'1');assert.ok(['1.1.10','1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const report={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:hash(await fs.readFile(installedExecutable)),evidenceLevel:'installed-webview-input-native-tag-ipc-and-disk',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,status:'running',checks:[],inputTrace:[],runtimeErrors:[],denials:[]}
 const ui=nativeUserInput({send,evaluate},{timeoutMs:60000}),check=n=>report.checks.push({id:tagCollectionChecks[n],status:'passed'})
 const mainEditor=visibleMarkdownInput('#vditor-lib'),otherEditor=visibleMarkdownInput('#vditor')
 const invoke=(command,args={})=>observedNativeCommand(evaluate,command,args)
 const folder=path.join(library,'v1110-tags-'+crypto.randomUUID()),relative=path.basename(folder),files=Array.from({length:244},(_,n)=>path.join(folder,`标签笔记${String(n).padStart(3,'0')}.md`)),oldTag='验收一零',newTag='验收一新',name='本版标签集合验收'
 let failure,external
 try{
  await navigate('#/library','.library-mode','tag collection workspace')
  // All predecessor drafts are explicitly saved through actual input, not cleared.
  for(let n=0;n<64;n++){const label=await evaluate(`document.querySelector('.workspace-tab[aria-label*="有未保存的修改"]')?.getAttribute('aria-label')`);if(!label)break;await ui.clickTarget(`[...document.querySelectorAll('.workspace-tab')].find(e=>e.getAttribute('aria-label')===${q(label)})`);await ui.clickText('button','保存');await ui.waitFor(`!document.querySelector('.workspace-tab.active[aria-label*="有未保存的修改"]')`,'predecessor explicit save')}
  assert.equal(await invoke('plugin:app|version'),appVersion);check(0)
  await fs.mkdir(folder,{recursive:false});await fs.writeFile(path.join(folder,'.v1110-owned'),crypto.randomUUID(),{flag:'wx'})
  const yesterday=new Date(Date.now()-86400000)
  for(const file of files){await fs.writeFile(file,`# 项目预算\n\n预算 #${oldTag} #进行中\n\n项目预算明细\n`,{flag:'wx'});await fs.utimes(file,yesterday,yesterday)}await fs.utimes(files[243],new Date(),new Date())
  report.sourceFiles=await Promise.all(files.map(async file=>({path:file,before:hash(await fs.readFile(file))})))
  await evaluate(`window.__v1110Trace=[];window.__v1110Errors=[];for(const type of ['click','keydown','input'])addEventListener(type,e=>window.__v1110Trace.push({type,trusted:e.isTrusted}),true);addEventListener('error',e=>window.__v1110Errors.push(e.message));addEventListener('unhandledrejection',e=>window.__v1110Errors.push(String(e.reason)))`)
  await ui.click('#tab-collections');if(await evaluate(`!!document.querySelector('.smart-collection [aria-label="我的集合"]')`))await ui.click('.smart-collection [aria-label="我的集合"]')
  await ui.clickText('.smart-collection button','新建集合');await ui.fill('.collection-form label:first-child input',name);await ui.click('.collection-range summary');await ui.fill('.collection-form input[aria-label="文件夹"]',relative);await ui.fill('.collection-form input[aria-label="笔记标签"]',oldTag);await ui.clickText('.collection-form button','保存集合')
  await ui.waitFor(`document.querySelectorAll('.collection-result').length===40&&!document.querySelector('.result-waiting')`,'first native 40 file groups')
  for(let n=0;n<10&&await evaluate(`!![...document.querySelectorAll('.smart-collection button')].find(e=>e.textContent.trim()==='加载更多文件')`);n++){await ui.clickText('.smart-collection button','加载更多文件');await ui.waitFor(`!document.querySelector('.result-waiting')`,'next native page')}
  report.collectionFiles=await evaluate(`document.querySelectorAll('.collection-result').length`);report.uniqueFiles=await evaluate(`new Set([...document.querySelectorAll('.collection-result .result-open strong')].map(e=>e.textContent)).size`);assert.equal(report.collectionFiles,244);check(1)
  await ui.click('select[aria-label="集合结果排序"]');await ui.key('Home','Home',36);await ui.key('ArrowDown','ArrowDown',40);await ui.key('ArrowDown','ArrowDown',40);await ui.key('Enter','Enter',13)
  await ui.waitFor(`document.querySelector('.collection-result strong')?.textContent==='标签笔记243.md'&&!document.querySelector('.result-waiting')`,'full query modified order');report.modifiedFirst=await evaluate(`document.querySelector('.collection-result strong').textContent`);check(2)
  const offline=folder+'-offline';assert.equal(path.dirname(folder),library);assert.equal(path.dirname(offline),library);await fs.access(path.join(folder,'.v1110-owned'));await fs.rename(folder,offline)
  try{await ui.clickText('.result-actions button','刷新');await ui.waitFor(`!!document.querySelector('.results [role=alert]')`,'real missing-directory error');report.refreshRetainedFiles=await evaluate(`document.querySelectorAll('.collection-result').length`);assert.equal(report.refreshRetainedFiles,40);await capture('installed-v1110-refresh.jpg')}finally{await fs.rename(offline,folder)}
  await ui.clickText('.results button','重新查找');await ui.waitFor(`!document.querySelector('.results [role=alert]')&&!document.querySelector('.result-waiting')&&document.querySelectorAll('.collection-result').length===40`,'real directory recovery');check(3)
  await ui.clickText('.result-actions button','调整条件');await ui.fill('.collection-form label:nth-child(2) input','这是尚未提交的条件');await ui.click('#tab-files');await ui.click('#tab-collections');assert.equal(await evaluate(`document.querySelector('.collection-form label:nth-child(2) input')?.value`),'这是尚未提交的条件');await ui.fill('.collection-form label:nth-child(2) input','');await ui.clickText('.collection-form button','查看资料');check(4)
  await ui.click('#tab-tags');await ui.clickTarget(`[...document.querySelectorAll('.tag-item')].find(e=>e.querySelector('strong')?.textContent===${q(oldTag)})`);await ui.waitFor(`document.querySelectorAll('.tag-note').length===40`,'native tag file page')
  let cursor=null,tagFiles=[];for(let n=0;n<100;n++){const frame=await invoke('search_collection_page',{request:{libraryRoot:library,query:'',objectTypes:['markdown'],filters:{directory:relative,tag:oldTag,modifiedWithinDays:null},sort:'name',pageSize:40,cursor}});tagFiles.push(...frame.files);cursor=frame.nextCursor;if(!cursor)break}report.tagFiles=tagFiles.length
  cursor=null;let catalog;for(let n=0;n<100;n++){catalog=await invoke('get_tag_catalog_page',{request:{libraryRoot:library,cursor}});cursor=catalog.nextCursor;if(!cursor)break}assert.equal(catalog.scanComplete,true);report.tagCount=catalog.tags.find(tag=>tag.tag===oldTag)?.count;assert.equal(report.tagCount,244);assert.equal(report.tagFiles,244);check(5)
  await ui.clickTarget(`[...document.querySelectorAll('.tag-note')].find(e=>e.querySelector('strong')?.textContent==='标签笔记000.md')`);await ui.waitFor(`(${mainEditor})?.textContent.includes(${q(oldTag)})`,'actual Markdown loaded in current mode')
  report.editorModes={main:await evaluate(`${store}.editorMode`)}
  await ui.clickTarget(mainEditor);await ui.key('End','End',35,2);await send('Input.insertText',{text:'\n用户未保存的标签整理草稿'})
  await ui.waitFor(`${store}.tabs.some(t=>t.path.toLowerCase().endsWith('标签笔记000.md')&&t.isDirty)`,'actual dirty editor')
  const before=await fs.readFile(files[0]);report.dirtyDiskBefore=hash(before);await evaluate(`window.__v1110Draft=${store}.tabs.find(t=>t.path.toLowerCase().endsWith('标签笔记000.md'));window.__v1110DraftText=window.__v1110Draft.content`)
  await ui.clickText('.inline-tags button','选择笔记整理标签');for(let n=0;n<3;n++)await ui.click(`input[aria-label="选择 标签笔记00${n}.md"]`);await ui.clickText('.inline-tags button','整理 3 份笔记');await ui.fill('.tag-edit-dialog input[aria-label="新的标签名称"]',newTag);await ui.clickText('.tag-edit-dialog button','预览影响')
  await ui.waitFor(`document.querySelectorAll('.tag-edit-row').length===3&&[...document.querySelectorAll('.tag-edit-state')].some(e=>e.textContent==='已排除')`,'dirty excluded from actual native preview');report.dirtyExcluded=true;assert.deepEqual(await fs.readFile(files[0]),before);await capture('installed-v1110-preview.jpg');check(6)
  const originalOne=await fs.readFile(files[1],'utf8'),externalBody='外部更新，必须保留，不允许被旧预览覆盖\n';await fs.writeFile(files[2],externalBody)
  await ui.clickText('.tag-edit-dialog button','确认修改 2 份文件');await ui.waitFor(`!![...document.querySelectorAll('.tag-edit-dialog button')].find(e=>e.textContent.trim()==='关闭结果')`,'partial native outcomes')
  report.partialOutcomes=await evaluate(`Array.from(document.querySelectorAll('.tag-edit-state')).map(e=>({'已完成':'completed','未执行':'notExecuted','需核对':'needsReview'})[e.textContent])`)
  assert.ok((await fs.readFile(files[1],'utf8')).includes('#'+newTag));report.externalChangedPreserved=(await fs.readFile(files[2],'utf8'))===externalBody
  const history=await invoke('list_history',{libraryRoot:library,path:files[1]});report.originalHistoryPreserved=history.some(([,body])=>body===originalOne)
  report.originalHistory={path:files[1],before:hash(Buffer.from(originalOne)),snapshot:hash(Buffer.from(history.find(([,body])=>body===originalOne)?.[1]||''))}
  report.externalChange={path:files[2],expected:hash(Buffer.from(externalBody)),after:hash(await fs.readFile(files[2]))}
  report.dirtyPreserved=await evaluate(`${store}.tabs.find(t=>t.path===window.__v1110Draft.path)===window.__v1110Draft&&window.__v1110Draft.isDirty&&window.__v1110Draft.content===window.__v1110DraftText`);assert.deepEqual(await fs.readFile(files[0]),before);check(7)
  report.collectionTagUnchanged=await evaluate(`${store}.savedSearches.find(s=>s.name===${q(name)}).filters.tag===${q(oldTag)}`);await capture('installed-v1110-partial.jpg');await ui.clickText('.tag-edit-dialog button','关闭结果');check(8)
  await invoke('open_quick_note');const quick=await secondary(target=>target.url.includes('quick-note'))
  try{await nativeUserInput(quick,{timeoutMs:60000}).waitFor(`!!window.__TAURI_INTERNALS__?.invoke`,'secondary native bridge');for(const [command,args]of [['search_collection_page',{request:{libraryRoot:library,query:'',objectTypes:[],filters:{directory:'',tag:'',modifiedWithinDays:null},sort:'name',pageSize:40,cursor:null}}],['get_tag_catalog_page',{request:{libraryRoot:library,cursor:null}}],['preview_tag_edit',{request:{libraryRoot:library,operation:{kind:'remove',tag:oldTag},paths:[files[3]],excludedPaths:[]}}],['apply_tag_edit',{request:{planId:'invalid',selected:[0],confirmed:true}}],['close_tag_edit',{planId:'invalid'}]]){const result=await quick.evaluate(`(async()=>{try{await window.__TAURI_INTERNALS__.invoke(${q(command)},${q(args)});return {rejected:false}}catch(e){return {rejected:true,error:e?.message??String(e),nativeError:e}}})()`);report.denials.push({command,...result})}}finally{quick.close()}check(9)
  await invoke('open_external_file_window',{path:files[3]});external=await secondary(target=>target.url.includes('external=1')&&decodeURIComponent(target.url).includes('标签笔记003.md'))
  const other=nativeUserInput(external,{timeoutMs:60000});await other.waitFor(`(${otherEditor})?.textContent.includes(${q(oldTag)})`,'secondary Markdown loaded in current mode');report.editorModes.secondary=await external.evaluate(`${store}.editorMode`)
  await external.evaluate(`window.__v1110OtherTrace=[];for(const type of ['click','keydown','input'])addEventListener(type,e=>window.__v1110OtherTrace.push({type,trusted:e.isTrusted}),true)`)
  const preview=()=>invoke('preview_tag_edit',{request:{libraryRoot:library,operation:{kind:'rename',from:oldTag,to:newTag},paths:[files[3]],excludedPaths:[]}})
  let plan=await preview();await other.clickTarget(otherEditor);await other.key('End','End',35,2);await external.send('Input.insertText',{text:'\n第二窗口仍在写的草稿'})
  await other.waitFor(`${store}.isTempDirty===true`,'actual secondary dirty state')
  const secondaryBefore=hash(await fs.readFile(files[3]));let blockError
  await assert.rejects(()=>invoke('apply_tag_edit',{request:{planId:plan.planId,selected:[0],confirmed:true}}),error=>{blockError=error;return /未保存/.test(error.message)&&error.message.includes(path.basename(files[3]))});report.secondaryDirtyBlocked=true
  report.secondaryBlock={path:files[3],before:secondaryBefore,after:hash(await fs.readFile(files[3])),error:blockError.message,nativeError:blockError.nativeError};assert.equal(report.secondaryBlock.before,report.secondaryBlock.after)
  assert.ok(!(await fs.readFile(files[3],'utf8')).includes('第二窗口仍在写'));await other.clickText('button','保存');await other.waitFor(`${store}.isTempDirty===false`,'explicit secondary save');assert.ok((await fs.readFile(files[3],'utf8')).includes('第二窗口仍在写'))
  await invoke('close_tag_edit',{planId:plan.planId});plan=await preview();await invoke('apply_tag_edit',{request:{planId:plan.planId,selected:[0],confirmed:true}});check(10)
  await other.waitFor(`(${otherEditor})?.textContent.includes(${q(newTag)})`,'clean secondary content-only reload');report.secondaryContentReloaded=true;await invoke('close_tag_edit',{planId:plan.planId});check(11)
  assert.equal(await evaluate(`window.__v1110Draft.isDirty&&window.__v1110Draft.content===window.__v1110DraftText`),true);report.dirtyDiskBeforeFinalSave=hash(await fs.readFile(files[0]));await ui.clickTarget(`[...document.querySelectorAll('.workspace-tab')].find(e=>e.textContent.includes('标签笔记000'))`);await ui.clickText('button','保存');await ui.waitFor(`window.__v1110Draft.isDirty===false`,'explicit final dirty save');assert.ok((await fs.readFile(files[0],'utf8')).includes('用户未保存的标签整理草稿'));report.explicitSaveAfterChecks=true
  report.explicitSavedSha256=hash(await fs.readFile(files[0]));report.secondaryInputTrace=await external.evaluate('window.__v1110OtherTrace')
  assert.equal(await evaluate(`${store}.editorMode`),report.editorModes.main);assert.equal(await external.evaluate(`${store}.editorMode`),report.editorModes.secondary)
  for(const file of report.sourceFiles)file.after=hash(await fs.readFile(file.path))
  report.inputTrace=await evaluate('window.__v1110Trace');report.runtimeErrors=await evaluate('window.__v1110Errors');report.errorOverlay=await evaluate(`!!document.querySelector('.app-error-overlay,.global-error-overlay,#app-startup-error')`);await capture('installed-v1110-final.jpg');check(12)
  report.status='passed';validateInstalledTagCollections(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]})
 }catch(error){failure=error;report.status='failed';report.error={message:String(error),stack:error.stack};await capture('installed-v1110-failure.jpg').catch(()=>{})}
 finally{external?.close();await fs.writeFile(path.join(output,'installed-v1110-workflow.json'),JSON.stringify(report,null,2)+'\n')}
 if(failure)throw failure
}
