import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {positionSource,positionDraft} from './structured-source-position-fixture.mjs'
import {sourceSearchChecks,sourceSearchOutputFiles,validateInstalledSourceSearch,assertSourceSearchOutputBytes} from './installed-v1-3-5-evidence.mjs'
const q=JSON.stringify,sha=b=>crypto.createHash('sha256').update(b).digest('hex'),key=p=>String(p||'').replaceAll('\\','/').replace('//?/','').toLowerCase()
export async function runInstalledV135SourceSearchWorkflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.ok(['1.3.5','1.3.6', '1.3.7'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'000-v135-search-'+crypto.randomUUID()),ui=nativeUserInput({send,evaluate},{timeoutMs:45000}),store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
 const r={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-source-search-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],modes:[],outputs:[],viewportWidths:[]},observations={},outputs=[]
 const mark=i=>{r.checks.push({id:sourceSearchChecks[i],status:'passed'});observations[sourceSearchChecks[i]]=true}
 let failure
 try{
  await evaluate(`window.__v135Prior=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}));window.__v135Trace=[];window.__v135Errors=[];for(const type of ['click','pointerdown','keydown','input'])document.addEventListener(type,e=>window.__v135Trace.push({type,trusted:e.isTrusted}),true);window.addEventListener('error',e=>window.__v135Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v135Errors.push(String(e.reason)))`)
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'.v119-installed-owner'),'owned source search fixture')
  for(const mode of ['json','yaml','xml','toml']){
   let file=path.join(folder,mode+'.'+mode)
   const other=path.join(folder,mode+'-other.'+mode),root='.'+mode+'-workspace',source=root+' .cm-content',panel=root+' .cm-search',field=panel+' input[name=search]',replacement=panel+' input[name=replace]',view=`document.querySelector(${q(source)}).cmTile.root.view`,body=()=>evaluate(`${view}.state.doc.toString()`),entry={mode}
   const fresh=()=>ui.waitFor(`document.querySelector('${root}')?.dataset.loading==='false'&&document.querySelector('${root}')?.dataset.analysisCurrent==='true'`,'current '+mode+' search document')
   const open=async target=>{await navigate('#/library?path='+encodeURIComponent(target),root,'source search '+mode);await fresh()}
   const show=async()=>{await ui.click(source);await ui.key('f','KeyF',70,2);await ui.waitFor(`!!document.querySelector(${q(field)})?.getClientRects().length`,'existing search panel')}
   const settings=()=>evaluate(`(()=>{const p=document.querySelector(${q(panel)}),i=n=>p.querySelector('input[name='+n+']');return{search:i('search').value,replace:i('replace')?.value,caseSensitive:i('case').checked,regexp:i('re').checked,wholeWord:i('word').checked}})()`)
   const set=async value=>{await ui.fill(field,value.search);await ui.fill(replacement,value.replace);for(const[name,prop]of [['case','caseSensitive'],['re','regexp'],['word','wholeWord']])if(await evaluate(`document.querySelector(${q(panel+' input[name='+name+']')}).checked`)!==value[prop])await ui.click(panel+' input[name='+name+']')}
   const a={search:'我的草稿 10',replace:'替换文字',caseSensitive:true,regexp:false,wholeWord:true},b={search:'另一份资料 (\\d+)',replace:'资料 $1',caseSensitive:false,regexp:true,wholeWord:false},draft=positionDraft(mode),changed=positionSource(mode,'新的草稿')
   await fs.writeFile(file,'\uFEFF'+positionSource(mode).replaceAll('\n','\r\n'));await fs.writeFile(other,positionSource(mode,'另一份资料'))
   await open(file);await ui.fill(source,draft);await fresh();await show();await set(a)
   await open(other);assert.equal(await evaluate(`!!document.querySelector(${q(panel)})`),false);await show();await set(b)
   await open(file);assert.deepEqual(await settings(),a);assert.equal(await evaluate(`document.activeElement?.matches(${q(field)})`),false);assert.equal(await body(),draft)
   await open(other);assert.deepEqual(await settings(),b);await open(file);entry.inputsExact=true
   await ui.click(panel+' button[name=close]');await open(other);await open(file);assert.equal(await evaluate(`!!document.querySelector(${q(panel)})`),false);await show();assert.deepEqual(await settings(),a);entry.closedPanelExact=true
   await ui.click(source);await ui.key('Home','Home',36,2);if(['json','xml'].includes(mode))await ui.key('ArrowDown','ArrowDown',40);await ui.key('Home','Home',36);await ui.key('End','End',35,8)
   const selected=await evaluate(`(()=>{const v=${view};return v.state.doc.sliceString(v.state.selection.main.from,v.state.selection.main.to)})()`);assert.ok(selected.includes('field000'));await ui.key('f','KeyF',70,2);assert.equal((await settings()).search,selected);entry.selectedTextPriority=true;await set(a)
   const filter=mode==='json'?root+' input[aria-label="筛选字段路径"]':mode==='yaml'?root+' input[aria-label="筛选 YAML 结构提纲"]':root+' aside input'
   if(!await evaluate(`!!document.querySelector(${q(filter)})?.getClientRects().length`))await ui.clickText(root+' header button',mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题')
   await ui.fill(filter,'field');assert.equal(await evaluate(`document.activeElement?.matches(${q(filter)})`),true);entry.filterFocusPreserved=true
   await set({...a,search:'[',regexp:true});await ui.waitFor(`document.querySelector('${panel} .structured-search-feedback')?.textContent==='正则表达式无效'`,'inline invalid regex');await open(other);await open(file);assert.equal((await settings()).search,'[');assert.equal(await body(),draft)
   await set({...a,search:'no-match-135'});await ui.waitFor(`document.querySelector('${panel} .structured-search-feedback')?.textContent==='没有匹配内容'`,'inline genuine no match');entry.inlineFeedback=true
   await set({...a,search:'我的草稿',replace:'新的草稿',wholeWord:false});await ui.click(panel+' button[name=replaceAll]');await fresh();assert.equal(await body(),changed);assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+positionSource(mode).replaceAll('\n','\r\n'))
   await ui.click(source);await ui.key('z','KeyZ',90,2);assert.equal(await body(),draft);await ui.key('y','KeyY',89,2);assert.equal(await body(),changed);entry.replaceUndoRedoExact=true
   await ui.key('s','KeyS',83,2);await ui.waitFor(`document.querySelector('${root}')?.dataset.dirty==='false'&&document.querySelector('${root}')?.dataset.saving==='false'`,'explicit source save')
   assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+changed.replaceAll('\n','\r\n'));entry.explicitSaveExact=true
   await open(other);await fs.writeFile(other,positionSource(mode,'外部更新'));await open(file);await open(other);assert.deepEqual(await settings(),b);await ui.waitFor(`document.querySelector('${panel} .structured-search-feedback')?.textContent==='没有匹配内容'`,'recomputed against changed body');entry.changedBodyRecomputed=true
   await open(file);await fs.chmod(other,0o444);await open(other);await ui.waitFor(`document.querySelector('${root} .cm-content')?.getAttribute('contenteditable')==='false'`,'actual readonly file');assert.equal(await evaluate(`!!document.querySelector(${q(replacement)})||!!document.querySelector('${panel} button[name=replaceAll]')`),false);assert.equal((await settings()).search,b.search);entry.readOnlyExact=true;await fs.chmod(other,0o666)
   await open(file);await set(a)
   const renamed=path.join(folder,'renamed-'+mode+'.'+mode);await ui.click('button[aria-label="重命名当前文档"]');await ui.fill('#library-rename-input input, input#library-rename-input',path.basename(renamed));await ui.clickText('.n-dialog button','更新名称');await ui.waitFor(`!document.querySelector('.rename-editor')&&${store}.tabs.some(t=>(${key.toString()})(t.path)===${q(key(renamed))})`,'real search owner rename');file=renamed;await fresh();assert.deepEqual(await settings(),a);entry.renameExact=true
   await ui.click('.library-mode .workspace-tab.active .close-tab');await ui.waitFor(`!${store}.tabs.some(t=>(${key.toString()})(t.path)===${q(key(file))})`,'saved source tab really closed');await open(file);assert.equal(await evaluate(`!!document.querySelector(${q(panel)})`),false);entry.closeResetExact=true
   await show();await set({...a,search:'新的草稿',replace:'继续修改',wholeWord:false})
   for(const width of [1280,800]){await send('Emulation.setDeviceMetricsOverride',{width,height:width===800?640:820,deviceScaleFactor:1,mobile:false});await new Promise(resolve=>setTimeout(resolve,250));await open(other);await open(file);assert.equal((await settings()).search,'新的草稿');await capture('installed-v135-search-'+mode+'-'+width+'.jpg');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false)}await send('Emulation.clearDeviceMetricsOverride',{})
   const bytes=await fs.readFile(file);assert.equal(bytes.toString('utf8'),'\uFEFF'+changed.replaceAll('\n','\r\n'));outputs.push([sourceSearchOutputFiles[1+r.modes.length],bytes]);r.modes.push(entry);mark(r.modes.length-1)
  }
  for(const i of [4,5,6,7,8])mark(i);r.viewportWidths=[1280,800]
  r.otherDraftsPreserved=await evaluate(`window.__v135Prior.every(p=>${store}.tabs.some(t=>t.id===p.id&&t.path===p.path&&t.content===p.content&&t.isDirty))`);assert.equal(r.otherDraftsPreserved,true);assert.equal(await evaluate(`${store}.tabs.some(t=>(${key.toString()})(t.path).startsWith(${q(key(folder))})&&t.isDirty)`),false);r.disposableDraftsExplicitlySaved=true
  r.inputTrace=await evaluate('window.__v135Trace');r.runtimeErrors=await evaluate('window.__v135Errors');r.errorOverlay=await evaluate('!!document.querySelector("#crash-screen,.global-error-overlay,.startup-fatal-screen,.route-error-fallback")');assert.deepEqual(r.runtimeErrors,[])
  outputs.unshift([sourceSearchOutputFiles[0],Buffer.from(JSON.stringify(observations,null,2))]);for(const[fileName,bytes]of outputs){await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});r.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
  r.status='passed';validateInstalledSourceSearch(r,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});assertSourceSearchOutputBytes(r,name=>outputs.find(([n])=>n===name)[1])
 }catch(error){failure=error;r.status='failed';r.failure=String(error.stack||error);r.failureUI=await evaluate('({hash:location.hash,body:document.body.innerText.slice(-6000)})').catch(()=>null);await capture('installed-v135-search-failure.jpg').catch(()=>{})}
 finally{await send('Emulation.clearDeviceMetricsOverride',{}).catch(()=>{});await fs.writeFile(path.join(output,'installed-v135-search-workflow.json'),JSON.stringify(r,null,2)+'\n')}
 if(failure)throw failure
}
