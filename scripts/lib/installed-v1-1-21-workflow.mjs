import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {crossCopyChecks,validateInstalledCrossCopy,assertCrossCopyOutputBytes} from './installed-v1-1-21-evidence.mjs'
const q=JSON.stringify,sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),key=value=>String(value||'').replaceAll('\\','/').replace('//?/','').toLowerCase()
export async function expandCopySourceParents({ui,evaluate,library,file,row}){
 const parents=[];let parent=path.dirname(file)
 while(key(parent)!==key(library)){assert.ok(key(parent).startsWith(key(library)+'/'));parents.unshift(parent);parent=path.dirname(parent)}
 await ui.click('#tab-files')
 for(const directory of parents){await ui.waitFor(`!!(${row(directory)})`,'actual parent folder');const switcher=`(${row(directory)}).querySelector('.n-tree-node-switcher')`;if(!await evaluate(`${switcher}?.classList.contains('n-tree-node-switcher--expanded')`))await ui.clickTarget(switcher)}
 await ui.waitFor(`!!(${row(file)})`,'real file tree target')
}
export async function runInstalledV1121Workflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,repoRoot}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.ok(['1.1.21','1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const ui=nativeUserInput({send,evaluate},{timeoutMs:45000}),folder=path.join(library,'000-v1121-copy-'+crypto.randomUUID()),targetRoot=path.join(folder,'目标资料库'),source=path.join(folder,'来源'),p=name=>path.join(source,name),destination=path.join(targetRoot,'接收'),label='本版复制目标 '+path.basename(folder).slice(-8)
 const store=`document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('app')`,invoke=(command,args={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${q(command)},${q(args)})`)
 const report={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-cross-library-copy-native-input-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],outputs:[]}
 const mark=n=>report.checks.push({id:crossCopyChecks[n],status:'passed'}),primary=name=>ui.clickText('.file-operation-dialog button',name)
 const row=file=>`[...document.querySelectorAll('[data-drop-path]')].find(e=>window.__v1121Key(e.dataset.dropPath)===${q(key(file))})`
 const textOf=selector=>evaluate(`document.querySelector(${q(selector)})?.innerText`)
 const take=async(file,fileName,relativePath)=>{const bytes=await fs.readFile(file);await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});report.outputs.push({fileName,relativePath,sizeBytes:bytes.length,sha256:sha(bytes)})}
 let originalLibraries,failure
 try{
  await navigate('#/library','.library-mode','cross-library copy workspace')
  // Register the owned target through ordinary settings; retain every older draft.
  await evaluate(`window.__v1121PriorDrafts=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}));window.__v1121Key=${key.toString()};window.__v1121Trace=[];window.__v1121Errors=[];for(const type of ['click','pointerdown','keydown','input'])document.addEventListener(type,e=>window.__v1121Trace.push({type,trusted:e.isTrusted}),true);window.addEventListener('error',e=>window.__v1121Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v1121Errors.push(String(e.reason)));`)
  await fs.mkdir(p('images/空目录'),{recursive:true});await fs.mkdir(p('images/.longedit'),{recursive:true});await fs.mkdir(p('notes'),{recursive:true});await fs.mkdir(destination,{recursive:true})
  const saved='\uFEFF# 已保存的方案\r\n![图片](images/a.png)\r\n[关联](notes/linked.md)\r\n',png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')
  await fs.writeFile(p('saved.md'),saved);await fs.writeFile(p('notes/linked.md'),'[返回](../saved.md)\r\n');await fs.writeFile(p('images/a.png'),png);await fs.writeFile(p('images/.longedit/private.json'),'private');await fs.writeFile(p('images/.misty_order.json'),'private order');await fs.writeFile(p('记录.txt'),'原始版本\r\n');await fs.writeFile(p('warning.md'),'![缺失](missing.png)\r\n');await fs.writeFile(p('unselected.txt'),'不要改动的文件\r\n');await fs.writeFile(path.join(destination,'saved.md'),'目标原有内容')
  // The library deliberately hides conventional attachment folders such as images.
  // Select an ordinary visible folder for the folder-management task.
  await fs.cp(p('images'),p('资料文件夹'),{recursive:true,force:false,errorOnExist:true})
  report.imageSha256=sha(png);report.unselectedBefore=sha(await fs.readFile(p('unselected.txt')))
  const config=await invoke('get_config');originalLibraries=config.libraries
  await navigate('#/settings?category=library','.add-library-form','register owned target without saving or reloading older drafts')
  await ui.fill('.add-library-form input[placeholder="库名称"]',label);await ui.fill('.add-library-form input[placeholder^="完整文件夹路径"]',targetRoot);await ui.clickText('.add-library-form button','添加库')
  await ui.waitFor(`${store}.libraries.some(l=>l.name===${q(label)})`,'target registered through actual settings')
  assert.equal(key((await invoke('get_config')).activeLibraryPath),key(library))
  await navigate('#/library?path='+encodeURIComponent(p('saved.md')),'#vditor-lib','source saved Markdown')
  const editor=`[...document.querySelectorAll('#vditor-lib [contenteditable="true"]')].find(e=>e.getClientRects().length)`
  await ui.waitFor(`(${editor})?.textContent.includes('已保存的方案')`,'actual source Markdown loaded')
  await ui.clickTarget(editor);await ui.key('a','KeyA',65,2);await ui.key('Backspace','Backspace',8);await send('Input.insertText',{text:'必须保留的未保存草稿'});await ui.waitFor(`${store}.tabs.some(t=>window.__v1121Key(t.path)===${q(key(p('saved.md')))}&&t.isDirty&&t.content.includes('必须保留的未保存草稿'))`,'real dirty source')
  await evaluate(`window.__v1121SourceTab=${store}.tabs.find(t=>window.__v1121Key(t.path)===${q(key(p('saved.md')))});window.__v1121Draft=window.__v1121SourceTab.content`)
  const draftExact=async()=>{const observed=await evaluate(`({same:${store}.tabs.includes(window.__v1121SourceTab),dirty:window.__v1121SourceTab.isDirty,content:window.__v1121SourceTab.content===window.__v1121Draft,root:window.__v1121Key(${store}.libraryPath)})`);assert.equal(observed.same,true);assert.equal(observed.dirty,true);assert.equal(observed.content,true);assert.equal(observed.root,key(library))}
  const openCopy=async(file,directory,second)=>{await expandCopySourceParents({ui,evaluate,library,file,row});await ui.clickTarget(row(file));if(second)await ui.clickTarget(row(second),'left',2);await ui.clickTarget(row(file),'right');await ui.clickText('.n-dropdown-option-body','复制到…');await ui.click('.file-operation-dialog .n-select');await ui.clickText('.n-base-select-option',label);await ui.fill('.file-operation-dialog input[aria-label="目标文件夹"]',directory);await ui.waitFor(`document.querySelector('.copy-preview')?.dataset.planId&&document.querySelector('.copy-preview')?.getAttribute('aria-busy')==='false'`,'automatic native copy preview')}
  await openCopy(p('saved.md'),'新目录/本周');assert.equal(await fs.stat(path.join(targetRoot,'新目录')).then(()=>true,()=>false),false);report.previewReadOnly=true;mark(0);await primary('取消')
  await openCopy(p('saved.md'),'接收');await ui.waitFor(`document.querySelector('.copy-items')?.textContent.includes('saved - 副本.md')`,'planned collision name');await capture('installed-v1121-preview.jpg');await primary('复制 1 项');await ui.waitFor(`document.querySelector('.copy-summary')?.textContent.includes('已复制 1 项')`,'real copy completion')
  const copied=path.join(destination,'saved - 副本.md');assert.equal(await fs.readFile(path.join(destination,'saved.md'),'utf8'),'目标原有内容');assert.equal(await fs.readFile(p('saved.md'),'utf8'),saved);await draftExact();report.sourceDraftExact=report.sourceOriginalExact=report.collisionExact=true;mark(1);mark(2)
  const copiedText=await fs.readFile(copied,'utf8'),links=[...copiedText.matchAll(/\]\(([^)]+)\)/g)].map(m=>path.resolve(path.dirname(copied),decodeURIComponent(m[1])));assert.equal(links.length,2);for(const file of links)assert.ok((await fs.stat(file)).isFile());assert.equal(sha(await fs.readFile(links.find(file=>file.endsWith('.png')))),report.imageSha256);report.dependenciesExact=true;mark(3)
  const planId=await evaluate(`document.querySelector('.copy-preview').dataset.planId`),before=await fs.readdir(destination);const receipt=await invoke('execute_cross_library_copy',{planId,acknowledgeWarnings:false});assert.equal(receipt.result.items.length,1);assert.deepEqual(await fs.readdir(destination),before);report.receiptRepeatExact=true
  report.copiedDocument='target/'+path.relative(targetRoot,copied).replaceAll('\\','/');await take(p('saved.md'),'installed-v1121-original.md','source/saved.md');await take(copied,'installed-v1121-copied.md',report.copiedDocument);for(const file of links)await take(file,file.endsWith('.png')?'installed-v1121-image.png':'installed-v1121-linked.md','target/'+path.relative(targetRoot,file).replaceAll('\\','/'));await take(path.join(destination,'saved.md'),'installed-v1121-collision.md','target/collision.md');await capture('installed-v1121-draft-preserved.jpg');await primary('关闭')
  await openCopy(p('资料文件夹'),'文件夹');await primary('复制 1 项');await ui.waitFor(`document.querySelector('.copy-summary')?.textContent.includes('已复制 1 项')`,'folder copied');const imageFolder=path.join(targetRoot,'文件夹/资料文件夹');assert.ok((await fs.stat(path.join(imageFolder,'空目录'))).isDirectory());assert.equal(await fs.stat(path.join(imageFolder,'.longedit')).then(()=>true,()=>false),false);assert.equal(await fs.stat(path.join(imageFolder,'.misty_order.json')).then(()=>true,()=>false),false);assert.equal(sha(await fs.readFile(path.join(imageFolder,'a.png'))),report.imageSha256);report.folderExact=true;mark(4);await primary('关闭')
  await openCopy(p('saved.md'),'retry',p('记录.txt'));await ui.waitFor(`Array.from(document.querySelectorAll('.file-operation-dialog button')).some(e=>e.textContent.trim()==='复制 2 项')`,'real two item selection');await fs.writeFile(p('记录.txt'),'外部程序修改后的新版本\r\n');await primary('复制 2 项');await ui.waitFor(`document.querySelector('.copy-items')?.textContent.includes('已改变')`,'changed source failure');assert.ok((await fs.stat(path.join(targetRoot,'retry/saved.md'))).isFile());assert.equal(await fs.stat(path.join(targetRoot,'retry/记录.txt')).then(()=>true,()=>false),false);report.partialExact=true;mark(5)
  await primary('重新核对未完成的 1 项');await ui.waitFor(`document.querySelector('.copy-preview')?.getAttribute('aria-busy')==='false'`,'failed item rechecked');await primary('复制 1 项');await ui.waitFor(`document.querySelector('.copy-summary')?.textContent.includes('已复制 2 项')`,'only remaining item copied');assert.equal(await fs.readFile(path.join(targetRoot,'retry/记录.txt'),'utf8'),'外部程序修改后的新版本\r\n');assert.equal((await fs.readdir(path.join(targetRoot,'retry'))).filter(name=>name.startsWith('saved')&&name.endsWith('.md')).length,1);report.retryExact=true;mark(6);await take(path.join(targetRoot,'retry/记录.txt'),'installed-v1121-retry.txt','target/retry/记录.txt');await primary('关闭')
  await openCopy(p('warning.md'),'引用需核对');await ui.waitFor(`document.querySelector('.copy-ack:not(.copy-reading-choice) input')`,'unresolved reference notice');assert.equal(await evaluate(`Array.from(document.querySelectorAll('.file-operation-dialog button')).find(e=>e.textContent.trim()==='复制 1 项').disabled`),true);await primary('取消');assert.equal(await fs.stat(path.join(targetRoot,'引用需核对')).then(()=>true,()=>false),false);report.warningCancelExact=true
  await openCopy(p('warning.md'),'引用需核对');await ui.click('.copy-ack:not(.copy-reading-choice) input');await primary('复制 1 项');await ui.waitFor(`document.querySelector('.copy-summary')?.textContent.includes('已复制 1 项')`,'acknowledged original reference copy');assert.equal(await fs.readFile(path.join(targetRoot,'引用需核对/warning.md'),'utf8'),'![缺失](missing.png)\r\n');report.warningChoiceExact=true;mark(7);mark(8);await primary('关闭')
  await draftExact();assert.equal(await fs.readFile(p('saved.md'),'utf8'),saved);report.unselectedAfter=sha(await fs.readFile(p('unselected.txt')));await take(p('unselected.txt'),'installed-v1121-unselected.txt','source/unselected.txt')
  report.predecessorDraftsPreserved=await evaluate(`window.__v1121PriorDrafts.every(prior=>${store}.tabs.some(t=>t.id===prior.id&&t.path===prior.path&&t.isDirty&&t.content===prior.content))`);assert.equal(report.predecessorDraftsPreserved,true)
  report.inputTrace=await evaluate('window.__v1121Trace');report.runtimeErrors=await evaluate('window.__v1121Errors');report.errorOverlay=await evaluate('!!document.querySelector(".error-overlay")');mark(9)
  if(['1.1.33','1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1'].includes(appVersion)){const {runInstalledV1133Workflow}=await import('./installed-v1-1-33-workflow.mjs');await runInstalledV1133Workflow({ui,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,repoRoot,source,targetRoot,openCopy,primary,draftExact})}
  if(['1.1.34','1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1'].includes(appVersion)){const {runInstalledV1134Workflow}=await import('./installed-v1-1-34-workflow.mjs');await runInstalledV1134Workflow({send,ui,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,source,targetRoot,openCopy,primary,draftExact})}
  if(['1.1.35','1.1.36', '1.1.37', '1.2.0', '1.2.1'].includes(appVersion)){const {runInstalledV1135Workflow}=await import('./installed-v1-1-35-workflow.mjs');await runInstalledV1135Workflow({send,ui,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,source})}
  if(['1.1.36','1.1.37', '1.2.0', '1.2.1'].includes(appVersion)){const {runInstalledV1136Workflow}=await import('./installed-v1-1-36-workflow.mjs');await runInstalledV1136Workflow({send,ui,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,repoRoot})}
  // Explicit fixture cleanup saves the retained draft only after all copy assertions.
  await navigate('#/library?path='+encodeURIComponent(p('saved.md')),'#vditor-lib','retained original draft');await ui.clickTarget(editor);await ui.key('s','KeyS',83,2);await ui.waitFor('window.__v1121SourceTab.isDirty===false','ordinary explicit cleanup save');assert.ok((await fs.readFile(p('saved.md'),'utf8')).includes('必须保留的未保存草稿'));report.explicitCleanupSave=true
  report.status='passed';validateInstalledCrossCopy(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});const exported=new Map(await Promise.all(report.outputs.map(async item=>[item.fileName,await fs.readFile(path.join(output,item.fileName))])));assertCrossCopyOutputBytes(report,name=>exported.get(name))
 }catch(error){failure=error;report.status='failed';report.failure=String(error.stack||error);report.failureUI=await evaluate(`({hash:location.hash,body:document.body.innerText.slice(-7000),preview:document.querySelector('.copy-preview')?.outerHTML})`).catch(()=>null);await capture('installed-v1121-failure.jpg').catch(()=>{})}
 finally{
  try{
   if(originalLibraries&&!failure){
    // Remove the owned inactive profile through Settings, so both live state
    // and persisted config agree before later workflows save display styles.
    await navigate('#/settings?category=library','.add-library-form','remove only the owned temporary copy profile')
    const card=`[...document.querySelectorAll('.library-item')].find(e=>e.querySelector('.lib-name')?.textContent.trim()===${q(label)})`
    await ui.waitFor(`!!(${card})`,'owned target profile remains registered')
    await ui.clickTarget(`(${card}).querySelector('.lib-actions button:last-of-type')`)
    await ui.clickText('.n-dialog button','确认移除')
    await ui.waitFor(`!${store}.libraries.some(l=>window.__v1121Key(l.path)===${q(key(targetRoot))})`,'live target profile removed')
    const expected=originalLibraries.map(l=>key(l.path)).sort()
    await ui.waitFor(`window.__TAURI_INTERNALS__.invoke('get_config').then(c=>JSON.stringify(c.libraries.map(l=>window.__v1121Key(l.path)).sort())===${q(JSON.stringify(expected))})`,'profile removal persisted')
    assert.equal(key((await invoke('get_config')).activeLibraryPath),key(library))
    assert.equal(await evaluate(`window.__v1121PriorDrafts.every(prior=>${store}.tabs.some(t=>t.id===prior.id&&t.path===prior.path&&t.isDirty&&t.content===prior.content))`),true)
    await navigate('#/library','.library-mode','return with all original profiles and drafts')
   }else if(originalLibraries){const config=await invoke('get_config').catch(()=>null);if(config)await invoke('save_config',{config:{...config,libraries:originalLibraries}}).catch(()=>{})}
  }catch(error){failure ||= error;report.status='failed';report.cleanupFailure=String(error.stack||error);await capture('installed-v1121-cleanup-failure.jpg').catch(()=>{})}
  report.runtimeErrors=await evaluate('window.__v1121Errors||[]').catch(()=>[]);await fs.writeFile(path.join(output,'installed-v1121-workflow.json'),JSON.stringify(report,null,2)+'\n')
 }
 if(failure)throw failure
}
