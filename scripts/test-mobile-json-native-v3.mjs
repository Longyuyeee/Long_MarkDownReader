import assert from 'node:assert/strict'
import {access,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {mobileAdb as adb,connectMobileWebView} from './mobile-native-webview-cdp.mjs'
import {jsonV3Name,jsonV3Source} from './fixtures/mobile-json-v3.mjs'
const stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const out=process.env.LONGEDIT_JSON_NATIVE_OUTPUT||'docs/evidence/mobile-0.1.0/json-v3-2026-11-06/native';await assert.rejects(access(out+'/'+stage+'.json'))
const report={scope:'Actual API29/WebView124/x86_64 read-only disposable Android session. Physical taps, Gboard input and Back. Read-only CDP geometry/source; explicit preparation is separate. No ARM, native Chinese composition or TalkBack claim.',actions:[],checks:[],snapshots:[],passed:false},sleep=ms=>new Promise(r=>setTimeout(r,ms));let c,expected=jsonV3Source,originalScale
async function connect(){for(let n=0;n<60;n++){try{c=await connectMobileWebView();return}catch(e){if(n===59)throw e;await sleep(200)}}}
async function wait(fn,arg){for(let n=0;n<100;n++){if(await c.evaluate(fn,arg))return;await sleep(150)}throw Error('Native UI not ready '+fn)}
async function tap(rect,label){assert.ok(rect&&rect.height>0,label);const dims=await c.evaluate(()=>({s:devicePixelRatio,h:innerHeight}));assert.ok(rect.y>=0&&rect.y+rect.height/2<dims.h,JSON.stringify({label,rect,dims}));const x=Math.round((rect.x+rect.width/2)*dims.s),y=Math.round(83+(rect.y+rect.height/2)*dims.s);report.actions.push({label,rect,x,y});adb('shell','input','tap',String(x),String(y));await sleep(300)}
async function target(selector,label=selector){await tap(await c.evaluate(s=>document.querySelector(s)?.getBoundingClientRect().toJSON(),selector),label)}
async function button(label){await tap(await c.evaluate(label=>[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height&&!e.disabled&&!e.closest('[inert]')).find(e=>e.getAttribute('aria-label')===label||e.textContent.trim()===label)?.getBoundingClientRect().toJSON(),label),label)}
async function back(){adb('shell','input','keyevent','4');await sleep(400)}
async function open(name){await wait(()=>!!document.querySelector('.phone-library button.file-row'));for(let n=0;n<40;n++){assert.ok(await c.evaluate(()=>!!document.querySelector('.phone-library')));const r=await c.evaluate(name=>[...document.querySelectorAll('button.file-row')].find(e=>e.textContent.includes(name))?.getBoundingClientRect().toJSON(),name);if(r&&r.y>120&&r.y+r.height<650){await tap(r,'Open '+name);return}adb('shell','input','swipe','540','1850','540','650','150');await sleep(350)}throw Error('Fixture not reached '+name)}
async function closeDocument(){for(let n=0;n<8;n++){if(await c.evaluate(()=>!!document.querySelector('.phone-library')))return;await back()}throw Error('Did not return to library')}
async function ime(shown){let stable=0;for(let n=0;n<50;n++){const native=/mInputShown=true/.test(adb('shell','dumpsys','input_method').toString()),height=await c.evaluate(()=>innerHeight);if(native===shown&&(shown?height<650:height>700)){if(++stable===3)return}else stable=0;await sleep(180)}throw Error('Actual Gboard visibility and settled WebView viewport '+shown)}
async function file(){return(await c.invoke({op:'read',rootId:'local',relativePath:jsonV3Name})).content}
async function draft(value){for(let n=0;n<70;n++){const d=(await c.invoke({op:'draft',rootId:'local',relativePath:jsonV3Name})).draft;if(value===null?d===null:d?.content===value)return;await sleep(150)}throw Error('Exact native JSON draft not confirmed')}
async function snapshot(name){const id=stage+'-'+name;c.close();c=null;const r=spawnSync(process.execPath,['scripts/review-mobile-markdown-native.mjs','observe',id],{timeout:90000,encoding:'utf8',maxBuffer:3*1024*1024,env:{...process.env,LONGEDIT_MARKDOWN_NATIVE_OUTPUT:out}});await writeFile(out+'/'+id+'-observation.log',r.stdout+r.stderr);assert.equal(r.status,0,r.stdout+r.stderr);await connect();const state=await c.evaluate(()=>{const b=s=>document.querySelector(s)?.getBoundingClientRect().toJSON()||null;return{width:innerWidth,height:innerHeight,header:b('.json-task-header'),body:b('.json-task-body'),footer:b('.json-task-footer'),input:b('#json-value'),error:b('#json-value-error'),context:b('.json-context'),value:document.querySelector('#json-value')?.value,title:document.querySelector('.json-task-header h1')?.textContent,theme:document.querySelector('.mobile-app').className,buttons:[...document.querySelectorAll('.json-structure button')].filter(e=>e.getBoundingClientRect().height&&!e.closest('[inert]')&&!e.closest('dialog:not([open])')).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),rect:e.getBoundingClientRect().toJSON()})),overflow:document.documentElement.scrollWidth>innerWidth}});assert.equal(state.overflow,false);report.snapshots.push({name,...state});return state}
async function field(name){await tap(await c.evaluate(name=>[...document.querySelectorAll('.json-field')].find(e=>e.getBoundingClientRect().height&&e.querySelector('strong')?.textContent===name)?.getBoundingClientRect().toJSON(),name),'Field '+name)}
async function browse(){
  await wait(()=>!!document.querySelector('.json-tools'))
  const entryVisible=await c.evaluate(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='浏览结构'&&e.getBoundingClientRect().height&&!e.closest('[inert]')))
  if(!entryVisible){
    const editorVisible=await c.evaluate(()=>!!document.querySelector('.code-tool-selector')?.getBoundingClientRect().height)
    if(editorVisible){await target('.code-tool-selector');await button('源码操作')}
    else await button('文档操作')
  }
  await button('浏览结构')
  await wait(()=>!!document.querySelector('.json-field'))
  await ime(false)
}
async function largeOverview() {
  await replaceNumber('01')
  await button('核对修改')
  await wait(() => !!document.querySelector('#json-value-error'))
  const invalid = await snapshot('font200-error')
  assert.equal(invalid.value, '01')
  assert.ok(invalid.input.top >= invalid.body.top - 1 && invalid.input.bottom <= invalid.body.bottom + 1)
  assert.ok(invalid.error.top < invalid.body.bottom && invalid.error.bottom <= invalid.body.bottom + 1)
  await back()
  await ime(false)
  await back()
  await wait(() => document.querySelector('.json-task-header h1')?.textContent === 'fontSize')
  await snapshot('font200-detail')
  await back()
  await wait(() => !!document.querySelector('.json-view-tabs'))
  await snapshot('font200-tree')
  report.checks.push('At Android 200% textZoom the invalid numeric input and its complete error are visible above Gboard, and physical Back returns through the large detail and structure pages.')
}
async function replaceNumber(text){await target('#json-value');adb('shell','input','keyevent','123');for(let n=0;n<2;n++)adb('shell','input','keyevent','67');adb('shell','input','text',text);await wait(text=>document.querySelector('#json-value')?.value===text,text)}
async function darkReview() {
  if(!await c.evaluate(()=>!!document.querySelector('.appearance-page'))){
    await closeDocument()
    await button('设置')
    await target('[data-focus-key="settings-appearance"]')
  }
  await wait(()=>!!document.querySelector('label[data-theme="dark"]'))
  await target('label[data-theme="dark"]')
  await wait(()=>document.querySelector('.mobile-app')?.classList.contains('theme-dark'))
  await back()
  await back()
  await wait(()=>!!document.querySelector('.phone-library'))
  await open(jsonV3Name)
  await browse()
  await snapshot('dark-tree')
  await field('fontSize')
  await snapshot('dark-detail')
  await button('修改')
  await ime(true)
  const dark=await snapshot('dark-edit-ime')
  assert.ok(dark.theme.includes('theme-dark'))
  originalScale=adb('shell','settings','get','system','font_scale').toString().trim()
  report.originalFontScale=originalScale
  adb('shell','settings','put','system','font_scale','2.0')
  await wait(()=>getComputedStyle(document.documentElement).fontSize==='32px')
  const large=await snapshot('font200-edit-ime')
  assert.ok(large.input.y>=large.body.y-1&&large.input.bottom<=large.body.bottom+1,JSON.stringify(large))
  for(const b of large.buttons)assert.ok(b.rect.width>=48&&b.rect.height>=48)
  if(stage.startsWith('combined'))await largeOverview()
  if(originalScale==='null')adb('shell','settings','delete','system','font_scale')
  else adb('shell','settings','put','system','font_scale',originalScale)
  await wait(()=>getComputedStyle(document.documentElement).fontSize==='16px')
  await snapshot('font-restored')
  assert.equal(await file(),expected)
  report.checks.push('Actual dark tree/detail/edit and Android 200% font/textZoom retain the input above Gboard and reachable 48dp actions; original font scale is restored.')
}
try{
 await connect();assert.equal(await c.evaluate(()=>innerWidth),393);assert.match(adb('shell','dumpsys','window','windows').toString(),/mFrame=\[0,0\]\[1080,83\]/)
 if(stage==='prepare'){const list=await c.invoke({op:'list',rootId:'local',relativePath:''});assert.equal(list.truncated,false);assert.ok(!list.entries.some(e=>e.relativePath===jsonV3Name));await c.invoke({op:'write',rootId:'local',relativePath:jsonV3Name,content:jsonV3Source,expectedSignature:null});assert.equal(await file(),expected);report.preparationOnly=true;report.passed=true}
 else if(stage==='combined-appearance'){
  expected=jsonV3Source.replace('"fontSize": 17','"fontSize": 18')
  assert.equal(await file(),expected)
  await draft(null)
  await darkReview()
  report.savedSource=expected
  report.passed=true
 }
 else{
  await open(jsonV3Name);await browse();const tree=await snapshot('tree');assert.equal(tree.header.height,64);assert.equal(tree.footer,null);assert.equal(await c.evaluate(()=>document.querySelectorAll('.json-field').length),10);for(const b of tree.buttons)assert.ok(b.rect.width>=48&&b.rect.height>=48);await field('fontSize');await snapshot('detail');await field('theme');await back();await wait(()=>!!document.querySelector('.json-view-tabs'));assert.equal(await c.evaluate(()=>document.activeElement?.querySelector('strong')?.textContent),'theme');await field('fontSize');await button('修改');await ime(true);const edit=await snapshot('edit-ime');assert.equal(edit.value,'17');assert.ok(edit.input.bottom<=edit.body.bottom+1);assert.equal(await file(),expected);await target('#json-value-kind');await sleep(600);adb('shell','uiautomator','dump','/sdcard/longedit-json-type-v3.xml');const typeXml=adb('exec-out','cat','/sdcard/longedit-json-type-v3.xml').toString();await writeFile(out+'/'+stage+'-type-picker.xml',typeXml);await writeFile(out+'/'+stage+'-type-picker.png',adb('exec-out','screencap','-p'));const numberNode=[...typeXml.matchAll(/<node [^>]+>/g)].map(m=>m[0]).find(n=>n.includes('text="Number"')&&n.includes('android.widget.CheckedTextView'));assert.ok(numberNode,'Native Number choice');const typeBounds=/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(numberNode);assert.ok(typeBounds);const tx=Math.round((Number(typeBounds[1])+Number(typeBounds[3]))/2),ty=Math.round((Number(typeBounds[2])+Number(typeBounds[4]))/2);report.actions.push({label:'Choose Number in actual Android type picker',x:tx,y:ty});adb('shell','input','tap',String(tx),String(ty));await sleep(400);await target('#json-value');await ime(true);await replaceNumber('18');const selection=await c.evaluate(()=>{const e=document.querySelector('#json-value');return[e.selectionStart,e.selectionEnd]});await button('核对修改');await wait(()=>document.querySelector('.json-task-header h1')?.textContent==='核对修改');await snapshot('review');await back();await ime(true);assert.equal(await c.evaluate(()=>document.querySelector('#json-value')?.value),'18');assert.deepEqual(await c.evaluate(()=>{const e=document.querySelector('#json-value');return[e.selectionStart,e.selectionEnd]}),selection);await back();await ime(false);assert.equal(await c.evaluate(()=>document.querySelector('.json-task-header h1')?.textContent),'修改值');await back();await wait(()=>document.querySelector('.json-task-header h1')?.textContent==='fontSize');await button('继续修改');await ime(true);assert.equal(await c.evaluate(()=>document.querySelector('#json-value')?.value),'18');await replaceNumber('01');await button('核对修改');await wait(()=>!!document.querySelector('#json-value-error'));await snapshot('error');await replaceNumber('18');await button('核对修改');await wait(()=>document.querySelector('.json-task-header h1')?.textContent==='核对修改');await button('应用到草稿');await wait(()=>document.activeElement?.getAttribute('aria-label')==='笔记正文');await ime(true);const changed=jsonV3Source.replace('"fontSize": 17','"fontSize": 18');await draft(changed);assert.equal(await file(),expected);await button('撤销');await draft(null);await button('重做');await draft(changed);await button('保存');expected=changed;for(let n=0;n<70;n++){if(await file()===expected)break;assert.ok(n<69);await sleep(150)}await draft(null);report.checks.push('Actual D1/D2 tree, sibling switch and Back retain the original inline origin. Explicit Modify enters editing from reading. Real decimal Gboard, review/selection restoration, keyboard Back, pending edit and invalid numeric input preserve exact source; Apply, Undo/Redo and Save affect only the synthetic BOM/CRLF file.')
  await browse();await button('更多结构操作');await wait(()=>!!document.querySelector('.json-operation-dialog[open]'));await snapshot('menu');await button('筛选本层字段或值');await ime(true);adb('shell','input','text','library');await back();await ime(false);await wait(()=>document.querySelectorAll('.json-field').length===1);await field('library');await back();assert.equal(await c.evaluate(()=>document.querySelector('#json-level-filter')?.value),'library');await back();await button('清除本层筛选');await button('JSON结构说明');await back();await wait(()=>!document.querySelector('.mobile-help-backdrop'));await snapshot('tree-returned');assert.equal(await file(),expected);report.checks.push('Physical More, local filtering, child Back, filter Back and Help preserve the actual root and input. No permanent filter/count block or fake drag handle; source remains exact.')
  await darkReview();report.savedSource=expected;report.passed=true
 }
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;try{await writeFile(out+'/'+stage+'-failure.png',adb('exec-out','screencap','-p'))}catch{}}
finally{if(originalScale!==undefined){if(originalScale==='null')adb('shell','settings','delete','system','font_scale');else adb('shell','settings','put','system','font_scale',originalScale);report.restoredScale=adb('shell','settings','get','system','font_scale').toString().trim();assert.ok(originalScale==='null'?report.restoredScale==='null'||Number(report.restoredScale)===1:report.restoredScale===originalScale)}c?.close();await writeFile(out+'/'+stage+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({stage,passed:report.passed,checks:report.checks,failure:report.failure},null,2))}
