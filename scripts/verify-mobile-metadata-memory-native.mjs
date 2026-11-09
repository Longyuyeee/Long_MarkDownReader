import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {transform} from 'esbuild'
import {mobileAdb as adb,mobileTestPackage as app,connectMobileWebView} from './mobile-native-webview-cdp.mjs'
const [out,stage='final']=process.argv.slice(2);assert.ok(out&&/^[a-z0-9-]+$/.test(stage));await assert.rejects(access(out+'/'+stage+'-native.json'))
const sha=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),baseline=JSON.parse(await readFile(out+'/baseline.json','utf8'))
const build=JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json','utf8')).replace(/^\uFEFF/,''))
const installed=adb('shell','pm','path',app).toString().trim().replace(/^package:/,'');assert.equal(sha(adb('exec-out','cat',installed)),build.sha256)
const names={source:'source-reading-v1.json',text:'text-reading-v1.json',pdf:'pdf-reading-v1.json',recovery:'pdf-annotation-recovery-v1.json',bookmarks:'pdf-bookmarks-v1.json'},original={}
for(const [kind,name]of Object.entries(names)){const bytes=adb('exec-out','run-as',app,'cat','files/'+name);assert.equal(sha(bytes),baseline.files['files/'+name]);original[kind]=bytes;await writeFile(out+'/'+stage+'-original-'+name,bytes)}
const code=(await transform(await readFile('src/mobile/metadataTransport.ts','utf8'),{loader:'ts',format:'cjs',target:'es2020'})).code
const report={stage,time:new Date().toISOString(),scope:'Real API29 x86_64/WebView124 storage IPC with 16 MiB ART heap. CDP input is not physical touch, native IME or TalkBack. Baseline documents, drafts and metadata are restored byte for byte.',build,checks:[],samples:[],screens:[],passed:false}
let c,screen=0
async function connect(){for(let n=0;n<35;n++)try{c=await connectMobileWebView();return}catch(error){if(n===34)throw error;await sleep(200)}}
async function start(){c?.close();c=null;adb('shell','am','force-stop',app);adb('shell','monkey','-p',app,'-c','android.intent.category.LAUNCHER','1');await connect();await sleep(800)}
async function wait(fn,arg){for(let n=0;n<100;n++){if(await c.evaluate(fn,arg))return;await sleep(150)}throw Error('Native UI timeout: '+fn)}
async function helper(){await c.evaluate(code=>{const m={exports:{}};new Function('module','exports',code)(m,m.exports);window.__mdProbe={calls:0,max:0,t:m.exports.createMetadataTransport(async p=>{window.__mdProbe.calls++;window.__mdProbe.max=Math.max(window.__mdProbe.max,JSON.stringify(p).length);return window.__TAURI_INTERNALS__.invoke('plugin:mobile-storage|execute',{payload:p})})}},code)}
async function sample(label,job){
 let pending=true;const task=job().finally(()=>{pending=false});const sampler=(async()=>{let n=0;do{const text=adb('shell','dumpsys','meminfo',app).toString();const file=stage+'-'+label+'-memory-'+n+++'.txt';await writeFile(out+'/'+file,text);report.samples.push({label,file,dalvikHeapLine:text.split(/\r?\n/).find(line=>/^\s+Dalvik Heap\s/.test(line))});if(pending)await sleep(700)}while(pending)})();try{return await task}finally{await sampler}
}
async function put(kind,bytes,label){const file=stage+'-'+label+'-'+names[kind];await writeFile(out+'/'+file,bytes);const target='/data/local/tmp/longedit-metadata-'+stage+'-'+kind+'.bin';adb('push',out+'/'+file,target);adb('shell','run-as',app,'cp',target,'files/'+names[kind])}
async function shot(label){await c.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true)))));await sleep(750);const bytes=adb('exec-out','screencap','-p'),file=stage+'-'+ ++screen+'-'+label+'.png';await writeFile(out+'/'+file,bytes);report.screens.push({file,sha256:sha(bytes),ui:await c.evaluate(()=>({text:document.body.innerText,viewport:[innerWidth,innerHeight],pager:document.querySelector('.source-pager')?.getBoundingClientRect().toJSON(),dialog:document.querySelector('.source-page-dialog')?.getBoundingClientRect().toJSON(),error:document.querySelector('.reading-position-error')?.getBoundingClientRect().toJSON(),scroll:document.querySelector('.source-page-content')?.scrollTop}))})}
async function click(name){await wait(name=>[...document.querySelectorAll('button')].some(e=>e.checkVisibility()&&!e.disabled&&(e.getAttribute('aria-label')===name||e.textContent.trim()===name)),name);await c.evaluate(name=>[...document.querySelectorAll('button')].find(e=>e.checkVisibility()&&!e.disabled&&(e.getAttribute('aria-label')===name||e.textContent.trim()===name)).click(),name)}
try{
 await start();report.pid=adb('shell','pidof',app).toString().trim();await helper()
 if(stage!=='cold-resume'){
 report.guard=await c.evaluate(async()=>{try{await window.__TAURI_INTERNALS__.invoke('plugin:mobile-storage|execute',{payload:{op:'writeSourceReading',content:'x'.repeat(5*1024*1024+1),expectedRevision:'missing'}});return{resolved:true}}catch(error){return{resolved:false,error:String(error)}}})
 assert.equal(report.guard.resolved,false);assert.match(report.guard.error,/WRITE_FAILED:.*5 MiB/);assert.equal(sha(adb('exec-out','run-as',app,'cat','files/'+names.source)),sha(original.source))
 report.checks.push('The old exact oversized direct probe now returns the 5 MiB error before Java forwarding; source bytes remain exact')
 report.large=[]
 for(const [kind,name]of Object.entries(names)){
  const result=await sample(kind,()=>c.evaluate(async({kind,original})=>{
   const t=window.__mdProbe.t,before=await t.read(kind),root=JSON.parse(original),limit=kind==='bookmarks'?512*1024:5*1024*1024
   root.memoryProbe='文😀'.repeat(Math.floor((limit-new TextEncoder().encode(JSON.stringify(root)).length-100)/7))
   let content=JSON.stringify(root);content+=' '.repeat(limit-new TextEncoder().encode(content).length)
   const time=performance.now(),saved=await t.write(kind,content,before.revision),read=await t.read(kind)
   if(read.content!==content||saved.content!==content||saved.revision!==read.revision)throw Error('Large roundtrip mismatch')
   return{kind,size:new TextEncoder().encode(content).length,revision:saved.revision,elapsed:performance.now()-time,calls:window.__mdProbe.calls,maxPayload:window.__mdProbe.max,foreignPreserved:JSON.stringify(JSON.parse(read.content).records??JSON.parse(read.content).drafts)===JSON.stringify(root.records??root.drafts)}
  },{kind,original:original[kind].toString()}))
  assert.equal(result.size,kind==='bookmarks'?512*1024:5*1024*1024);assert.equal(result.foreignPreserved,true);assert.ok(result.maxPayload<23000);assert.equal(sha(adb('exec-out','run-as',app,'cat','files/'+name)),result.revision);report.large.push(result)
  // Restore through the same verified protocol rather than a default/empty state.
  await c.evaluate(async({kind,content})=>{const t=window.__mdProbe.t,before=await t.read(kind);await t.write(kind,content,before.revision)},{kind,content:original[kind].toString()});assert.deepEqual(adb('exec-out','run-as',app,'cat','files/'+name),original[kind])
 }
 report.checks.push('All five real stores roundtrip exact maximum-size envelopes with Chinese/emoji and foreign fields; each outgoing frontend payload remains below 23,000 characters')
 const partial=await c.evaluate(async()=>{
  const invoke=p=>window.__TAURI_INTERNALS__.invoke('plugin:mobile-storage|execute',{payload:p}),before=await window.__mdProbe.t.read('source'),bytes=new TextEncoder().encode(before.content),digest=before.revision
  const a=await invoke({op:'metadataBeginWrite',kind:'source',size:bytes.length,revision:digest,expectedRevision:digest})
  await invoke({op:'metadataWriteChunk',transferId:a.transferId,offset:0,base64:btoa(String.fromCharCode(...bytes.subarray(0,1)))})
  let refused=false;try{await invoke({op:'metadataCommit',transferId:a.transferId})}catch{refused=true}
  await invoke({op:'metadataEnd',transferId:a.transferId});return refused
 });assert.equal(partial,true);assert.deepEqual(adb('exec-out','run-as',app,'cat','files/'+names.source),original.source)
 report.checks.push('Incomplete native transfer cannot commit or replace the original')
 }
 // Use a large record in the actual bundled application, beyond the helper probe.
 await c.evaluate(async content=>{const t=window.__mdProbe.t,before=await t.read('source'),root=JSON.parse(content);root.memoryProbe='界😀'.repeat(700000);await t.write('source',JSON.stringify(root),before.revision)},original.source.toString())
 await start();await wait(()=>!!document.querySelector('.continue-card'));await c.evaluate(()=>document.querySelector('.continue-card').click());await wait(()=>!!document.querySelector('.source-pager'))
 const sourceId=JSON.stringify(['local','NativeSourcePosition-20261030.md']),expectedPoint=JSON.parse(original.source).records[sourceId]
 // A visible pager is not a restoration acknowledgement for a large envelope.
 await wait(query=>document.querySelector('[aria-label="查找文档内容"]')?.value===query,expectedPoint.query)
 await sleep(650)
 assert.ok(Math.abs(await c.evaluate(()=>document.querySelector('.source-page-content').scrollTop)-expectedPoint.scroll)<3,'Wait for the stored anchor, not just initial render')
 report.coldResume={expected:expectedPoint,actual:await c.evaluate(()=>({scroll:document.querySelector('.source-page-content').scrollTop,query:document.querySelector('[aria-label="查找文档内容"]').value,pager:document.querySelector('.source-jump-opener').textContent}))}
 assert.equal(await c.evaluate(()=>!!document.querySelector('.reading-position-error')),false);await shot('large-record-reader')
 const moved=await c.evaluate(()=>{const e=document.querySelector('.source-page-content'),before=e.scrollTop;e.scrollTop+=80;return{before,after:e.scrollTop}})
 assert.ok(moved.after>moved.before+50)
 for(let n=0;n<100;n++){if(Math.abs(JSON.parse(adb('exec-out','run-as',app,'cat','files/'+names.source)).records[sourceId].scroll-moved.after)<2)break;if(n===99)throw Error('Bundled reader save not confirmed');await sleep(150)}
 let large=adb('exec-out','run-as',app,'cat','files/'+names.source),saved=JSON.parse(large)
 assert.equal(saved.memoryProbe,'界😀'.repeat(700000));assert.equal(saved.records[sourceId].future,JSON.parse(original.source).records[sourceId].future);report.savedPoint=saved.records[sourceId]
 report.checks.push('The bundled production reader cold-opens a large native record and updates its real reading point while retaining the foreign large field')
 await put('source',Buffer.from('{"version":2,"records":{}}'),'future-version')
 await c.evaluate(()=>{document.querySelector('.source-page-content').scrollTop+=80});await wait(()=>!!document.querySelector('.reading-position-error'));await shot('save-failed')
 assert.equal(JSON.parse(adb('exec-out','run-as',app,'cat','files/'+names.source)).version,2)
 await put('source',large,'restore-valid-large');await click('重试记录位置');await wait(()=>!document.querySelector('.reading-position-error'));await sleep(1000)
 assert.equal(JSON.parse(adb('exec-out','run-as',app,'cat','files/'+names.source)).memoryProbe,'界😀'.repeat(700000))
 report.checks.push('A future-version record blocks auto-overwrite while reading stays usable; restoring the valid record permits explicit retry of the pending reading point')
 await c.evaluate(()=>{const e=document.querySelector('.source-jump-opener');e.focus({preventScroll:true});e.click()});await wait(()=>!!document.querySelector('.source-page-dialog'));await shot('jump')
 await click('分段阅读说明');await wait(()=>!!document.querySelector('.mobile-help-dialog'));await shot('help')
 adb('shell','input','keyevent','4');await wait(()=>!!document.querySelector('.source-page-dialog')&&!document.querySelector('.mobile-help-dialog'))
 adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('.source-page-dialog'));assert.equal(await c.evaluate(()=>document.activeElement===document.querySelector('.source-jump-opener')),true)
 // Search is its own child layer and may have been restored from the saved point.
 if(await c.evaluate(()=>!!document.querySelector('[aria-label="关闭文档查找"]'))){await click('关闭文档查找')}
 await c.evaluate(()=>document.querySelector('.document-back-button').click());await wait(()=>!document.querySelector('.source-reader'));await shot('home')
 report.checks.push('Android Back closes Help then the jump dialog, restores opener focus, and a separate document Back returns home')
 await writeFile(out+'/'+stage+'-logcat.txt',adb('logcat','-d','-v','threadtime','--pid='+report.pid))
 // Each cold launch changes PID; inspect all runs after the original failing probe separately.
 report.finalPid=adb('shell','pidof',app).toString().trim();await writeFile(out+'/'+stage+'-ui-logcat.txt',adb('logcat','-d','-v','threadtime','--pid='+report.finalPid))
 assert.doesNotMatch(await readFile(out+'/'+stage+'-logcat.txt','utf8'),/Throwing OutOfMemoryError/)
 assert.doesNotMatch(await readFile(out+'/'+stage+'-ui-logcat.txt','utf8'),/Throwing OutOfMemoryError/)
 report.passed=true
}catch(error){report.failure=String(error.stack||error);if(c)await shot('failure').catch(()=>{});throw error}
finally{
 c?.close();c=null;adb('shell','am','force-stop',app)
 for(const [kind,bytes]of Object.entries(original)){await put(kind,bytes,'finally-restore');assert.deepEqual(adb('exec-out','run-as',app,'cat','files/'+names[kind]),bytes)}
 report.metadataRestored=true;await writeFile(out+'/'+stage+'-native.json',JSON.stringify(report,null,2))
}
console.log(JSON.stringify({out,stage,checks:report.checks.length,passed:report.passed}))
