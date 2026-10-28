import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {outlineContinuitySources,outlineContinuityDraft} from './structured-outline-continuity-fixture.mjs'
import {outlineContinuityChecks,outlineContinuityOutputFiles,validateInstalledOutlineContinuity,assertOutlineContinuityOutputBytes} from './installed-v1-3-3-evidence.mjs'
const q=JSON.stringify,sha=b=>crypto.createHash('sha256').update(b).digest('hex'),key=p=>String(p||'').replaceAll('\\','/').replace('//?/','').toLowerCase()
export async function runInstalledV133OutlineContinuityWorkflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.equal(appVersion,'1.3.3');assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'000-v133-continuity-'+crypto.randomUUID()),ui=nativeUserInput({send,evaluate},{timeoutMs:45000}),store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
 const r={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-outline-continuity-trusted-input-and-output-bytes',inputProtocol:'leading-empty-lines-use-trusted-enter',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],modes:[],outputs:[],viewportWidths:[]},observations={},outputs=[]
 const mark=i=>{r.checks.push({id:outlineContinuityChecks[i],status:'passed'});observations[outlineContinuityChecks[i]]=true}
 let failure
 try{
  await evaluate(`window.__v133Prior=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}));window.__v133Trace=[];window.__v133Errors=[];for(const type of ['click','pointerdown','keydown','input'])document.addEventListener(type,e=>window.__v133Trace.push({type,trusted:e.isTrusted}),true);window.addEventListener('error',e=>window.__v133Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v133Errors.push(String(e.reason)))`)
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'.v119-installed-owner'),'owned outline continuity fixture')
  for(const[mode,original]of Object.entries(outlineContinuitySources)){
   let file=path.join(folder,mode+'.'+mode)
   const other=path.join(folder,mode+'-other.'+mode),root='.'+mode+'-workspace',source=root+' .cm-content[contenteditable=true]',rows=root+' [data-outline-node]',filter=mode==='json'?root+' input[aria-label="筛选字段路径"]':mode==='yaml'?root+' input[aria-label="筛选 YAML 结构提纲"]':root+' aside input',draft=outlineContinuityDraft(mode),entry={mode}
   const text=()=>evaluate(`document.querySelector(${q(source)}).cmTile.root.view.state.doc.toString()`),fresh=()=>ui.waitFor(`document.querySelector('${root}')?.dataset.loading==='false'&&document.querySelector('${root}')?.dataset.analysisCurrent==='true'`,'current '+mode+' analysis')
   const ensure=async()=>{if(!await evaluate(`!!document.querySelector(${q(filter)})?.getClientRects().length`))await ui.clickText(root+' header button',mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题');await ui.waitFor(`!!document.querySelector(${q(filter)})?.getClientRects().length`,'visible outline filter')}
   const open=async target=>{await navigate('#/library?path='+encodeURIComponent(target),root,'continuity '+mode);await fresh();await ensure()}
   const query=()=>evaluate(`document.querySelector(${q(filter)}).value`)
   const filtered=async value=>{await ui.fill(filter,value);await ui.waitFor(`document.querySelectorAll('${rows}[data-outline-node*=${q(value)}]').length===1`,'matching '+value+' field')}
   const pick=async name=>{await ui.tabTo(rows);await ui.key('End','End',35);await ui.waitFor(`document.activeElement?.dataset.outlineNode?.includes(${q(name)})`,'focused '+name);await ui.key('Enter','Enter',13);await ui.waitFor(`document.activeElement?.matches(${q(source)})`,'source has keyboard focus')}
   await fs.writeFile(file,'\uFEFF'+original.replaceAll('\n','\r\n'));await fs.writeFile(other,original.replace('原稿','另一份资料'))
   await open(file);await filtered('second');await pick('second')
   await ui.fill(source,'');const leading=draft.match(/^\n+/)?.[0].length||0;for(let n=0;n<leading;n++)await ui.key('Enter','Enter',13);await send('Input.insertText',{text:draft.slice(leading)});assert.equal(await text(),draft);await fresh()
   await open(other);assert.equal(await query(),'');assert.equal(await evaluate(`document.querySelectorAll('${rows}[aria-current=true]').length`),0);await filtered('third');await pick('third')
   await open(file);assert.equal(await query(),'second');await ui.waitFor(`document.querySelector('${rows}[aria-current=true]')?.dataset.outlineNode.includes('second')`,'restored semantic selection');assert.equal(await text(),draft);assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+original.replaceAll('\n','\r\n'));assert.equal(await evaluate(`!!document.activeElement?.matches('${rows}')`),false)
   await ui.fill(filter,'v133-no-results');await ui.waitFor(`document.querySelectorAll('${rows}').length===0`,'empty filter');await open(other);assert.equal(await query(),'third');await open(file);assert.equal(await query(),'v133-no-results');assert.equal(await evaluate(`document.querySelectorAll('${rows}').length`),0);assert.equal(await text(),draft)
   await ui.fill(filter,'');await ui.waitFor(`document.querySelectorAll('${rows}').length>=3`,'clear filter')
   if(mode==='json'){
    await ui.clickText(root+' header button','树形')
    const group=`[...document.querySelectorAll('${root} .tree-row')].find(e=>e.querySelector('.tree-node-main strong')?.textContent==='group')`
    await ui.clickTarget('('+group+').querySelector(".tree-toggle")');await ui.waitFor(`(${group})?.getAttribute('aria-expanded')==='false'`,'JSON group collapsed')
    await open(other);assert.equal(await evaluate(`!!document.querySelector('${root} .tree-rows')?.getClientRects().length`),false);await open(file);await ui.waitFor(`(${group})?.getAttribute('aria-expanded')==='false'`,'returned JSON tree remains collapsed');await capture('installed-v133-json-tree-return.jpg');r.jsonTreeRestored=true
    await ui.clickText(root+' header button','源码')
   }
   if(mode==='toml'){
    await ui.click(root+' button[aria-label="展开数组 items"]');await ui.waitFor(`document.querySelectorAll('${rows}[data-outline-node*="items["]').length===2`,'expanded array items')
    await open(other);await ui.fill(filter,'');await ui.waitFor(`document.querySelector('${root} button[aria-label="展开数组 items"]')?.getAttribute('aria-expanded')==='false'`,'other file array remains collapsed')
    await open(file);await ui.waitFor(`document.querySelectorAll('${rows}[data-outline-node*="items["]').length===2`,'returned array reanalysed and expanded');await fresh();await capture('installed-v133-toml-array-return.jpg');r.tomlArraysRestored=true
   }
   await filtered('second');await pick('second');entry.perFileFilterExact=true;entry.selectionExact=true;entry.draftExact=true
   await open(other);await ui.click('.library-mode .workspace-tab.active .close-tab');await ui.waitFor(`!${store}.tabs.some(t=>(${key.toString()})(t.path)===${q(key(other))})`,'clean tab closed');await open(other);assert.equal(await query(),'');assert.equal(await evaluate(`document.querySelectorAll('${rows}[aria-current=true]').length`),0);await open(file);assert.equal(await query(),'second');assert.equal(await text(),draft);entry.closeResetExact=true
   await pick('second');assert.ok((await evaluate(`(()=>{const v=document.querySelector(${q(source)}).cmTile.root.view;return v.state.doc.sliceString(v.state.selection.main.from,v.state.selection.main.to)})()`)).includes('保留😀'));entry.currentRangeExact=true
   await ui.key('s','KeyS',83,2);await ui.waitFor(`document.querySelector('${root}')?.dataset.dirty==='false'&&document.querySelector('${root}')?.dataset.saving==='false'`,'explicit save')
   const renamed=path.join(folder,'renamed-'+mode+'.'+mode);await ui.click('button[aria-label="重命名当前文档"]');await ui.fill('#library-rename-input input, input#library-rename-input',path.basename(renamed));await ui.clickText('.n-dialog button','更新名称');await ui.waitFor(`!document.querySelector('.rename-editor')&&${store}.tabs.some(t=>(${key.toString()})(t.path)===${q(key(renamed))})`,'actual rename retains tab');file=renamed;await fresh();await ensure();assert.equal(await query(),'second');await ui.waitFor(`document.querySelector('${rows}[aria-current=true]')?.dataset.outlineNode.includes('second')`,'rename retains semantic selection');entry.renameExact=true
   const bytes=await fs.readFile(file);assert.equal(bytes.toString('utf8'),'\uFEFF'+draft.replaceAll('\n','\r\n'));entry.savedExact=true;outputs.push([outlineContinuityOutputFiles[1+r.modes.length],bytes]);r.modes.push(entry);mark(r.modes.length-1)
   for(const width of [1280,800]){await send('Emulation.setDeviceMetricsOverride',{width,height:width===800?640:820,deviceScaleFactor:1,mobile:false});await new Promise(resolve=>setTimeout(resolve,300));await ensure();await ui.tabTo(rows);await ui.key('End','End',35);await ui.clickTarget(`document.querySelector('${rows}[aria-current=true]')`,'right');await ui.waitFor(`[...document.querySelectorAll('.n-dropdown-option-body')].some(e=>e.textContent.trim()==='定位到源码')`,'existing context menu');await capture('installed-v133-outline-'+mode+'-'+width+'.jpg');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await ui.key('Escape','Escape',27)}await send('Emulation.clearDeviceMetricsOverride',{})
  }
  for(const i of [4,5,6,7])mark(i);r.viewportWidths=[1280,800]
  r.otherDraftsPreserved=await evaluate(`window.__v133Prior.every(p=>${store}.tabs.some(t=>t.id===p.id&&t.path===p.path&&t.content===p.content&&t.isDirty))`);assert.equal(r.otherDraftsPreserved,true);assert.equal(await evaluate(`${store}.tabs.some(t=>(${key.toString()})(t.path).startsWith(${q(key(folder))})&&t.isDirty)`),false);r.disposableDraftsExplicitlySaved=true
  r.inputTrace=await evaluate('window.__v133Trace');r.runtimeErrors=await evaluate('window.__v133Errors');r.errorOverlay=await evaluate('!!document.querySelector("#crash-screen,.global-error-overlay,.startup-fatal-screen,.route-error-fallback")');assert.deepEqual(r.runtimeErrors,[]);mark(8)
  outputs.unshift([outlineContinuityOutputFiles[0],Buffer.from(JSON.stringify(observations,null,2))]);for(const[fileName,bytes]of outputs){await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});r.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
  r.status='passed';validateInstalledOutlineContinuity(r,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});assertOutlineContinuityOutputBytes(r,name=>outputs.find(([n])=>n===name)[1])
 }catch(error){failure=error;r.status='failed';r.failure=String(error.stack||error);r.failureUI=await evaluate('({hash:location.hash,body:document.body.innerText.slice(-6000)})').catch(()=>null);await capture('installed-v133-continuity-failure.jpg').catch(()=>{})}
 finally{await send('Emulation.clearDeviceMetricsOverride',{}).catch(()=>{});await fs.writeFile(path.join(output,'installed-v133-continuity-workflow.json'),JSON.stringify(r,null,2)+'\n')}
 if(failure)throw failure
}
