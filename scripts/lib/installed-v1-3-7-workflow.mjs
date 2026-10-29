import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {positionSource,positionDraft} from './structured-source-position-fixture.mjs'
import {replacementPreviewChecks,replacementPreviewOutputFiles,validateInstalledReplacementPreview,assertReplacementPreviewOutputBytes,replacementPreviewOutput} from './installed-v1-3-7-evidence.mjs'
const q=JSON.stringify,sha=b=>crypto.createHash('sha256').update(b).digest('hex'),key=p=>String(p||'').replaceAll('\\','/').replace('//?/','').toLowerCase()
export async function runInstalledV137ReplacementPreviewWorkflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.ok(['1.3.7','1.3.8', '1.3.9', '1.3.10', '1.3.11'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'000-v137-search-'+crypto.randomUUID()),ui=nativeUserInput({send,evaluate},{timeoutMs:45000}),store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
 const r={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-replacement-preview-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],modes:[],outputs:[],viewportWidths:[]},observations={},outputs=[]
 const mark=i=>{r.checks.push({id:replacementPreviewChecks[i],status:'passed'});observations[replacementPreviewChecks[i]]=true}
 let failure
 try{
  await evaluate(`window.__v137Prior=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}));window.__v137Trace=[];window.__v137Errors=[];for(const type of ['click','pointerdown','keydown','input'])document.addEventListener(type,e=>window.__v137Trace.push({type,trusted:e.isTrusted}),true);window.addEventListener('error',e=>window.__v137Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v137Errors.push(String(e.reason)))`)
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'.v119-installed-owner'),'owned source search fixture')
  for(const mode of ['json','yaml','xml','toml']){
   let file=path.join(folder,mode+'.'+mode)
   const other=path.join(folder,mode+'-other.'+mode),root='.'+mode+'-workspace',source=root+' .cm-content',panel=root+' .cm-search',field=panel+' input[name=search]',replacement=panel+' input[name=replace]',view=`document.querySelector(${q(source)}).cmTile.root.view`,body=()=>evaluate(`${view}.state.doc.toString()`),entry={mode}
   const fresh=()=>ui.waitFor(`document.querySelector('${root}')?.dataset.loading==='false'&&document.querySelector('${root}')?.dataset.analysisCurrent==='true'`,'current '+mode+' search document')
   const exact=text=>ui.waitFor(`${view}.state.doc.toString()===${q(text)}`,'current source matches completed edit')
   const open=async target=>{await navigate('#/library?path='+encodeURIComponent(target),root,'source search '+mode);await fresh()}
   const show=async()=>{if(await evaluate(`${view}.state.readOnly`)){const button=root+' header button[aria-label^="'+(mode==='json'?'搜索源码':'查找')+'"]';if(mode==='json'&&!await evaluate(`!!document.querySelector(${q(button)})?.getClientRects().length`))await ui.clickText(root+' header button','编辑工具');await ui.click(button)}else{await ui.click(source);await ui.key('f','KeyF',70,2)}await ui.waitFor(`!!document.querySelector(${q(field)})?.getClientRects().length`,'existing search panel')}
   const settings=()=>evaluate(`(()=>{const p=document.querySelector(${q(panel)}),i=n=>p.querySelector('input[name='+n+']');return{search:i('search').value,replace:i('replace')?.value,caseSensitive:i('case').checked,regexp:i('re').checked,wholeWord:i('word').checked}})()`)
   const set=async value=>{await ui.fill(field,value.search);await ui.fill(replacement,value.replace);for(const[name,prop]of [['case','caseSensitive'],['re','regexp'],['word','wholeWord']])if(await evaluate(`document.querySelector(${q(panel+' input[name='+name+']')}).checked`)!==value[prop])await ui.click(panel+' input[name='+name+']')}
   const draft=positionDraft(mode),changed=replacementPreviewOutput(mode),modal='.structured-replacement-dialog',summary=modal+' .replacement-summary'
   const hidden=()=>ui.waitFor(`![...document.querySelectorAll('.structured-replacement-dialog,.n-modal-mask')].some(e=>e.getClientRects().length)`,'replacement modal fully closed')
   const preview=async()=>{await ui.click(panel+' button[name=previewReplace]');await ui.waitFor(`!!document.querySelector('${modal}')?.getClientRects().length`,'replacement preview visible')}
   const select=async()=>{await ui.click(source);await ui.key('Home','Home',36,2);for(let i=0;i<3+(['json','xml'].includes(mode)?1:0);i++)await ui.key('ArrowDown','ArrowDown',40);await ui.key('Home','Home',36);for(let i=0;i<3;i++)await ui.key('ArrowDown','ArrowDown',40,8)}
   await fs.writeFile(file,'\uFEFF'+positionSource(mode).replaceAll('\n','\r\n'));await fs.writeFile(other,positionSource(mode,'另一份资料'))
   await open(file);await ui.fill(source,draft);await exact(draft);await fresh();await show();await ui.fill(field,'我的草稿');await ui.fill(replacement,'预览修改')
   await preview();assert.ok((await evaluate(`document.querySelector('${summary}').textContent`)).includes('100'));assert.equal(await evaluate(`document.querySelectorAll('${modal} .replacement-item').length`),20)
   assert.equal(await evaluate(`document.querySelector('${modal} .replacement-before mark').textContent`),'我的草稿');assert.equal(await evaluate(`document.querySelector('${modal} .replacement-after mark').textContent`),'预览修改')
   await ui.clickText(modal+' button','下一页');await ui.waitFor(`document.querySelector('${modal} .replacement-location')?.textContent?.trim().startsWith('21 ·')`,'second preview page');entry.pagedBeforeAfterExact=true
   await ui.key('Escape','Escape',27);await hidden();assert.equal(await body(),draft);assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+positionSource(mode).replaceAll('\n','\r\n'));entry.cancelDraftExact=true
   await select();await ui.key('f','KeyF',70,2);await ui.fill(field,'我的草稿 (\\d+)');await ui.fill(replacement,'确认 $1');await ui.click(panel+' input[name=re]');await ui.click(panel+' input[name=scope]')
   await ui.waitFor(`/^选区内 · (?:[123]\\/)?3项$/.test(document.querySelector('${panel} .structured-search-feedback')?.textContent)`,'scoped capture matches');await preview()
   assert.ok((await evaluate(`document.querySelector('${summary}').textContent`)).includes('3 处'));assert.equal(await evaluate(`document.querySelector('${modal} .replacement-after mark').textContent`),'确认 3');entry.scopedCapturesExact=true
   await ui.clickText(modal+' button','应用到草稿');await hidden();await exact(changed);await fresh();assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+positionSource(mode).replaceAll('\n','\r\n'))
   await ui.click(source);await ui.key('z','KeyZ',90,2);await exact(draft);await ui.key('y','KeyY',89,2);await exact(changed);entry.applyUndoRedoExact=true
   await ui.key('s','KeyS',83,2);await ui.waitFor(`document.querySelector('${root}')?.dataset.dirty==='false'&&document.querySelector('${root}')?.dataset.saving==='false'`,'explicit preview draft save');assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+changed.replaceAll('\n','\r\n'));entry.explicitSaveExact=true
   await ui.fill(field,'确认');await ui.fill(replacement,'不会应用');await preview();await open(other);await hidden();assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+changed.replaceAll('\n','\r\n'));entry.ownerResetExact=true
   await open(file);await fs.chmod(other,0o444);await open(other);await ui.waitFor(`document.querySelector('${source}')?.getAttribute('contenteditable')==='false'`,'real readonly source');await show();assert.equal(await evaluate(`!!document.querySelector('${panel} button[name=previewReplace]')`),false);entry.readOnlyExact=true;await fs.chmod(other,0o666)
   await open(file);await ui.fill(field,'确认');await ui.fill(replacement,'继续修改')
   for(const width of [1280,800]){await send('Emulation.setDeviceMetricsOverride',{width,height:width===800?640:820,deviceScaleFactor:1,mobile:false});await new Promise(resolve=>setTimeout(resolve,250));await preview();await new Promise(resolve=>setTimeout(resolve,350));assert.equal(await evaluate(`!!document.querySelector('${modal} [role=alert]')`),false);await capture('installed-v137-preview-'+mode+'-'+width+'.jpg');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await ui.clickText(modal+' button','取消');await hidden()}await send('Emulation.clearDeviceMetricsOverride',{})
   const bytes=await fs.readFile(file);assert.equal(bytes.toString('utf8'),'\uFEFF'+changed.replaceAll('\n','\r\n'));outputs.push([replacementPreviewOutputFiles[1+r.modes.length],bytes]);r.modes.push(entry);mark(r.modes.length-1)
  }
  for(const i of [4,5,6,7,8])mark(i);r.viewportWidths=[1280,800]
  r.otherDraftsPreserved=await evaluate(`window.__v137Prior.every(p=>${store}.tabs.some(t=>t.id===p.id&&t.path===p.path&&t.content===p.content&&t.isDirty))`);assert.equal(r.otherDraftsPreserved,true);assert.equal(await evaluate(`${store}.tabs.some(t=>(${key.toString()})(t.path).startsWith(${q(key(folder))})&&t.isDirty)`),false);r.disposableDraftsExplicitlySaved=true
  r.inputTrace=await evaluate('window.__v137Trace');r.runtimeErrors=await evaluate('window.__v137Errors');r.errorOverlay=await evaluate('!!document.querySelector("#crash-screen,.global-error-overlay,.startup-fatal-screen,.route-error-fallback")');assert.deepEqual(r.runtimeErrors,[])
  outputs.unshift([replacementPreviewOutputFiles[0],Buffer.from(JSON.stringify(observations,null,2))]);for(const[fileName,bytes]of outputs){await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});r.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
  r.status='passed';validateInstalledReplacementPreview(r,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});assertReplacementPreviewOutputBytes(r,name=>outputs.find(([n])=>n===name)[1])
 }catch(error){failure=error;r.status='failed';r.failure=String(error.stack||error);r.failureUI=await evaluate('({hash:location.hash,body:document.body.innerText.slice(-6000)})').catch(()=>null);await capture('installed-v137-preview-failure.jpg').catch(()=>{})}
 finally{await send('Emulation.clearDeviceMetricsOverride',{}).catch(()=>{});await fs.writeFile(path.join(output,'installed-v137-preview-workflow.json'),JSON.stringify(r,null,2)+'\n')}
 if(failure)throw failure
}
