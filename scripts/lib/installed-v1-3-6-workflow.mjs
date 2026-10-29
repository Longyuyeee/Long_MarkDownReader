import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {positionSource,positionDraft} from './structured-source-position-fixture.mjs'
import {sourceScopeChecks,sourceScopeOutputFiles,validateInstalledSourceScope,assertSourceScopeOutputBytes,scopedOutput} from './installed-v1-3-6-evidence.mjs'
const q=JSON.stringify,sha=b=>crypto.createHash('sha256').update(b).digest('hex'),key=p=>String(p||'').replaceAll('\\','/').replace('//?/','').toLowerCase()
export async function runInstalledV136SourceScopeWorkflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.ok(['1.3.6','1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'000-v136-search-'+crypto.randomUUID()),ui=nativeUserInput({send,evaluate},{timeoutMs:45000}),store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
 const r={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-source-scope-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],modes:[],outputs:[],viewportWidths:[]},observations={},outputs=[]
 const mark=i=>{r.checks.push({id:sourceScopeChecks[i],status:'passed'});observations[sourceScopeChecks[i]]=true}
 let failure
 try{
  await evaluate(`window.__v136Prior=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}));window.__v136Trace=[];window.__v136Errors=[];for(const type of ['click','pointerdown','keydown','input'])document.addEventListener(type,e=>window.__v136Trace.push({type,trusted:e.isTrusted}),true);window.addEventListener('error',e=>window.__v136Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v136Errors.push(String(e.reason)))`)
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'.v119-installed-owner'),'owned source search fixture')
  for(const mode of ['json','yaml','xml','toml']){
   let file=path.join(folder,mode+'.'+mode)
   const other=path.join(folder,mode+'-other.'+mode),root='.'+mode+'-workspace',source=root+' .cm-content',panel=root+' .cm-search',field=panel+' input[name=search]',replacement=panel+' input[name=replace]',view=`document.querySelector(${q(source)}).cmTile.root.view`,body=()=>evaluate(`${view}.state.doc.toString()`),entry={mode}
   const fresh=()=>ui.waitFor(`document.querySelector('${root}')?.dataset.loading==='false'&&document.querySelector('${root}')?.dataset.analysisCurrent==='true'`,'current '+mode+' search document')
   const exact=text=>ui.waitFor(`${view}.state.doc.toString()===${q(text)}`,'current source matches completed edit')
   const open=async target=>{await navigate('#/library?path='+encodeURIComponent(target),root,'source search '+mode);await fresh()}
   const show=async()=>{await ui.click(source);await ui.key('f','KeyF',70,2);await ui.waitFor(`!!document.querySelector(${q(field)})?.getClientRects().length`,'existing search panel')}
   const settings=()=>evaluate(`(()=>{const p=document.querySelector(${q(panel)}),i=n=>p.querySelector('input[name='+n+']');return{search:i('search').value,replace:i('replace')?.value,caseSensitive:i('case').checked,regexp:i('re').checked,wholeWord:i('word').checked}})()`)
   const set=async value=>{await ui.fill(field,value.search);await ui.fill(replacement,value.replace);for(const[name,prop]of [['case','caseSensitive'],['re','regexp'],['word','wholeWord']])if(await evaluate(`document.querySelector(${q(panel+' input[name='+name+']')}).checked`)!==value[prop])await ui.click(panel+' input[name='+name+']')}
   const draft=positionDraft(mode),changed=scopedOutput(mode)
   const status=panel+' .structured-search-feedback',scope=panel+' input[name=scope]'
   const waitText=text=>ui.waitFor(text==='选区内 · 3项'?`/^选区内 · (?:[123]\\/)?3项$/.test(document.querySelector(${q(status)})?.textContent)`:`document.querySelector(${q(status)})?.textContent?.includes(${q(text)})`,text)
   const select=async()=>{await ui.click(source);await ui.key('Home','Home',36,2);for(let i=0;i<3+(['json','xml'].includes(mode)?1:0);i++)await ui.key('ArrowDown','ArrowDown',40);await ui.key('Home','Home',36);for(let i=0;i<3;i++)await ui.key('ArrowDown','ArrowDown',40,8)}
   await fs.writeFile(file,'\uFEFF'+positionSource(mode).replaceAll('\n','\r\n'));await fs.writeFile(other,positionSource(mode,'另一份资料'))
   await open(file);await ui.fill(source,draft);await fresh();await select();await ui.key('f','KeyF',70,2)
   await ui.waitFor(`!!document.querySelector(${q(field)})`,'selected text search panel')
   assert.equal(await evaluate(`document.querySelector(${q(scope)}).checked`),false)
   await ui.fill(field,'我的草稿');await ui.fill(replacement,'选区修改的新值');await ui.click(scope);await waitText('选区内 · 3项');entry.explicitScope=true
   await ui.fill(field,'field[\\s\\S]*保留');await ui.click(panel+' input[name=re]');await waitText('1项');await ui.click(panel+' button[name=next]');assert.ok((await evaluate(`(()=>{const v=${view};return v.state.doc.sliceString(v.state.selection.main.from,v.state.selection.main.to)})()`)).includes('field003'));entry.regexBoundaryExact=true
   await ui.click(panel+' input[name=re]');await ui.fill(field,'我的草稿');await waitText('3项')
   await ui.click(panel+' button[name=next]');await waitText('1/3项');await ui.click(panel+' button[name=prev]');await waitText('3/3项');entry.navigationAndCount=true
   await ui.click(panel+' button[name=select]');assert.equal(await evaluate(`${view}.state.selection.ranges.length`),3);entry.selectAllScoped=true
   await ui.click(panel+' button[name=replaceAll]');await ui.waitFor(`${view}.state.doc.toString()===${q(changed)}`,'scoped replacement applied');await fresh();assert.equal(await body(),changed);assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+positionSource(mode).replaceAll('\n','\r\n'))
   await ui.click(source);await ui.key('z','KeyZ',90,2);await exact(draft);assert.equal(await body(),draft);await waitText('3项');await ui.key('y','KeyY',89,2);await exact(changed);assert.equal(await body(),changed);entry.replaceUndoRedoExact=true
   await ui.fill(field,'选区修改的新值');await waitText('选区内 · 3项');await open(other);assert.equal(await evaluate(`!!document.querySelector(${q(panel)})`),false);await show();await ui.fill(field,'另一份资料');assert.equal(await evaluate(`document.querySelector(${q(scope)}).checked`),false)
   await open(file);await waitText('选区内 · 3项');assert.equal((await settings()).search,'选区修改的新值');assert.equal(await evaluate(`document.activeElement?.matches(${q(field)})`),false)
   await ui.click(panel+' button[name=close]');await open(other);await open(file);assert.equal(await evaluate(`!!document.querySelector(${q(panel)})`),false);await show();await waitText('选区内 · 3项');entry.scopeAndClosedPanelRetained=true
   await ui.click(source);await ui.key('s','KeyS',83,2);await ui.waitFor(`document.querySelector('${root}')?.dataset.dirty==='false'&&document.querySelector('${root}')?.dataset.saving==='false'`,'explicit scoped source save');assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+changed.replaceAll('\n','\r\n'));entry.explicitSaveExact=true
   // Give B an explicit range, then change its saved body while A is active.
   await open(other);await select();await ui.click(scope);await waitText('选区内 · 3项');await open(file);await fs.writeFile(other,'\n'+positionSource(mode,'另一份资料'));await open(other)
   await waitText('选区已变化，请重新选区');assert.equal(await evaluate(`document.querySelector('${panel} button[name=replaceAll]').disabled`),true);assert.equal((await settings()).search,'另一份资料');entry.changedBodyFailsClosed=true
   await ui.click(scope);await waitText('100项');await ui.click(source);await ui.key('Home','Home',36,2);await ui.click(scope);await waitText('请先在正文选择范围');assert.equal(await evaluate(`document.querySelector('${panel} button[name=replaceAll]').disabled`),true)
   await select();await ui.click(panel+' button[name=scopeUpdate]');await waitText('选区内');entry.emptyAndUpdatedScope=true
   const beforeRewrite=await body();await ui.fill(source,beforeRewrite.replaceAll('保留','重写'));await fresh();await waitText('选区已变化，请重新选区');assert.equal(await evaluate(`document.querySelector('${panel} button[name=replaceAll]').disabled`),true);await ui.click(source);await ui.key('z','KeyZ',90,2);await exact(beforeRewrite);assert.equal(await body(),beforeRewrite);await waitText('选区内');entry.scopeRewriteProtected=true
   await open(file);await fs.chmod(other,0o444);await open(other);await ui.waitFor(`document.querySelector('${root} .cm-content')?.getAttribute('contenteditable')==='false'`,'actual readonly scoped file');assert.equal(await evaluate(`!!document.querySelector(${q(replacement)})||!!document.querySelector('${panel} button[name=replaceAll]')`),false);assert.equal((await settings()).search,'另一份资料');entry.readOnlyExact=true;await fs.chmod(other,0o666)
   await open(file);await waitText('选区内 · 3项')
   const renamed=path.join(folder,'renamed-'+mode+'.'+mode);await ui.click('button[aria-label="重命名当前文档"]');await ui.fill('#library-rename-input input, input#library-rename-input',path.basename(renamed));await ui.clickText('.n-dialog button','更新名称');await ui.waitFor(`!document.querySelector('.rename-editor')&&${store}.tabs.some(t=>(${key.toString()})(t.path)===${q(key(renamed))})`,'real scope owner rename');file=renamed;await fresh();await waitText('选区内 · 3项');entry.renameExact=true
   await ui.click('.library-mode .workspace-tab.active .close-tab');await ui.waitFor(`!${store}.tabs.some(t=>(${key.toString()})(t.path)===${q(key(file))})`,'saved scope tab closed');await open(file);assert.equal(await evaluate(`!!document.querySelector(${q(panel)})`),false);entry.closeResetExact=true
   await select();await ui.key('f','KeyF',70,2);await ui.fill(field,'选区修改的新值');await ui.click(scope);await waitText('选区内 · 3项')
   for(const width of [1280,800]){await send('Emulation.setDeviceMetricsOverride',{width,height:width===800?640:820,deviceScaleFactor:1,mobile:false});await new Promise(resolve=>setTimeout(resolve,250));await open(other);await open(file);await waitText('选区内 · 3项');await capture('installed-v136-scope-'+mode+'-'+width+'.jpg');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false)}await send('Emulation.clearDeviceMetricsOverride',{})
   const bytes=await fs.readFile(file);assert.equal(bytes.toString('utf8'),'\uFEFF'+changed.replaceAll('\n','\r\n'));outputs.push([sourceScopeOutputFiles[1+r.modes.length],bytes]);r.modes.push(entry);mark(r.modes.length-1)
  }
  for(const i of [4,5,6,7,8])mark(i);r.viewportWidths=[1280,800]
  r.otherDraftsPreserved=await evaluate(`window.__v136Prior.every(p=>${store}.tabs.some(t=>t.id===p.id&&t.path===p.path&&t.content===p.content&&t.isDirty))`);assert.equal(r.otherDraftsPreserved,true);assert.equal(await evaluate(`${store}.tabs.some(t=>(${key.toString()})(t.path).startsWith(${q(key(folder))})&&t.isDirty)`),false);r.disposableDraftsExplicitlySaved=true
  r.inputTrace=await evaluate('window.__v136Trace');r.runtimeErrors=await evaluate('window.__v136Errors');r.errorOverlay=await evaluate('!!document.querySelector("#crash-screen,.global-error-overlay,.startup-fatal-screen,.route-error-fallback")');assert.deepEqual(r.runtimeErrors,[])
  outputs.unshift([sourceScopeOutputFiles[0],Buffer.from(JSON.stringify(observations,null,2))]);for(const[fileName,bytes]of outputs){await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});r.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
  r.status='passed';validateInstalledSourceScope(r,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});assertSourceScopeOutputBytes(r,name=>outputs.find(([n])=>n===name)[1])
 }catch(error){failure=error;r.status='failed';r.failure=String(error.stack||error);r.failureUI=await evaluate('({hash:location.hash,body:document.body.innerText.slice(-6000)})').catch(()=>null);await capture('installed-v136-scope-failure.jpg').catch(()=>{})}
 finally{await send('Emulation.clearDeviceMetricsOverride',{}).catch(()=>{});await fs.writeFile(path.join(output,'installed-v136-scope-workflow.json'),JSON.stringify(r,null,2)+'\n')}
 if(failure)throw failure
}
