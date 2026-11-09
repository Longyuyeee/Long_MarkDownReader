import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import path from 'node:path'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const {parse,compileScript,compileStyle}=require('@vue/compiler-sfc'),esbuild=require('esbuild')
const freezeMode=process.argv.includes('--freeze-design')
const out=`docs/evidence/mobile-0.1.0/export-result-name-browser-${Date.now()}`
const design='docs/design/mobile-export-result-name-v2'
await mkdir(out);await writeFile(out+'/.gitignore','*\n')
const report={scope:'Production TextExport component with deferred storage replies; not Android IPC, SAF or filesystem verification',nativeAndroidTest:false,checks:[],geometry:[],scans:[],errors:[],passed:false}
const actualName='发给同事-最终核对版😀(1).md'
const source=`
import {createApp,h,ref} from 'vue'
import {ArrowLeft,CircleHelp} from 'lucide-vue-next'
import TextExport from './src/mobile/TextExport.vue'
const snapshot=Object.freeze({rootId:'local',relativePath:'AndroidTask-20261029.md',content:'正在核对手机接收😀\\n先保留这段未保存输入\\n返回后继续写',expectedSignature:null,revision:7,dirty:true,recoveryId:'reply-fixture'})
window.__calls=[]
const busy=ref(false),component=ref(),closed=ref(0)
const storage={preview:false,exportDocument(value){window.__calls.push({identical:value===snapshot,value});return new Promise((resolve,reject)=>{window.__resolve=resolve;window.__reject=message=>reject(Error(message))})}}
window.__back=()=>component.value.back()||(++closed.value,false)
window.__closed=()=>closed.value
createApp({setup(){return()=>h('div',{class:'mobile-app has-document text-document'},h('section',{class:'bottom-sheet text-export-sheet',role:'dialog','aria-modal':'true','aria-label':component.value?.title||'导出文字副本'},[
 h('div',{class:'sheet-heading'},[h('button',{class:'icon-button',disabled:busy.value,'aria-label':component.value?.backLabel||'返回文档',onClick:window.__back},h(ArrowLeft,{size:22})),h('h2',{tabindex:-1},component.value?.title||'导出文字副本'),h('button',{class:'mobile-help-trigger','aria-label':'文字导出说明'},h(CircleHelp,{size:20}))]),
 h(TextExport,{ref:component,storage,snapshot,libraryName:'手机资料库',onBusy:value=>busy.value=value,onClose:()=>closed.value++})
]))}}).mount('#app')`
const bundle=await esbuild.build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'vue-source',setup(build){build.onLoad({filter:/\.vue$/},async args=>{const text=await readFile(args.path,'utf8'),{descriptor}=parse(text,{filename:args.path}),id=createHash('sha256').update(args.path).digest('hex').slice(0,8),compiled=compileScript(descriptor,{id,inlineTemplate:true}),styles=descriptor.styles.map(style=>compileStyle({source:style.content,filename:args.path,id:'data-v-'+id,scoped:style.scoped}).code).join('\n');return{contents:compiled.content.replace('export default','const __component =')+`;__component.__scopeId='data-v-${id}';const style=document.createElement('style');style.textContent=${JSON.stringify(styles)};document.head.append(style);export default __component;`,loader:'ts',resolveDir:path.dirname(args.path)}})}}]})
const css=/href="([^"]+\.css)"/.exec(await readFile('dist/mobile.html','utf8'))[1].replace(/^\.\//,'/')
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
async function open(){
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)))
 await page.route('**/__export_name.html',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文字导出结果组件测试</title><link rel="stylesheet" href="${css}"><div id="app"></div><script src="/__export_name.js"></script></html>`}))
 await page.route('**/__export_name.js',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}))
 await page.goto('http://127.0.0.1:9012/__export_name.html');return page
}
const button=(p,name)=>p.getByRole('button',name==='查看完整文字'?{name:/^查看完整文字/}:{name,exact:true})
async function success(p,value){await button(p,'选择保存位置').click();await p.evaluate(value=>window.__resolve(value),value);await p.getByRole('heading',{name:'文字副本已导出',exact:true}).waitFor()}
const geometry=p=>p.evaluate(()=>{const box=s=>{const e=document.querySelector(s);if(!e?.checkVisibility())return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return Object.fromEntries(['.sheet-heading','.text-export-result','.text-export-file','.text-export-output','.text-export-output dd','.text-export-preview-context','#text-export-preview','.text-export-footer'].map(s=>[s,box(s)]))})
try{
 if(freezeMode){
  await mkdir(design)
  const page=await open();await success(page,{exported:true,displayName:actualName})
  assert.equal(await page.locator('.text-export-output dt').textContent(),'建议文件名')
  assert.notEqual(await page.locator('.text-export-output dd').textContent(),actualName)
  await page.screenshot({path:out+'/before-result.png'})
  const originals={}
  async function save(name,preview=false,missing=false){
   const markup=await page.evaluate(({actualName,preview,missing})=>{const clone=document.querySelector('#app').cloneNode(true);clone.querySelector('.text-export-result p')?.remove();const dt=clone.querySelector('.text-export-output dt'),dd=clone.querySelector('.text-export-output dd');if(dt)dt.textContent='已导出文件';if(dd){dd.textContent=missing?'系统未提供文件名':actualName;dd.style.whiteSpace='pre-wrap'}if(preview){clone.querySelector('.text-export-preview-context strong').textContent=actualName;clone.querySelector('#text-export-preview').textContent=document.querySelector('#text-export-preview').value}return{markup:clone.outerHTML,styles:[...document.querySelectorAll('style')].map(e=>e.textContent).join('\n')}},{actualName,preview,missing})
   const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文字副本导出结果设计</title><link rel="stylesheet" href="../mobile-new-draft-recovery-v1/baseline.css"><style>'+markup.styles+'</style><body>'+markup.markup+'</body></html>\n'
   await writeFile(design+'/'+name+'.html',html);originals[name]=createHash('sha256').update(html).digest('hex')
   const ref=await context.newPage();await ref.goto('http://127.0.0.1:9026/design/'+path.basename(design)+'/'+name+'.html');await ref.screenshot({path:design+'/'+name+'.png'});await ref.close()
  }
  await save('result');await save('missing-name',false,true)
  await button(page,'查看完整文字').click();await page.getByRole('dialog',{name:'文字预览',exact:true}).waitFor();await save('preview',true)
  const hashes={};for(const file of ['src/mobile/TextExport.vue','src/mobile/textExport.ts','src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt'])hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex')
  await writeFile(design+'/freeze.json',JSON.stringify({time:new Date().toISOString(),sourceCommit:'8df914f4d',beforeProductChange:true,oldReplyIgnoredActualName:true,actualName,viewport:{width:390,height:844},htmlHashes:originals,sourceHashes:hashes,sharedCssSha256:createHash('sha256').update(await readFile('docs/design/mobile-new-draft-recovery-v1/baseline.css')).digest('hex')},null,2)+'\n')
  report.checks.push('Old component ignores the provided destination name; result, missing-name and preview designs frozen before source edits')
  await page.close()
 }else{
  const page=await open();assert.equal(await page.locator('.text-export-output dt').textContent(),'建议文件名')
  await button(page,'选择保存位置').click();assert.equal(await button(page,'正在等待导出结果…').isDisabled(),true);assert.deepEqual(await page.evaluate(()=>[__back(),__closed(),__calls.length]),[true,0,1]);await page.evaluate(()=>__resolve({cancelled:true,displayName:'未保存的名称.md'}));await page.getByRole('status').filter({hasText:'已取消导出'}).waitFor();assert.equal(await page.locator('.text-export-output dt').textContent(),'建议文件名');assert.ok(!(await page.locator('.text-export-output dd').textContent()).includes('未保存'))
  await button(page,'选择保存位置').click();await page.evaluate(()=>__reject('模拟写入未确认'));await page.getByRole('alert').waitFor();assert.equal(await page.locator('.text-export-output dt').textContent(),'建议文件名')
  await button(page,'重新选择位置导出').click();await page.evaluate(name=>__resolve({exported:true,displayName:name}),actualName);await page.getByRole('heading',{name:'文字副本已导出',exact:true}).waitFor();assert.equal(await page.locator('.text-export-output dd').textContent(),actualName);assert.equal(await page.locator('.text-export-result p').count(),0)
  const freeze=JSON.parse(await readFile(design+'/freeze.json','utf8'))
  for(const state of ['result','preview']){
   if(state==='preview'){await button(page,'查看完整文字').click();await page.getByRole('dialog',{name:'文字预览',exact:true}).waitFor();assert.equal(await page.locator('.text-export-preview-context strong').textContent(),actualName);assert.equal(await page.locator('#text-export-preview').inputValue(),'正在核对手机接收😀\n先保留这段未保存输入\n返回后继续写')}
   assert.equal(createHash('sha256').update(await readFile(design+'/'+state+'.html')).digest('hex'),freeze.htmlHashes[state])
   const ref=await context.newPage();await ref.goto('http://127.0.0.1:9026/design/'+path.basename(design)+'/'+state+'.html')
   for(const variant of [{name:'light',width:390,height:844,dark:false,font:'16px'},{name:'dark-large',width:320,height:700,dark:true,font:'32px'}]){
    for(const p of [page,ref]){await p.setViewportSize({width:variant.width,height:variant.height});await p.evaluate(v=>{document.querySelector('.mobile-app').classList.toggle('theme-dark',v.dark);document.documentElement.style.fontSize=v.font},variant)}
    const actual=await geometry(page),expected=await geometry(ref);assert.deepEqual(actual,expected,state+' '+variant.name);report.geometry.push({state,variant:variant.name,actual,expected,matched:true})
    await page.screenshot({path:out+'/'+state+'-'+variant.name+'-actual.png'});await ref.screenshot({path:out+'/'+state+'-'+variant.name+'-reference.png'})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const action=await page.locator('.text-export-footer button').boundingBox();assert.ok(action.height>=48&&action.y>=0&&action.y+action.height<=variant.height)
    await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'),'utf8'));const scan=await page.evaluate(async()=>{const r=await axe.run(document,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return{violations:r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))}});assert.deepEqual(scan.violations,[]);report.scans.push({state,variant:variant.name,...scan})
   }
   await ref.close();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.querySelector('.mobile-app').classList.remove('theme-dark');document.documentElement.style.fontSize='16px'})
  }
  await page.evaluate(()=>__back());await page.getByRole('dialog',{name:'导出结果',exact:true}).waitFor();assert.equal(await page.locator('.text-export-output dd').textContent(),actualName);assert.equal(await button(page,'查看完整文字').evaluate(e=>e===document.activeElement),true);await button(page,'完成，返回文档').click();assert.equal(await page.evaluate(()=>__closed()),1);assert.ok((await page.evaluate(()=>__calls)).every(c=>c.identical));await page.close()
  for(const displayName of [undefined,null,'', '   ',42,'x'.repeat(1025)]){const p=await open();await success(p,{exported:true,displayName});assert.equal(await p.locator('.text-export-output dd').textContent(),'系统未提供文件名');if(displayName===undefined)await p.screenshot({path:out+'/missing-name-actual.png'});await p.close()}
  const p=await open(),name='  原样保留空格😀(2).md  ';await success(p,{exported:true,displayName:name,retained:true});assert.equal(await p.locator('.text-export-output dd').textContent(),name);assert.equal(await p.locator('.text-export-output dd').evaluate(e=>getComputedStyle(e).whiteSpace),'pre-wrap');await button(p,'查看保存恢复记录').waitFor();await p.close()
  report.checks.push('Cancel/failure preserve suggestion and snapshot; Back and duplicate exports stay blocked while waiting','Verified reply shows exact returned name; preview and Back retain the same name/content and restore opener focus','Result/preview match frozen light and dark large-text geometry, with visible footer actions and no horizontal overflow','Missing/invalid metadata never substitutes the suggested name; exact spaces and retained-recovery feedback are preserved')
 }
 assert.deepEqual(report.errors,[]);report.passed=true
}catch(error){report.failure=String(error.stack||error);process.exitCode=1}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({out,freezeMode,passed:report.passed,checks:report.checks.length,failure:report.failure}))}
