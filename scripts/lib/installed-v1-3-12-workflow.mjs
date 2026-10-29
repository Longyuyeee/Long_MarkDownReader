import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {positionSource,positionDraft} from './structured-source-position-fixture.mjs'
import {structureNavigationChecks,structureNavigationOutputFiles,validateInstalledStructureNavigation,assertStructureNavigationOutputBytes} from './installed-v1-3-12-evidence.mjs'
const q=JSON.stringify,sha=b=>crypto.createHash('sha256').update(b).digest('hex'),key=p=>String(p||'').replaceAll('\\','/').replace('//?/','').toLowerCase()
export async function runInstalledV1312StructureNavigationWorkflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.equal(appVersion,'1.3.12');assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'000-v1312-navigation-'+crypto.randomUUID()),ui=nativeUserInput({send,evaluate},{timeoutMs:45000}),store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
 const r={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-structure-navigation-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],modes:[],outputs:[],viewportWidths:[]},observations={},outputs=[]
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),mark=i=>{r.checks.push({id:structureNavigationChecks[i],status:'passed'});observations[structureNavigationChecks[i]]=true}
 const visible=selector=>`!!document.querySelector(${q(selector)})?.getClientRects().length`
 const option=text=>`[...document.querySelectorAll('.n-dropdown-option-body__label')].find(e=>e.getClientRects().length&&e.textContent.trim()===${q(text)})`
 let failure
 try{
  await evaluate(`window.__v1312Prior=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}));window.__v1312Trace=[];window.__v1312Errors=[];for(const type of ['click','pointerdown','keydown','input'])document.addEventListener(type,e=>window.__v1312Trace.push({type,trusted:e.isTrusted}),true);window.addEventListener('error',e=>window.__v1312Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v1312Errors.push(String(e.reason)))`)
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'.v119-installed-owner'),'owned structure navigation fixture')
  for(const mode of ['json','yaml','xml','toml']){
   const file=path.join(folder,mode+'.'+mode),other=path.join(folder,mode+'-other.'+mode),root='.'+mode+'-workspace',source=root+' .cm-content',view=`document.querySelector(${q(source)}).cmTile.root.view`,entry={mode}
   const filter=root+(mode==='json'?' input[aria-label="筛选字段路径"]':mode==='yaml'?' input[aria-label="筛选 YAML 结构提纲"]':' aside input')
   const row=root+' [data-outline-node*="field002"]',tree=root+' .tree-rows',body=()=>evaluate(`${view}.state.doc.toString()`)
   const fresh=()=>ui.waitFor(`document.querySelector('${root}')?.dataset.loading==='false'&&document.querySelector('${root}')?.dataset.analysisCurrent==='true'`,'current structure '+mode)
   const exact=text=>ui.waitFor(`${view}.state.doc.toString()===${q(text)}`,'source content exact')
   const open=async target=>{await navigate('#/library?path='+encodeURIComponent(target),root,'structure source '+mode);await fresh()}
   const inspector=async()=>{await pause(180);if(!await evaluate(visible(filter)))await ui.clickText(root+' header button',mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题');await ui.waitFor(visible(filter),'structure filter visible')}
   const point=()=>evaluate(`({ranges:${view}.state.selection.ranges.map(r=>({anchor:r.anchor,head:r.head})),mainIndex:${view}.state.selection.mainIndex,top:${view}.scrollDOM.scrollTop,left:${view}.scrollDOM.scrollLeft})`)
   const same=(a,b)=>{assert.deepEqual(a.ranges,b.ranges);assert.equal(a.mainIndex,b.mainIndex);assert.ok(Math.abs(a.top-b.top)<3,JSON.stringify({actual:a,expected:b}));assert.ok(Math.abs(a.left-b.left)<3)}
   const originAtEnd=async()=>{await ui.click(source);await ui.key('End','End',35,2);for(let i=0;i<4;i++)await ui.key('ArrowLeft','ArrowLeft',37,8);await pause(180);const result=await point();assert.ok(result.top>0);return result}
   const locate=async()=>{await ui.click(row);await ui.waitFor(`document.activeElement===document.querySelector('${source}')`,'outline focuses source');await pause(180);assert.ok((await evaluate(`${view}.state.sliceDoc(${view}.state.selection.main.from,${view}.state.selection.main.to)`)).includes(mode==='json'?'我的草稿':'草稿')||await evaluate(`${view}.state.readOnly`))}
   const menu=async()=>{await ui.click('[data-testid=library-document-menu]');await ui.waitFor(visible('[data-testid=library-search-return]'),'structure return in document menu');assert.equal(await evaluate(`document.querySelector('[data-testid=library-search-return]').textContent.trim()`),'返回上次浏览位置')}
   const back=async(treeFocus=false)=>{await menu();await ui.click('[data-testid=library-search-return]');await ui.waitFor(`document.activeElement===document.querySelector(${q(treeFocus?tree:source)})`,'return restores expected focus');await pause(180)}
   await fs.writeFile(file,'\uFEFF'+positionSource(mode).replaceAll('\n','\r\n'));await fs.writeFile(other,positionSource(mode,'另一份资料'))
   const draft=positionDraft(mode);await open(file);await ui.fill(source,draft);await exact(draft);await fresh();await inspector();await ui.fill(filter,'field00');await pause(180)
   const origin=await originAtEnd();await locate();await back();same(await point(),origin);assert.equal(await evaluate(`document.querySelector(${q(filter)}).value`),'field00');entry.outlineReturnExact=true;entry.filterExact=true
   await locate();await ui.key('Home','Home',36,2);await ui.key('Enter','Enter',13);await exact('\n'+draft);await fresh();await back();assert.deepEqual((await point()).ranges,origin.ranges.map(range=>({anchor:range.anchor+1,head:range.head+1})));entry.mappedReturnExact=true
   await ui.key('z','KeyZ',90,2);await exact(draft);await ui.key('z','KeyZ',90,2);await exact(positionSource(mode));await ui.key('y','KeyY',89,2);await exact(draft);await fresh();entry.undoRedoExact=true
   if(mode==='json'){
    await ui.fill(filter,'');await pause(180);const sourceOrigin=await originAtEnd();await ui.clickText(root+' header button','树形');await ui.waitFor(visible(tree),'JSON tree visible')
    await ui.click(root+' button[aria-label="折叠全部节点"]');assert.equal(await evaluate(`document.querySelector('${tree} .tree-row').getAttribute('aria-expanded')`),'false')
    await ui.clickTarget(`document.querySelector('${tree} .tree-row')`,'right');await ui.clickTarget(option('定位到源码'));await ui.waitFor(visible(source),'tree locates source');await back(true);assert.equal(await evaluate(`document.querySelector('${tree} .tree-row').getAttribute('aria-expanded')`),'false');entry.collapsePreservedExact=true
    await ui.click(root+' button[aria-label="展开全部节点"]');await ui.hoverTarget(`document.querySelector('${tree}')`)
    const bounds=await evaluate(`(() => {const r=document.querySelector('${tree}').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseWheel',...bounds,deltaX:0,deltaY:1300});await pause(200)
    const label=await evaluate(`(() => {const box=document.querySelector('${tree}').getBoundingClientRect();return [...document.querySelectorAll('${tree} .tree-row')].find(e=>{const r=e.getBoundingClientRect();return r.top>box.top+20&&r.bottom<box.bottom&&e.querySelector('strong')?.textContent.startsWith('field')})?.querySelector('strong').textContent})()`);assert.ok(label)
    const leaf=`[...document.querySelectorAll('${tree} .tree-row')].find(e=>e.querySelector('strong')?.textContent===${q(label)})`
    await ui.clickTarget(leaf);await pause(150);const top=await evaluate(`document.querySelector('${tree}').scrollTop`);await ui.clickTarget(leaf,'right');await ui.clickTarget(option('定位到源码'));await ui.waitFor(visible(source),'tree node source visible');await back(true)
    assert.equal(await evaluate(`document.querySelector('${tree} .tree-row.selected strong')?.textContent`),label);assert.ok(Math.abs(await evaluate(`document.querySelector('${tree}').scrollTop`)-top)<3);await ui.clickText(root+' header button','源码');await ui.waitFor(visible(source),'source restored after tree');await pause(180);same(await point(),sourceOrigin);entry.treeReturnExact=true
    await ui.clickText(root+' header button','树形');await ui.clickTarget(leaf,'right');await ui.clickTarget(option('定位到源码'));await ui.waitFor(visible(source),'source before invalid edit');await ui.click(source);await ui.key('End','End',35,2);await send('Input.insertText',{text:'!'});await exact(draft+'!');await fresh();await back();assert.equal(await evaluate(visible(tree)),false);assert.equal(await body(),draft+'!');await ui.key('z','KeyZ',90,2);await exact(draft);await fresh();entry.invalidTreeFallbackExact=true
   }
   await inspector();await ui.fill(filter,'field00');await pause(160);await originAtEnd();await locate();await open(other);await inspector();await ui.click('[data-testid=library-document-menu]');assert.equal(await evaluate(visible('[data-testid=library-search-return]')),false);await ui.click('[data-testid=library-document-menu]');assert.equal(await body(),positionSource(mode,'另一份资料'));entry.ownerResetExact=true
   await open(file);await inspector();assert.equal(await evaluate(`document.querySelector(${q(filter)}).value`),'field00')
   for(const width of [1280,800]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:width===800?640:820,deviceScaleFactor:1,mobile:false});await pause(300);await inspector();const before=await originAtEnd();await locate();await menu();await pause(350);await capture('installed-v1312-navigation-'+mode+'-'+width+'.jpg');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await ui.click('[data-testid=library-search-return]');await ui.waitFor(`document.activeElement===document.querySelector('${source}')`,'window return focuses source');await pause(180);same(await point(),before)
   }
   await send('Emulation.clearDeviceMetricsOverride',{});entry.viewportExact=true
   await ui.click(source);await ui.key('s','KeyS',83,2);await ui.waitFor(`document.querySelector('${root}')?.dataset.dirty==='false'&&document.querySelector('${root}')?.dataset.saving==='false'`,'explicit structure source save');assert.equal(await fs.readFile(file,'utf8'),'\uFEFF'+draft.replaceAll('\n','\r\n'));entry.explicitSaveExact=true
   await fs.chmod(other,0o444);await open(other);await inspector();await ui.fill(filter,'field00');await pause(180);assert.equal(await evaluate(`${view}.state.readOnly`),true);const readonlyOrigin=await originAtEnd();await locate();await back();same(await point(),readonlyOrigin);await ui.key('Delete','Delete',46);assert.equal(await body(),positionSource(mode,'另一份资料'));assert.equal(await fs.readFile(other,'utf8'),positionSource(mode,'另一份资料'));await fs.chmod(other,0o666);entry.readOnlyExact=true
   const bytes=await fs.readFile(file);outputs.push([structureNavigationOutputFiles[1+r.modes.length],bytes]);r.modes.push(entry);mark(r.modes.length-1)
  }
  for(const i of [4,5,6,7,8])mark(i);r.viewportWidths=[1280,800]
  r.otherDraftsPreserved=await evaluate(`window.__v1312Prior.every(p=>${store}.tabs.some(t=>t.id===p.id&&t.path===p.path&&t.content===p.content&&t.isDirty))`);assert.equal(r.otherDraftsPreserved,true);assert.equal(await evaluate(`${store}.tabs.some(t=>(${key.toString()})(t.path).startsWith(${q(key(folder))})&&t.isDirty)`),false);r.disposableDraftsExplicitlySaved=true
  r.inputTrace=await evaluate('window.__v1312Trace');r.runtimeErrors=await evaluate('window.__v1312Errors');r.errorOverlay=await evaluate('!!document.querySelector("#crash-screen,.global-error-overlay,.startup-fatal-screen,.route-error-fallback")');assert.deepEqual(r.runtimeErrors,[])
  outputs.unshift([structureNavigationOutputFiles[0],Buffer.from(JSON.stringify(observations,null,2))]);for(const[fileName,bytes]of outputs){await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});r.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
  r.status='passed';validateInstalledStructureNavigation(r,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});assertStructureNavigationOutputBytes(r,name=>outputs.find(([n])=>n===name)[1])
 }catch(error){failure=error;r.status='failed';r.failure=String(error.stack||error);r.failureUI=await evaluate('({hash:location.hash,focused:document.activeElement?.outerHTML.slice(0,300),body:document.body.innerText.slice(-6000)})').catch(()=>null);await capture('installed-v1312-navigation-failure.jpg').catch(()=>{})}
 finally{await send('Emulation.clearDeviceMetricsOverride',{}).catch(()=>{});await fs.writeFile(path.join(output,'installed-v1312-navigation-workflow.json'),JSON.stringify(r,null,2)+'\n')}
 if(failure)throw failure
}
