import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {mobileAdb as adb,connectMobileWebView} from './mobile-native-webview-cdp.mjs'
import {codeV3Name,codeV3Source} from './fixtures/mobile-code-v3.mjs'
const stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const out=process.env.LONGEDIT_CODE_NATIVE_OUTPUT||'docs/evidence/mobile-0.1.0/code-reading-v3-2026-11-05/native';await assert.rejects(access(out+'/'+stage+'.json'))
const combined = stage.startsWith('combined')
const report={scope:'Actual API29 / WebView124 / x86_64 disposable Android session; physical taps, long press, drag, Gboard and system Back. CDP only reads state/geometry and source, except separately marked synthetic preparation. '+(combined ? 'F2 editor geometry and keyboard are inspected. ' : 'F2 Edit/Back continuity is inspected. ')+'No ARM or TalkBack claim.',actions:[],checks:[],snapshots:[],passed:false},sleep=ms=>new Promise(r=>setTimeout(r,ms));let c,originalScale
async function connect(){for(let n=0;n<60;n++){try{c=await connectMobileWebView();return}catch(e){if(n===59)throw e;await sleep(200)}}}
async function wait(fn,arg){for(let n=0;n<100;n++){if(await c.evaluate(fn,arg))return;await sleep(150)}throw Error('Native UI not ready '+fn)}
async function tap(rect,label){assert.ok(rect&&rect.height>0,label);const dims=await c.evaluate(()=>({s:devicePixelRatio,h:innerHeight}));assert.ok(rect.y>=0&&rect.y+rect.height/2<dims.h,JSON.stringify({label,rect,dims}));const x=Math.round((rect.x+rect.width/2)*dims.s),y=Math.round(83+(rect.y+rect.height/2)*dims.s);report.actions.push({label,rect,x,y});adb('shell','input','tap',String(x),String(y));await sleep(300)}
async function target(selector,label=selector){await tap(await c.evaluate(s=>document.querySelector(s)?.getBoundingClientRect().toJSON(),selector),label)}
async function button(label){await tap(await c.evaluate(label=>[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height&&!e.disabled&&!e.closest('[inert]')).find(e=>e.getAttribute('aria-label')===label||e.textContent.trim()===label)?.getBoundingClientRect().toJSON(),label),label)}
async function back(){adb('shell','input','keyevent','4');await sleep(400)}
async function open(name){await wait(()=>!!document.querySelector('.phone-library button.file-row'));for(let n=0;n<40;n++){assert.ok(await c.evaluate(()=>!!document.querySelector('.phone-library')));const r=await c.evaluate(name=>[...document.querySelectorAll('button.file-row')].find(e=>e.textContent.includes(name))?.getBoundingClientRect().toJSON(),name);if(r&&r.y>120&&r.y+r.height<650){await tap(r,'Open '+name);return}adb('shell','input','swipe','540','1850','540','650','150');await sleep(350)}throw Error('Fixture not reached '+name)}
async function reader(fn){const tree=await c.command('Page.getFrameTree',{}),child=tree.frameTree.childFrames?.find(f=>f.frame.url==='about:srcdoc');assert.ok(child);const world=await c.command('Page.createIsolatedWorld',{frameId:child.frame.id,worldName:'text-v3-read-only',grantUniveralAccess:false});const r=await c.command('Runtime.evaluate',{contextId:world.executionContextId,expression:`(${fn})()`,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function closeDocument(){for(let n=0;n<5;n++){if(await c.evaluate(()=>!!document.querySelector('.phone-library')))return;await back()}throw Error('Did not return to library')}
async function ime(shown){for(let n=0;n<40;n++){if(/mInputShown=true/.test(adb('shell','dumpsys','input_method').toString())===shown)return;await sleep(150)}throw Error('Actual Gboard visibility '+shown)}
async function source(){assert.equal((await c.invoke({op:'read',rootId:'local',relativePath:codeV3Name})).content,codeV3Source)}
async function snapshot(name){const id=stage+'-'+name;c.close();c=null;const r=spawnSync(process.execPath,['scripts/review-mobile-markdown-native.mjs','observe',id],{timeout:45000,encoding:'utf8',maxBuffer:3*1024*1024,env:{...process.env,LONGEDIT_MARKDOWN_NATIVE_OUTPUT:out}});await writeFile(out+'/'+id+'-observation.log',r.stdout+r.stderr);assert.equal(r.status,0,r.stdout+r.stderr);await connect();const state=await c.evaluate(()=>{const b=s=>document.querySelector(s)?.getBoundingClientRect().toJSON()||null;return{height:innerHeight,width:innerWidth,header:b('.reader-header'),body:b('.document-body'),footer:b('.editor-footer'),sheet:b('.bottom-sheet'),field:b('#code-line-number'),actions:[...document.querySelectorAll('.code-line-submit button')].map(e=>e.getBoundingClientRect().toJSON()),theme:document.querySelector('.mobile-app').className,overflow:document.documentElement.scrollWidth>innerWidth}});assert.equal(state.overflow,false);report.snapshots.push({name,...state});return state}
async function combinedReview() {
  await wait(() => !!document.querySelector('.phone-library .file-row'))
  await button('查找文件名')
  await ime(true)
  adb('shell', 'input', 'text', codeV3Name)
  await wait(name => document.querySelector('input[aria-label="按文件名查找"]')?.value === name, codeV3Name)
  adb('shell', 'input', 'keyevent', '66')
  await ime(false)
  const row = await c.evaluate(name => [...document.querySelectorAll('.file-row')].find(e => e.querySelector('strong')?.textContent === name)?.getBoundingClientRect().toJSON(), codeV3Name)
  await tap(row, 'Open the same JavaScript sample')
  await wait(() => !!document.querySelector('.code-reading iframe'))
  await sleep(650)
  await snapshot('reading')
  assert.equal(await reader(() => document.querySelectorAll('[data-longedit-code-line]').length), 22)

  await button('编辑')
  await ime(true)
  await snapshot('editor-ime')
  const strip = await c.evaluate(() => document.querySelector('.code-symbols').getBoundingClientRect().toJSON())
  const y = Math.round(83 + (strip.y + strip.height / 2) * 2.75)
  adb('shell', 'input', 'swipe', String(Math.round((strip.right - 18) * 2.75)), String(y), String(Math.round((strip.left + 18) * 2.75)), String(y), '500')
  await wait(() => document.querySelector('.code-symbols').scrollLeft > 0)
  await ime(true)
  await back()
  await ime(false)
  assert.equal(await c.evaluate(() => !!document.querySelector('.code-editing')), true)
  await back()
  await wait(() => !!document.querySelector('.code-reading iframe'))
  report.checks.push('F1 and F2 use the same actual source; a physical symbol-row swipe keeps the keyboard and Back first closes it, then returns to reading')

  await button('文档操作')
  await snapshot('menu')
  await button('源码说明')
  await wait(() => !!document.querySelector('.mobile-help-dialog'))
  assert.equal(await c.evaluate(() => document.querySelector('.sheet-backdrop').getBoundingClientRect().height), 0)
  await snapshot('menu-help')
  await back()
  assert.equal(await c.evaluate(() => document.activeElement?.getAttribute('aria-label')), '源码说明')
  await button('定位行')
  await ime(true)
  adb('shell', 'input', 'text', '14')
  await wait(() => document.querySelector('#code-line-number')?.value === '14')
  await back()
  await ime(false)
  await button('源码说明')
  await wait(() => !!document.querySelector('.mobile-help-dialog'))
  assert.equal(await c.evaluate(() => document.querySelector('.sheet-backdrop').getBoundingClientRect().height), 0)
  await snapshot('line-help')
  await back()
  assert.equal(await c.evaluate(() => document.querySelector('#code-line-number').value), '14')
  assert.equal(await c.evaluate(() => document.activeElement?.getAttribute('aria-label')), '源码说明')
  await button('前往')
  await wait(() => !document.querySelector('.bottom-sheet'))
  assert.equal(await reader(() => document.querySelector('.reader-source-current')?.getAttribute('data-longedit-code-line')), '14')
  report.checks.push('F3 has one shade for Help; Back restores each opener and numeric 14, and Go highlights the actual source row')

  originalScale = adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim()
  report.originalFontScale = originalScale
  adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0')
  await wait(() => getComputedStyle(document.documentElement).fontSize === '32px')
  await snapshot('font200-reading')
  await button('文档操作')
  await snapshot('font200-menu')
  await back()
  await button('编辑')
  await ime(true)
  await snapshot('font200-editor-ime')
  await back()
  await ime(false)
  await back()
  await wait(() => !!document.querySelector('.code-reading'))
  await source()
  report.checks.push('System 200% text preserves the actual reading, menu and Gboard editor, and the fixture source is byte-identical')
  report.passed = true
}
try{
 await connect();assert.equal(await c.evaluate(()=>innerWidth),393);assert.match(adb('shell','dumpsys','window','windows').toString(),/mFrame=\[0,0\]\[1080,83\]/)
 if(stage==='prepare'){const list=await c.invoke({op:'list',rootId:'local',relativePath:''});assert.equal(list.truncated,false);assert.ok(!list.entries.some(e=>e.relativePath===codeV3Name));await c.invoke({op:'write',rootId:'local',relativePath:codeV3Name,content:codeV3Source,expectedSignature:null});await source();report.preparationOnly=true;report.passed=true}
 else if(combined)await combinedReview()
 else{
  await open(codeV3Name);await wait(()=>!!document.querySelector('.code-reading iframe.mobile-reader'));await sleep(700);const initial=await snapshot('reading');assert.equal(initial.header.height,64);assert.equal(initial.footer,null);const text=await reader(()=>({source:[...document.querySelectorAll('.reader-source-text')].map(e=>e.textContent).join('\n'),lines:document.querySelectorAll('[data-longedit-code-line]').length,colors:document.querySelectorAll('[class^=reader-syntax-]').length,font:getComputedStyle(document.querySelector('pre')).fontSize,first:document.querySelector('.reader-source-line').getBoundingClientRect().toJSON()}));assert.equal(text.source,codeV3Source.replaceAll('\r\n','\n'));assert.equal(text.lines,22);assert.ok(text.colors>20);assert.equal(text.font,'14px')
  const glyph=await reader(()=>{const w=document.createTreeWalker(document.querySelector('pre'),NodeFilter.SHOW_TEXT);let node;while(node=w.nextNode()){const at=node.textContent.indexOf('readFile');if(at>=0){const r=document.createRange();r.setStart(node,at);r.setEnd(node,at+1);return r.getBoundingClientRect().toJSON()}}}),frame=await c.evaluate(()=>document.querySelector('iframe.mobile-reader').getBoundingClientRect().toJSON());assert.ok(glyph?.width);const px=Math.round((frame.x+glyph.x+glyph.width/2)*2.75),py=Math.round(83+(frame.y+glyph.y+glyph.height/2)*2.75);adb('shell','input','swipe',String(px),String(py),String(px),String(py),'850');await sleep(500);report.selection=await reader(()=>getSelection()?.toString());assert.ok(report.selection?.length&&codeV3Source.includes(report.selection));await snapshot('selection');await back();await wait(()=>!!document.querySelector('.code-reading'));report.checks.push('Actual F1 has a 64dp bar, 22 real source lines and syntax colors with no footer; native long press selects source and Android Back dismisses its system selection layer')
  await button('文档操作');await wait(()=>!!document.querySelector('.code-actions-sheet'));await snapshot('menu');assert.equal(await c.evaluate(()=>document.querySelectorAll('.code-primary-actions button').length),5);await button('更多文件操作');await wait(()=>document.querySelector('.bottom-sheet')?.getAttribute('aria-label')==='文件操作');await back();await wait(()=>!!document.querySelector('.code-actions-sheet'));assert.equal(await c.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'更多文件操作');await button('源码说明');await wait(()=>!!document.querySelector('.mobile-help-backdrop'));await back();await wait(()=>!document.querySelector('.mobile-help-backdrop'));const h=await c.evaluate(()=>document.querySelector('.code-menu-handle').getBoundingClientRect().toJSON()),x=Math.round((h.x+h.width/2)*2.75),y=Math.round(83+(h.y+h.height/2)*2.75);adb('shell','input','swipe',String(x),String(y),String(x),String(y+250),'500');await wait(()=>!document.querySelector('.bottom-sheet'));report.checks.push('F3 primary menu has five actions; actual child/help Back restores one parent and opener, and a physical downward handle drag dismisses the sheet')
  await button('文档操作');await button('定位行');await ime(true);await snapshot('line-ime');adb('shell','input','text','0');await button('前往');await wait(()=>!!document.querySelector('#code-line-error'));await snapshot('line-error');await target('#code-line-number');adb('shell','input','keyevent','67');adb('shell','input','text','14');await wait(()=>document.querySelector('#code-line-number').value==='14');await back();await ime(false);assert.ok(await c.evaluate(()=>!!document.querySelector('.code-line-sheet')));await snapshot('line-hidden');await back();await wait(()=>!!document.querySelector('.code-actions-sheet'));await button('定位行');await ime(true);assert.equal(await c.evaluate(()=>document.querySelector('#code-line-number').value),'14');await back();await button('源码说明');await back();assert.equal(await c.evaluate(()=>document.querySelector('#code-line-number').value),'14');await button('前往');await wait(()=>!document.querySelector('.bottom-sheet'));assert.equal(await reader(()=>document.querySelector('.reader-source-current')?.getAttribute('data-longedit-code-line')),'14');assert.equal(await c.evaluate(()=>!!document.querySelector('.cm-editor')),false);await snapshot('located14');await source();report.checks.push('Real numeric Gboard, invalid input, keyboard Back, parent Back and Help retain pending 14; explicit Go highlights source row 14 while staying in reading with exact BOM/CRLF file bytes')
  await button('在文档内查找');await ime(true);adb('shell','input','text','readFile');report.actions.push({label:'Commit actual Gboard English candidate',x:330,y:1518});adb('shell','input','tap','330','1518');await wait(()=>document.body.innerText.includes('1 / 1'));assert.equal(await reader(()=>[...document.querySelectorAll('mark[data-longedit-hit]')].map(e=>e.textContent).join('')),'readFile');await back();await ime(false);await snapshot('find');await back();assert.equal(await c.evaluate(()=>document.activeElement?.classList.contains('code-reading-find')),true);await button('文档操作');await button('复制全文');await wait(()=>document.body.innerText.includes('源码已复制'));await source();await button('关闭提示');await button('编辑');await wait(()=>!!document.querySelector('.cm-editor'));await ime(true);await back();await ime(false);for(let n=0;n<3;n++){await back();if(await c.evaluate(()=>!!document.querySelector('.code-reading')))break}await wait(()=>!!document.querySelector('.code-reading'));await source();report.checks.push('Physical Find commits the Gboard candidate, finds actual source and closes to its header opener; Copy confirms native completion, and deliberate Edit/IME/Back returns to reading without changing source (F2 appearance remains pending)')
  await button('文档操作');await button('定位行');await ime(true);await back();originalScale=adb('shell','settings','get','system','font_scale').toString().trim();report.originalFontScale=originalScale;adb('shell','settings','put','system','font_scale','2.0');await sleep(1100);const large=await snapshot('font200-line');assert.ok(large.field.y>=large.sheet.y&&large.field.bottom<=large.height);assert.equal(large.actions.length,2);for(const r of large.actions)assert.ok(r.height>=48&&r.bottom<=large.height);await button('取消');await back();await snapshot('font200-reading');const largeLine=await reader(()=>document.querySelector('.reader-source-line').getBoundingClientRect().height);assert.ok(largeLine>text.first.height*1.4);if(originalScale==='null')adb('shell','settings','delete','system','font_scale');else adb('shell','settings','put','system','font_scale',originalScale);await sleep(700);await snapshot('font-restored');assert.ok(Math.abs(await reader(()=>document.querySelector('.reader-source-line').getBoundingClientRect().height)-text.first.height)<2);await source();report.checks.push('Android 200% font/textZoom preserves the line input and both 48dp actions; the actual reading page is inspected separately and returns to its original row height after restoring the default scale')
  await closeDocument();await button('设置');await target('[data-focus-key="settings-appearance"]');await target('[data-focus-key="settings-theme"]');await button('深色');await back();await back();await wait(()=>!!document.querySelector('.phone-library'));await open(codeV3Name);await wait(()=>!!document.querySelector('.code-reading'));await sleep(600);const dark=await snapshot('dark');assert.ok(dark.theme.includes('theme-dark'));await button('文档操作');await snapshot('dark-menu');await source();report.passed=true
 }
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;try{await writeFile(out+'/'+stage+'-failure.png',adb('exec-out','screencap','-p'))}catch{}}
finally{
 c?.close()
 if(originalScale!==undefined){
   for(let attempt=0;attempt<3;attempt++){
     if(originalScale==='null')adb('shell','settings','delete','system','font_scale')
     else adb('shell','settings','put','system','font_scale',originalScale)
     await sleep(900)
     report.restoredScale=adb('shell','settings','get','system','font_scale').toString().trim()
     if(report.restoredScale===originalScale)break
   }
   if(report.restoredScale!==originalScale){report.passed=false;process.exitCode=1}
 }
 await writeFile(out+'/'+stage+'.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify({stage,passed:report.passed,checks:report.checks,failure:report.failure},null,2))
}
