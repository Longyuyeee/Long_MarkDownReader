import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {readingPdfFixture} from './pdf-reading-fixture.mjs'
import {installedViewLookupExpression} from './installed-view-lookup.mjs'
import {pdfResumeChecks,validateInstalledPdfResume,assertPdfResumeOutputBytes} from './installed-v1-1-37-evidence.mjs'
const q=JSON.stringify,sha=b=>crypto.createHash('sha256').update(b).digest('hex')
export async function runInstalledV1137Workflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.ok(['1.1.37','1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'000-v1137-pdf-'+crypto.randomUUID()),pdf=path.join(folder,'接续.pdf'),note=path.join(folder,'返回.md'),sidecar=pdf+'.annotations.json',store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`,ui=nativeUserInput({send,evaluate},{timeoutMs:60000,stableMs:300}),ready=(e,label)=>ui.waitFor('Boolean('+e+')',label),observed={}
 const report={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-pdf-view-reload-trusted-ui-and-sidecar-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],outputs:[],inputTrace:[],runtimeErrors:[],rendererReloads:0}
 const mark=i=>report.checks.push({id:pdfResumeChecks[i],status:'passed'}),take=async(n,b)=>{const fileName='installed-v1137-'+n;await fs.writeFile(path.join(output,fileName),b,{flag:'wx'});report.outputs.push({fileName,sizeBytes:b.length,sha256:sha(b)})}
 const trace=()=>evaluate(`window.__v1137Trace=[];window.__v1137Errors=[];for(const type of ['click','keydown','input'])document.addEventListener(type,e=>window.__v1137Trace.push({type,trusted:e.isTrusted}),true);window.addEventListener('error',e=>window.__v1137Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v1137Errors.push(String(e.reason)))`)
 const collect=async()=>{report.inputTrace.push(...await evaluate('window.__v1137Trace'));report.runtimeErrors.push(...await evaluate('window.__v1137Errors'))}
 const open=async(extra='')=>{await navigate('#/library?path='+encodeURIComponent(pdf)+extra,'.pdf-view','owned PDF');await ready('document.querySelector(".pdf-view canvas")','rendered PDF');await ui.clickTarget(`[...document.querySelectorAll('.sidebar-switch button')].find(e=>e.textContent.trim().startsWith('批注'))`);await ready('document.querySelector(".annotation-card")','real sidecar annotations')}
 const leave=async()=>{
  await navigate('#/library?path='+encodeURIComponent(note),'#vditor-lib','owned return note')
  // The Markdown editor stays mounted, but hidden, while PDF is active. Its
  // mere presence does not mean the PDF leave/save guard has completed.
  await ready(`!document.querySelector('.pdf-view')&&document.querySelector('#vditor-lib')?.getClientRects().length&&document.querySelector('.document-breadcrumb span')?.textContent.trim()===${q(path.basename(note))}`,'PDF leave guard completed and requested note visible')
 }
 const select=async(selector,index)=>{await ui.click(selector);await ui.key('Home','Home',36);for(let n=0;n<index;n++)await ui.key('ArrowDown','ArrowDown',40);await ui.key('Enter','Enter',13)}
 let failure
 try{
  assert.equal(await evaluate(`${store}.tabs.some(t=>t.isDirty)`),false,'Reload test must run before any retained draft-producing feature tasks')
  await fs.mkdir(folder);const bytes=readingPdfFixture(2);await fs.writeFile(pdf,bytes);await fs.writeFile(note,'# 接续验证返回\n');report.pdfBefore=sha(bytes)
  const annotations=Array.from({length:120},(_,n)=>({id:'resume-'+n,kind:'comment',page:2,color:n%3?'yellow':'blue',rects:[],quote:'',comment:'接续评论 '+n,createdAt:n,updatedAt:n}));await fs.writeFile(sidecar,JSON.stringify({schemaVersion:1,source:{pdfFile:'接续.pdf',size:bytes.length,modifiedAt:1},annotations}));await take('before.json',await fs.readFile(sidecar));await trace();await open()
  await ui.fill('[aria-label="查找批注摘录或评论"]','接续评论');await ui.fill('[aria-label="筛选批注页码"]','2');await select('[aria-label="筛选批注类型"]',3);await select('[aria-label="筛选批注颜色"]',4);await ui.click('[aria-label="选择批注 resume-9"]');await ui.click('[aria-label="选择批注 resume-15"]');await ui.clickTarget(`[...document.querySelectorAll('.annotation-card')].find(e=>e.textContent.trim().endsWith('接续评论 9'))`)
  const point=await evaluate(`(()=>{const r=document.querySelector('.annotation-panel').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:450});await ready(`(()=>{const v=${installedViewLookupExpression(pdf)};return v?.pdfAnnotations?.selection?.includes('resume-9')&&v.pdfAnnotations.scrollTop>100})()`,'persisted nonzero scroll and selection');observed.before=await evaluate(`(${installedViewLookupExpression(pdf)}).pdfAnnotations`);await take('view.json',Buffer.from(JSON.stringify(observed.before,null,2)));mark(0)
  await collect();await send('Page.reload',{});
  // Require a fresh JS realm: the old page can briefly remain queryable after
  // Page.reload acknowledges. Only retry transient context destruction while
  // waiting; never repeat the reload or any user action.
  for(let attempt=0;;attempt++){
   try{await ready(`!('__v1137Trace' in window)&&document.querySelector('#app')?.__vue_app__&&document.querySelector('.pdf-view canvas')&&document.querySelector('.annotation-card.active')?.textContent.trim().endsWith('接续评论 9')`,'fresh renderer restores active PDF annotation');break}
   catch(error){if(attempt>=2||!/Execution context was destroyed|Cannot find context|Inspected target navigated/i.test(String(error)))throw error}
  }
  report.rendererReloads++;await trace();await ready(`document.querySelector('[aria-label="选择批注 resume-9"]')?.checked&&document.querySelector('[aria-label="选择批注 resume-15"]')?.checked`,'restored batch selection');observed.resumed=await evaluate(`({query:document.querySelector('[aria-label="查找批注摘录或评论"]').value,pages:document.querySelector('[aria-label="筛选批注页码"]').value,kind:document.querySelector('[aria-label="筛选批注类型"]').value,color:document.querySelector('[aria-label="筛选批注颜色"]').value,scrollTop:document.querySelector('.annotation-panel').scrollTop})`);for(const k of ['query','pages','kind','color'])assert.equal(observed.resumed[k],observed.before[k]);assert.ok(Math.abs(observed.resumed.scrollTop-observed.before.scrollTop)<2);mark(1);await capture('installed-v1137-resumed.jpg')
  await leave();const deleted=JSON.parse(await fs.readFile(sidecar,'utf8'));deleted.annotations=deleted.annotations.filter(a=>a.id!=='resume-9');await fs.writeFile(sidecar,JSON.stringify(deleted));await open();await ready(`!document.querySelector('.annotation-card.active')&&document.querySelector('[aria-label="选择批注 resume-15"]')?.checked`,'deleted annotation discarded');observed.deleted=true;mark(2)
  await leave();await open('&page=2&annotation=resume-15');await ready(`document.querySelector('.annotation-card.active')?.textContent.includes('接续评论 15')`,'explicit reference focused');observed.reference=await evaluate(`document.querySelector('[aria-label="查找批注摘录或评论"]').value===''&&!document.querySelector('.reading-row input:checked')`);assert.equal(observed.reference,true);mark(3)
  await ui.fill('.annotation-editor textarea','重开后的评论，切换时立即保存');await leave();await ready('document.querySelector("#vditor-lib")','comment saved before route leave');observed.commentSaved=JSON.parse(await fs.readFile(sidecar,'utf8')).annotations.find(a=>a.id==='resume-15').comment==='重开后的评论，切换时立即保存';assert.equal(observed.commentSaved,true);mark(4);await take('after.json',await fs.readFile(sidecar));assert.equal(sha(await fs.readFile(pdf)),report.pdfBefore)
  await open();await ui.fill('[aria-label="查找批注摘录或评论"]','接续评论');await leave();await fs.appendFile(pdf,'\n% v1137 changed source\n');await open();observed.sourceChanged=await evaluate(`document.querySelector('[aria-label="查找批注摘录或评论"]').value===''&&!document.querySelector('.reading-row input:checked')`);assert.equal(observed.sourceChanged,true);mark(5)
  await leave();await fs.writeFile(pdf,bytes);report.pdfAfter=sha(await fs.readFile(pdf));observed.noDirtyNotes=await evaluate(`!${store}.tabs.some(t=>t.isDirty)`);assert.equal(observed.noDirtyNotes,true);await take('observations.json',Buffer.from(JSON.stringify(observed,null,2)));await collect();report.errorOverlay=await evaluate('!!document.querySelector("#runtime-error-notice,.global-error-overlay,.startup-fatal-screen,.route-error-fallback")');mark(6);report.status='passed';validateInstalledPdfResume(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});const raw=new Map(await Promise.all(report.outputs.map(async o=>[o.fileName,await fs.readFile(path.join(output,o.fileName))])));assertPdfResumeOutputBytes(report,n=>raw.get(n))
 }catch(error){failure=error;report.status='failed';report.failure=String(error.stack||error);report.failureUI=await evaluate('({hash:location.hash,body:document.body.innerText.slice(-7000)})').catch(()=>null);await capture('installed-v1137-failure.jpg').catch(()=>{})}
 finally{await fs.writeFile(path.join(output,'installed-v1137-workflow.json'),JSON.stringify(report,null,2)+'\n')}
 if(failure)throw failure
}
