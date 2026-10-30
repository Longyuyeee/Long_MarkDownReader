import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {installedMarkdownValueExpression} from './installed-markdown-observation.mjs'
import {linkSourceText,linkTargetText,linkSourceAddition,linkTargetAddition,linkSourceDraft,linkTargetDraft,linkPlainDraft} from './link-source-fixture.mjs'
import {linkSourceReturnChecks,linkSourceReturnOutputFiles,validateInstalledLinkSourceReturn,assertLinkSourceReturnOutputBytes} from './installed-v1-3-14-evidence.mjs'
export const linkSourcePathKey=p=>String(p||'').replaceAll('\\','/').replace('//?/','').toLowerCase()
const q=JSON.stringify,sha=b=>crypto.createHash('sha256').update(b).digest('hex'),key=linkSourcePathKey
export const linkSourceLibrarySelector='[data-ui-shell="library-editor"]'
export const linkSourceRefreshSelector='button[data-app-tooltip="刷新列表"],button[title="刷新列表"]'
export function recordLinkSourceInput(){
 window.__v1314Trace=[]
 let keyboardEventIndex=-1
 for(const type of ['click','pointerdown','keydown','input'])document.addEventListener(type,event=>{
  const entry={type,trusted:event.isTrusted}
  if(type==='keydown')Object.assign(entry,{key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey})
  if(!event.isTrusted&&type==='click')Object.assign(entry,{editorCommand:event.target.closest?.('#vditor-lib .vditor-toolbar [data-type="undo"],#vditor-lib .vditor-toolbar [data-type="redo"]')?.getAttribute('data-type'),keyboardEventIndex})
  window.__v1314Trace.push(entry)
  if(event.isTrusted&&type==='keydown')keyboardEventIndex=window.__v1314Trace.length-1
 },true)
}
export async function runInstalledV1314LinkSourceReturnWorkflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.equal(appVersion,'1.3.14');assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'000-v1314-links-'+crypto.randomUUID()),A=path.join(folder,'A.md'),B=path.join(folder,'B.md'),C=path.join(folder,'C.json'),D=path.join(folder,'D.txt'),E=path.join(folder,'E.md'),renamed=path.join(folder,'改名来源.md')
 const ui=nativeUserInput({send,evaluate},{timeoutMs:45000}),store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`,source='#vditor-lib .vditor-wysiwyg > pre'
 const r={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-link-source-return-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],outputs:[],viewportWidths:[]},observations={},outputs=[]
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),mark=i=>{r.checks.push({id:linkSourceReturnChecks[i],status:'passed'});observations[linkSourceReturnChecks[i]]=true}
 const samePath=(expression,p)=>`(${key.toString()})(${expression})===${q(key(p))}`,tabFor=p=>`${store}.tabs.find(t=>${samePath('t.path',p)})`
 const visible=s=>`!!document.querySelector(${q(s)})?.getClientRects().length`,active=p=>samePath(`${store}.activeTabId`,p)
 const editor=installedMarkdownValueExpression
 const value=()=>evaluate(editor),draft=p=>evaluate(`${tabFor(p)}?.content`)
 const readyMarkdown=()=>ui.waitFor(String.raw`(() => {const value=${editor},tab=${store}.tabs.find(t=>t.id===${store}.activeTabId),normal=s=>s.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trimEnd();return typeof value==='string'&&typeof tab?.content==='string'&&normal(value)===normal(tab.content)})()`,'current Markdown loaded')
 const open=async(p,anyMode=false)=>{await navigate('#/library?path='+encodeURIComponent(p),linkSourceLibrarySelector,'link source '+path.basename(p));await ui.waitFor(active(p),'current link document');if(p.endsWith('.md')){await ui.waitFor(visible(anyMode?'#vditor-lib .vditor-content':source),'Markdown source visible');await readyMarkdown();await pause(220)}}
 const menu=()=>ui.click('[data-testid=library-document-menu]')
 const back=async p=>{await menu();await ui.click('[data-testid=library-link-source-return]');await ui.waitFor(active(p),'link source active');await ui.waitFor(`document.activeElement===document.querySelector(${q(source)})`,'returned source focused');await pause(200)}
 const focus=()=>ui.clickTarget(`document.querySelector(${q(source)})?.lastElementChild`)
 const append=async text=>{await focus();await ui.key('End','End',35,2);await send('Input.insertText',{text});await pause(1000)}
 const exact=async text=>{await ui.waitFor(`${editor}===${q(text)}&&${store}.tabs.find(t=>t.id===${store}.activeTabId)?.content===${q(text)}`,'Markdown draft and editor agree')}
 const point=()=>evaluate(`(() => {const root=document.querySelector(${q(source)}),s=getSelection(),offset=(n,o)=>{if(!n||!root.contains(n))return null;const a=document.createRange();a.selectNodeContents(root);a.setEnd(n,o);return a.toString().length};return {top:root.scrollTop,left:root.scrollLeft,anchor:offset(s?.anchorNode,s?.anchorOffset),focus:offset(s?.focusNode,s?.focusOffset),selected:s?.toString()}})()`)
 const same=(a,b)=>{assert.equal(a.anchor,b.anchor);assert.equal(a.focus,b.focus);assert.equal(a.selected,b.selected);assert.ok(Math.abs(a.top-b.top)<3,JSON.stringify({actual:a,expected:b}));assert.ok(Math.abs(a.left-b.left)<3)}
 const link=async(name,p)=>{await ui.clickTarget(`[...document.querySelectorAll('#vditor-lib a[href]')].filter(e=>e.getAttribute('href')===${q(name)}).at(-1)`);await ui.waitFor(active(p),'linked file active');if(p.endsWith('.md'))await readyMarkdown();await pause(220)}
 const closeMenu=async()=>{if(await evaluate(visible('.document-menu-content')))await menu()}
 let failure
 try{
  await evaluate(`window.__v1314Prior=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}));(${recordLinkSourceInput.toString()})();window.__v1314Errors=[];window.addEventListener('error',e=>window.__v1314Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v1314Errors.push(String(e.reason)))`)
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'.v119-installed-owner'),'owned link return fixture')
  for(const[p,text]of [[A,linkSourceText],[B,linkTargetText]])await fs.writeFile(p,'\uFEFF'+text.replaceAll('\n','\r\n'))
  await fs.writeFile(C,'{"readonly":true}\n');await fs.writeFile(D,'文本目标\n保留原文。\n');await fs.writeFile(E,linkSourceText)
  await open(A,true);await ui.click('#tab-files');await ui.click(linkSourceRefreshSelector);await menu();await ui.clickText('.mode-toggle button','所见');await closeMenu();await ui.waitFor(visible(source),'WYSIWYG source');await readyMarkdown();await pause(250);const sourceBaseline=await value();assert.equal(sourceBaseline.trimEnd(),linkSourceText.trimEnd())
  await append(linkSourceAddition);await exact(linkSourceDraft);for(let i=0;i<4;i++)await ui.key('ArrowLeft','ArrowLeft',37,8);const origin=await point();assert.ok(origin.top>0)
  await link('B.md',B);await ui.waitFor(visible(source),'target Markdown');const targetBaseline=await value();assert.equal(targetBaseline.trimEnd(),linkTargetText.trimEnd());await append(linkTargetAddition);await exact(linkTargetDraft)
  await ui.key('z','KeyZ',90,2);await exact(targetBaseline);await ui.key('y','KeyY',89,2);await exact(linkTargetDraft)
  await back(A);same(await point(),origin);await exact(linkSourceDraft);r.positionExact=true;mark(0)
  await ui.key('z','KeyZ',90,2);await exact(sourceBaseline);await ui.key('y','KeyY',89,2);await exact(linkSourceDraft);assert.equal(await draft(B),linkTargetDraft);r.bothDraftsPreserved=r.undoRedoExact=true;mark(1)
  await fs.chmod(C,0o444);await link('C.json',C);await ui.waitFor(`document.querySelector('.json-workspace')?.dataset.loading==='false'`,'structured readonly target');assert.equal(await evaluate(`document.querySelector('.json-workspace .cm-content').cmTile.root.view.state.readOnly`),true);await back(A);await exact(linkSourceDraft);await fs.chmod(C,0o666)
  await link('D.txt',D);await ui.fill('.text-workspace .cm-content',linkPlainDraft);await ui.waitFor(`${tabFor(D)}?.content===${q(linkPlainDraft)}`,'text draft captured');await back(A);await open(D);assert.equal(await evaluate(`document.querySelector('.text-workspace .cm-content').cmTile.root.view.state.doc.toString()`),linkPlainDraft);await ui.click('.text-workspace .cm-content');await ui.key('s','KeyS',83,2);await ui.waitFor(`${tabFor(D)}?.isDirty===false`,'text explicitly saved');assert.equal(await fs.readFile(D,'utf8'),linkPlainDraft);r.linksToStructuredAndText=true;mark(2)
  await open(A);await ui.click('#tab-links');await ui.clickTarget(`[...document.querySelectorAll('.relation-list .relation-note')].find(e=>e.textContent.trim()==='B')`);await ui.waitFor(active(B),'wiki target');await back(A);await exact(linkSourceDraft);await ui.click('#tab-files');r.wikiExact=true;mark(3)
  await open(E);await link('B.md',B);await ui.clickTarget(`[...document.querySelectorAll('[data-drop-path]')].find(e=>(${key.toString()})(e.dataset.dropPath)===${q(key(E))})`,'right');await ui.clickTarget(`[...document.querySelectorAll('.n-dropdown-option-body__label')].find(e=>e.getClientRects().length&&e.textContent.trim().startsWith('重命名'))`);await ui.fill('#library-rename-input input','改名来源.md');await ui.clickText('.n-dialog__action button','更新名称');await ui.waitFor(`${store}.tabs.some(t=>${samePath('t.path',renamed)})`,'source path follows actual rename');await back(renamed);assert.equal((await value()).trimEnd(),linkSourceText.trimEnd());r.renamedExact=true;mark(4)
  await link('B.md',B);const absent=path.join(folder,'暂离.md');await fs.rename(renamed,absent);await menu();await ui.click('[data-testid=library-link-source-return]');await pause(250);assert.equal(await evaluate(active(B)),true);assert.equal(await value(),linkTargetDraft);await fs.rename(absent,renamed);await back(renamed);r.missingSourceRetryExact=true;mark(5)
  await link('B.md',B);await open(renamed);await menu();await ui.clickText('.tab-actions button','重新读取文件');await closeMenu();await pause(300);await open(B);await menu();assert.equal(await evaluate(visible('[data-testid=library-link-source-return]')),false);await closeMenu()
  await open(renamed);await link('B.md',B);const title=await evaluate(`${tabFor(renamed)}.title`);await ui.clickTarget(`[...document.querySelectorAll('.close-tab')].find(e=>e.getAttribute('aria-label')===${q('关闭标签：'+title)})`);await ui.waitFor(`!${store}.tabs.some(t=>${samePath('t.path',renamed)})`,'source tab closed');await menu();assert.equal(await evaluate(visible('[data-testid=library-link-source-return]')),false);await closeMenu();r.closedAndReloadInvalidated=true;mark(6)
  await fs.chmod(renamed,0o444);await open(renamed);await link('B.md',B);await back(renamed);assert.equal((await value()).trimEnd(),linkSourceText.trimEnd());assert.equal(await fs.readFile(renamed,'utf8'),linkSourceText);await fs.chmod(renamed,0o666);r.readOnlyExact=true;mark(7)
  for(const width of [1280,800]){await send('Emulation.setDeviceMetricsOverride',{width,height:width===800?640:820,deviceScaleFactor:1,mobile:false});await open(A);await link('B.md',B);await menu();await ui.waitFor(visible('[data-testid=library-link-source-return]'),'window return entry');await pause(350);await capture('installed-v1314-links-'+width+'.jpg');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await ui.click('[data-testid=library-link-source-return]');await ui.waitFor(active(A),'source at current window');await exact(linkSourceDraft)}
  await send('Emulation.clearDeviceMetricsOverride',{});r.viewportWidths=[1280,800];r.viewportExact=true;mark(8)
  for(const[p,text]of [[A,linkSourceDraft],[B,linkTargetDraft]]){await open(p);await focus();await ui.key('s','KeyS',83,2);await ui.waitFor(`${tabFor(p)}?.isDirty===false`,'Markdown explicitly saved');assert.equal(await fs.readFile(p,'utf8'),'\uFEFF'+text.replaceAll('\n','\r\n'))}
  r.otherDraftsPreserved=await evaluate(`window.__v1314Prior.every(p=>${store}.tabs.some(t=>t.id===p.id&&t.path===p.path&&t.content===p.content&&t.isDirty))`);assert.equal(r.otherDraftsPreserved,true);assert.equal(await evaluate(`${store}.tabs.some(t=>(${key.toString()})(t.path).startsWith(${q(key(folder))})&&t.isDirty)`),false);r.disposableDraftsExplicitlySaved=true
  r.inputTrace=await evaluate('window.__v1314Trace');r.runtimeErrors=await evaluate('window.__v1314Errors');r.errorOverlay=await evaluate('!!document.querySelector("#crash-screen,.global-error-overlay,.startup-fatal-screen,.route-error-fallback")');assert.deepEqual(r.runtimeErrors,[])
  outputs.push([linkSourceReturnOutputFiles[0],Buffer.from(JSON.stringify(observations,null,2))]);for(const[p,i]of [[A,1],[B,2],[D,3]])outputs.push([linkSourceReturnOutputFiles[i],await fs.readFile(p)])
  for(const[fileName,bytes]of outputs){await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});r.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
  r.status='passed';validateInstalledLinkSourceReturn(r,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});assertLinkSourceReturnOutputBytes(r,name=>outputs.find(([n])=>n===name)[1])
 }catch(error){failure=error;r.status='failed';r.failure=String(error.stack||error);r.failureUI=await evaluate('({hash:location.hash,focused:document.activeElement?.outerHTML.slice(0,300),body:document.body.innerText.slice(-6000)})').catch(()=>null);await capture('installed-v1314-links-failure.jpg').catch(()=>{})}
 finally{await send('Emulation.clearDeviceMetricsOverride',{}).catch(()=>{});for(const p of [C,renamed])await fs.chmod(p,0o666).catch(()=>{});await fs.writeFile(path.join(output,'installed-v1314-links-workflow.json'),JSON.stringify(r,null,2)+'\n')}
 if(failure)throw failure
}
