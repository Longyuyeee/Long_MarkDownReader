import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {expandCopySourceParents} from './installed-v1-1-21-workflow.mjs'
import {fileHistoryChecks,validateInstalledFileHistory,assertFileHistoryOutputBytes} from './installed-v1-1-22-evidence.mjs'
const q=JSON.stringify,key=v=>String(v||'').replaceAll('\\','/').replace('//?/','').toLowerCase(),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
export async function runInstalledV1122Workflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,restart=false}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.ok(['1.1.22','1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const reportFile=path.join(output,'installed-v1122-workflow.json'),ui=nativeUserInput({send,evaluate},{timeoutMs:60000}),store=`document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('app')`,invoke=(c,a={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${q(c)},${q(a)})`)
 const report=restart?JSON.parse(await fs.readFile(reportFile,'utf8')):{appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-file-operation-history-native-input-and-process-restart',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],outputs:[],fixture:path.join(library,'000-v1122-history-'+crypto.randomUUID())}
 assert.equal(report.sourceCommit,sourceCommit);assert.equal(report.executableSha256,sha(await fs.readFile(installedExecutable)))
 const p=name=>path.join(report.fixture,name),mark=n=>report.checks.push({id:fileHistoryChecks[n],status:'passed'}),row=file=>`[...document.querySelectorAll('[data-drop-path]')].find(e=>window.__v1122Key(e.dataset.dropPath)===${q(key(file))})`
 const expand=file=>expandCopySourceParents({ui,evaluate,library,file,row}),context=async(file,text)=>{await expand(file);await ui.clickTarget(row(file),'right');if(text==='最近操作…')await ui.hoverTarget(`[...document.querySelectorAll('.n-dropdown-option-body')].find(e=>e.textContent.trim()==='更多操作')`);await ui.clickText('.n-dropdown-option-body',text)},records=()=>invoke('list_library_file_operations',{libraryRoot:library})
 const history=async(file,id)=>{await context(file,'最近操作…');await ui.waitFor('!!document.querySelector(".history-item")','history records');if(id)await ui.click(`[data-operation-id="${id}"]`)},close=async()=>{await ui.click('.file-history-dialog .n-base-close');await ui.waitFor('!document.querySelector(".file-history-dialog")','history closed')}
 const restore=async id=>{await ui.click(`[data-operation-id="${id}"]`);await ui.clickText('.file-history-dialog button','还原此项');await ui.waitFor(`document.querySelector('[data-operation-id="${id}"]')?.textContent.includes('已还原')`,'restored row receipt')}
 const take=async(file,fileName)=>{const bytes=await fs.readFile(file);await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});report.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
 let failure
 try{
  await navigate('#/library','.library-mode','file operation history workspace')
  await evaluate(`window.__v1122Key=${key.toString()};window.__v1122Trace=[];window.__v1122Errors=[];for(const type of ['click','pointerdown','keydown','input'])document.addEventListener(type,e=>window.__v1122Trace.push({type,trusted:e.isTrusted}),true);window.addEventListener('error',e=>window.__v1122Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v1122Errors.push(String(e.reason)));`)
  await ui.fill('.search-control-row input','')
  if(!restart){
   await evaluate(`window.__v1122Prior=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}))`)
   await fs.mkdir(report.fixture,{recursive:false});await fs.writeFile(p('草稿.md'),'# 已保存的正文\r\n');await fs.writeFile(p('整理.txt'),'整理前的内容\r\n')
   // Re-enter through ordinary settings so externally seeded fixture files are in a fresh tree scan.
   await navigate('#/settings?category=library','.add-library-form','return through ordinary settings without changing or saving drafts')
   await navigate('#/library?path='+encodeURIComponent(p('草稿.md')),'#vditor-lib','source draft editor')
   const editor=`[...document.querySelectorAll('#vditor-lib [contenteditable="true"]')].find(e=>e.getClientRects().length)`
   await ui.waitFor(`(${editor})?.textContent.includes('已保存的正文')`,'actual Markdown ready');await ui.clickTarget(editor);await ui.key('a','KeyA',65,2);await ui.key('Backspace','Backspace',8);await send('Input.insertText',{text:'需要保留的整理草稿'})
   await ui.waitFor(`${store}.tabs.some(t=>window.__v1122Key(t.path)===${q(key(p('草稿.md')))}&&t.isDirty&&t.content.includes('需要保留的整理草稿'))`,'dirty source')
   // Two ordinary moves produce independent records; no internal component methods.
   for(const name of ['草稿.md','整理.txt']){
    await context(p(name),'移动到…');await ui.fill('.file-operation-dialog input[aria-label="目标文件夹"]',path.relative(library,p('归档')).replaceAll('\\','/'));await ui.clickText('.file-operation-dialog button','移动');await ui.waitFor('!document.querySelector(".file-operation-dialog")','move completed')
   }
   let entries=await records();report.draftMoveId=entries.find(r=>key(r.oldPath)===key(p('草稿.md'))).id;report.textMoveId=entries.find(r=>key(r.oldPath)===key(p('整理.txt'))).id
   await history(p('归档/整理.txt'),report.draftMoveId);await ui.fill('.file-history-dialog input[aria-label="查找操作记录"]',p('草稿.md'));assert.equal(await evaluate('document.querySelectorAll(".history-item").length'),1);mark(0);await ui.fill('.file-history-dialog input[aria-label="查找操作记录"]','')
   assert.equal(key(await invoke('locate_library_file_operation',{libraryRoot:library,operationId:report.draftMoveId})),key(p('归档/草稿.md')))
   await restore(report.draftMoveId);report.draftPreserved=await evaluate(`${store}.tabs.some(t=>window.__v1122Key(t.path)===${q(key(p('草稿.md')))}&&t.isDirty&&t.content.includes('需要保留的整理草稿'))`);assert.equal(report.draftPreserved,true);assert.equal(await fs.readFile(p('草稿.md'),'utf8'),'# 已保存的正文\r\n');assert.equal(await fs.readFile(p('归档/整理.txt'),'utf8'),'整理前的内容\r\n');mark(1);await close()
   await expand(p('归档/整理.txt'));await ui.clickTarget(row(p('归档/整理.txt')),'right');await ui.clickText('.n-dropdown-option-body','重命名 (F2)');await ui.fill('#library-rename-input input, input#library-rename-input','重命名.txt');await ui.clickText('.n-dialog button','更新名称');await ui.waitFor('!document.querySelector(".rename-editor")','rename completed');entries=await records();report.renameId=entries.find(r=>key(r.newPath)===key(p('归档/重命名.txt'))).id;assert.equal(entries.find(r=>r.id===report.renameId).action,'rename');mark(2)
   await fs.writeFile(p('归档/重命名.txt'),'后来写入的内容\r\n');await history(p('归档/重命名.txt'),report.renameId);await ui.clickText('.file-history-dialog button','还原此项');await ui.waitFor('document.querySelector(".history-error")?.textContent.includes("后续修改")','later edits protected');assert.equal(await fs.readFile(p('归档/重命名.txt'),'utf8'),'后来写入的内容\r\n');report.laterEditPreserved=true;await take(p('归档/重命名.txt'),'installed-v1122-later-edit.txt');mark(3);await close()
   // Reset only the owned disk fixture after proving the refused restore.
   await fs.writeFile(p('归档/重命名.txt'),'整理前的内容\r\n')
   await context(p('归档/重命名.txt'),'创建副本');await ui.waitFor('document.body.innerText.includes("已创建 1 个副本")','duplicate result');entries=await records();report.copyId=entries.find(r=>r.action==='copy'&&key(r.oldPath)===key(p('归档/重命名.txt'))).id
   await history(p('归档/重命名.txt'),report.copyId);report.copyViewOnly=await evaluate('![...document.querySelectorAll(".file-history-dialog button")].some(b=>b.textContent.includes("还原此项"))');assert.equal(report.copyViewOnly,true);mark(4)
   report.otherDraftsPreserved=await evaluate(`window.__v1122Prior.every(prior=>${store}.tabs.some(t=>t.id===prior.id&&t.path===prior.path&&t.isDirty&&t.content===prior.content))`);assert.equal(report.otherDraftsPreserved,true);assert.equal((await records()).find(r=>r.id===report.textMoveId).status,'completed');mark(5)
   const before=sha(await fs.readFile(p('归档/重命名.txt')));await ui.fill('.file-history-dialog input[aria-label="查找操作记录"]','重命名');await ui.click('.file-history-dialog button[aria-label="刷新操作记录"]');await ui.waitFor('document.querySelectorAll(".history-item").length>=2','queried histories');report.queryReadOnly=before===sha(await fs.readFile(p('归档/重命名.txt')));assert.equal(report.queryReadOnly,true);mark(6);await capture('installed-v1122-history-before-restart.jpg');await close()
   await navigate('#/library?path='+encodeURIComponent(p('草稿.md')),'#vditor-lib','explicit draft cleanup save');await ui.clickTarget(editor);await ui.key('s','KeyS',83,2);await ui.waitFor(`${store}.tabs.some(t=>window.__v1122Key(t.path)===${q(key(p('草稿.md')))}&&!t.isDirty)`,'ordinary explicit save');await take(p('草稿.md'),'installed-v1122-draft.md');report.status='prepared'
  }else{
   assert.equal(report.status,'prepared');const entries=await records();for(const id of [report.textMoveId,report.renameId,report.copyId])assert.ok(entries.some(r=>r.id===id&&r.status==='completed'))
   await history(p('归档/重命名.txt'),report.renameId);report.restartExact=true;mark(7);await restore(report.renameId);await restore(report.textMoveId);assert.equal(await fs.readFile(p('整理.txt'),'utf8'),'整理前的内容\r\n');assert.equal(await fs.stat(p('归档/重命名.txt')).then(()=>true,()=>false),false);report.restoreExact=true;await ui.click(`[data-operation-id="${report.textMoveId}"]`);report.noRepeat=await evaluate('![...document.querySelectorAll(".file-history-dialog button")].some(b=>b.textContent.includes("还原此项"))');assert.equal(report.noRepeat,true);mark(8);await take(p('整理.txt'),'installed-v1122-restored.txt');await capture('installed-v1122-history-after-restart.jpg')
   assert.equal(key(await invoke('locate_library_file_operation',{libraryRoot:library,operationId:report.textMoveId})),key(p('整理.txt')))
   report.processRestart={executableSha256:sha(await fs.readFile(installedExecutable)),nativeVersion:await invoke('plugin:app|version'),evidenceLevel:'same-installed-image-relaunched-by-owned-lifecycle'};mark(9);report.status='passed';await close()
  }
  report.inputTrace=[...(report.inputTrace||[]),...await evaluate('window.__v1122Trace')];report.runtimeErrors=[...(report.runtimeErrors||[]),...await evaluate('window.__v1122Errors')];report.errorOverlay=await evaluate('!!document.querySelector(".error-overlay")')
  if(restart){validateInstalledFileHistory(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});const outputs=new Map(await Promise.all(report.outputs.map(async r=>[r.fileName,await fs.readFile(path.join(output,r.fileName))])));assertFileHistoryOutputBytes(report,name=>outputs.get(name))}
 }catch(error){failure=error;report.status='failed';report.failure=String(error.stack||error);report.failureUI=await evaluate('({hash:location.hash,body:document.body.innerText.slice(-7000)})').catch(()=>null);await capture('installed-v1122-failure.jpg').catch(()=>{})}
 finally{await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n')}
 if(failure)throw failure
}
