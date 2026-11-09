import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mobileAdb as adb,connectMobileWebView} from './mobile-native-webview-cdp.mjs'
import {structuredV3} from './fixtures/mobile-structured-v3.mjs'
const stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const structuresOnly=process.argv.includes('--structures'),pdfOnly=process.argv.includes('--pdf-only')
assert.ok(!(structuresOnly&&pdfOnly))
const out=process.env.LONGEDIT_STRUCTURED_NATIVE_OUTPUT||'docs/evidence/mobile-0.1.0/structured-pdf-v3-2026-11-06/native',fixtures=pdfOnly?[]:structuredV3.map(v=>({...v,name:(process.env.LONGEDIT_NATIVE_FIXTURE_PREFIX||'v3-')+v.name}))
const pdf=structuresOnly?undefined:JSON.parse(await readFile(out+'/pdf-source.json','utf8')).selected
await assert.rejects(access(out+'/'+stage+'.json'))
const report={passed:false,scope:'Installed x86_64 API29/WebView124 in a read-only disposable AVD. Physical taps, English/numeric Gboard, system Back, swipes and Android font scaling. IPC is read-only during acceptance. No ARM, Chinese composition or TalkBack acceptance.',checks:[],actions:[],snapshots:[]},sleep=ms=>new Promise(r=>setTimeout(r,ms)),expected=new Map(fixtures.map(v=>[v.name,v.source]));let c,activeName='',originalScale
async function connect(){for(let n=0;n<60;n++){try{c=await connectMobileWebView();return}catch(error){if(n===59)throw error;await sleep(200)}}}
async function wait(fn,arg){for(let n=0;n<100;n++){if(await c.evaluate(fn,arg))return;await sleep(150)}throw Error('UI not ready: '+fn)}
async function rect(fn,arg){let last='',stable=0;for(let n=0;n<60;n++){const r=await c.evaluate(fn,arg),h=await c.evaluate(()=>innerHeight),key=JSON.stringify({r,h});if(r?.height&&key===last){if(++stable===3)return r}else stable=0;last=key;await sleep(150)}throw Error('Geometry not settled: '+arg)}
async function tap(r,label){const d=await c.evaluate(()=>({s:devicePixelRatio,w:innerWidth,h:innerHeight}));assert.ok(r?.height&&r.y>=0&&r.y+r.height/2<d.h,JSON.stringify({label,r,d}));const x=Math.round((r.x+r.width/2)*d.s),y=Math.round(83+(r.y+r.height/2)*d.s);adb('shell','input','tap',String(x),String(y));report.actions.push({label,x,y,rect:r});await sleep(300)}
async function button(label){await tap(await rect(label=>[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height&&!e.disabled&&!e.closest('[inert]')&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('dialog:not([open])')).find(e=>e.getAttribute('aria-label')===label||e.textContent.trim()===label)?.getBoundingClientRect().toJSON(),label),label)}
async function target(selector){for(let n=0;n<10;n++){const v=await c.evaluate(s=>{const e=document.querySelector(s),area=e?.closest('.structured-body,.pdf-navigation-body');return{r:e?.getBoundingClientRect().toJSON(),area:area?.getBoundingClientRect().toJSON(),s:devicePixelRatio}},selector);assert.ok(v.r?.height,selector);if(!v.area||v.r.y>=v.area.y&&v.r.bottom<=v.area.bottom+1)break;const up=v.r.bottom>v.area.bottom,from=up?v.area.bottom-20:v.area.top+20,to=from+(up?-1:1)*Math.min(130,v.area.height-40);adb('shell','input','swipe',String(Math.round((v.area.x+v.area.width*.8)*v.s)),String(Math.round(83+from*v.s)),String(Math.round((v.area.x+v.area.width*.8)*v.s)),String(Math.round(83+to*v.s)),'180');await sleep(250)}await tap(await rect(s=>document.querySelector(s)?.getBoundingClientRect().toJSON(),selector),selector)}
async function back(){adb('shell','input','keyevent','4');await sleep(400)}
async function ime(shown){let stable=0;for(let n=0;n<60;n++){const native=/mInputShown=true/.test(adb('shell','dumpsys','input_method').toString()),h=await c.evaluate(()=>innerHeight);if(native===shown&&(shown?h<650:h>700)){if(++stable===3)return}else stable=0;await sleep(180)}throw Error('IME not settled: '+shown)}
async function input(selector,value){if(!await c.evaluate(s=>document.querySelector(s)===document.activeElement,selector))await target(selector);await ime(true);const before=await c.evaluate(s=>{const e=document.querySelector(s);return{value:e?.value,focused:e===document.activeElement}},selector);report.actions.push({input:selector,before,value});assert.equal(before.focused,true);adb('shell','input','keyevent','123');for(let n=0;await c.evaluate(s=>document.querySelector(s)?.value.length,selector);n++){assert.ok(n<before.value.length+8,'Native deletion did not complete');adb('shell','input','keyevent','67');await sleep(100)}assert.equal(await c.evaluate(s=>document.querySelector(s)?.value,selector),'');if(value)adb('shell','input','text',value);await wait(({selector,value})=>document.querySelector(selector)?.value===value,{selector,value})}
async function source(name){return(await c.invoke({op:'read',rootId:'local',relativePath:name})).content}
async function draft(name,value){for(let n=0;n<70;n++){const d=(await c.invoke({op:'draft',rootId:'local',relativePath:name})).draft;if(value===null?d===null:d?.content===value)return;await sleep(150)}throw Error('Exact draft not confirmed: '+name)}
async function preserved(){for(const[name,text]of expected)assert.equal(await source(name),text);if(pdf){const p=await c.invoke({op:'readPdf',rootId:'local',relativePath:pdf.relativePath});assert.equal(createHash('sha256').update(Buffer.from(p.base64,'base64')).digest('hex'),pdf.sha256)}}
async function open(name){await wait(()=>!!document.querySelector('.phone-library')&&document.querySelector('.mobile-workspace')?.getAttribute('aria-busy')==='false');await sleep(650);if(!await c.evaluate(()=>!!document.querySelector('.library-name-search input')))await button('查找文件名');await input('.library-name-search input',name.endsWith('.pdf')?'MobileNavigation':name);await back();await ime(false);await wait(name=>[...document.querySelectorAll('button.file-row')].some(e=>e.textContent.includes(name)),name);await tap(await rect(name=>[...document.querySelectorAll('button.file-row')].find(e=>e.textContent.includes(name))?.getBoundingClientRect().toJSON(),name),'Open '+name);activeName=name}
async function closeDocument(){for(let n=0;n<18;n++){if(await c.evaluate(()=>!!document.querySelector('.phone-library')&&document.querySelector('.mobile-workspace')?.getAttribute('aria-busy')==='false')){await sleep(350);return};await back()}throw Error('Library not reached')}
async function browse(){await button('文档操作');await button('浏览结构');await wait(()=>!!document.querySelector('.structured-field'))}
async function field(label){await tap(await rect(label=>[...document.querySelectorAll('.structured-field')].find(e=>e.getBoundingClientRect().height&&e.querySelector('strong')?.textContent===label)?.getBoundingClientRect().toJSON(),label),'Field '+label)}
async function finishSave(name,next){await ime(true);await draft(name,next);assert.equal(await source(name),expected.get(name));await back();await ime(false);await button('撤销');await draft(name,null);await button('重做');await draft(name,next);await button('保存');for(let n=0;n<70;n++){if(await source(name)===next)break;assert.ok(n<69);await sleep(150)}expected.set(name,next);await draft(name,null);await ime(true);await back();await ime(false)}
async function save(name,next){await button('应用到草稿');await finishSave(name,next)}
async function snapshot(name){const id=stage+'-'+name;c.close();c=null;const r=spawnSync(process.execPath,['scripts/review-mobile-markdown-native.mjs','observe',id],{timeout:90000,encoding:'utf8',maxBuffer:3*1024*1024,env:{...process.env,LONGEDIT_MARKDOWN_NATIVE_OUTPUT:out}});await writeFile(out+'/'+id+'-observation.log',r.stdout+r.stderr);assert.equal(r.status,0,r.stdout+r.stderr);await connect();const state=await c.evaluate(()=>{const selectors=['.structured-task','.pdf-action-menu','.pdf-settings-dialog','.pdf-settings-task','.pdf-page-dialog','.pdf-search-task','.pdf-navigation','.mobile-pdf'],panel=selectors.map(s=>[...document.querySelectorAll(s)].find(e=>e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[inert]'))).find(Boolean),body=panel?.querySelector('.structured-body'),active=document.activeElement;return{width:innerWidth,height:innerHeight,theme:document.querySelector('.mobile-app').className,title:panel?.querySelector('h1,h2')?.textContent,body:body?.getBoundingClientRect().toJSON(),input:panel?.contains(active)&&active.matches('input,textarea')?active.getBoundingClientRect().toJSON():null,values:Object.fromEntries([...(panel?.querySelectorAll('input,textarea,select')||[])].map(e=>[e.id,e.value])),buttons:[...(panel?.querySelectorAll('button')||[])].filter(e=>e.getBoundingClientRect().height&&!e.closest('[inert]')&&getComputedStyle(e).visibility!=='hidden').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),rect:e.getBoundingClientRect().toJSON()})),overflow:document.documentElement.scrollWidth>innerWidth}});assert.equal(state.overflow,false);for(const b of state.buttons)assert.ok(b.rect.width>=47.9&&b.rect.height>=47.9,JSON.stringify(b));if(state.body&&state.input)assert.ok(state.input.y>=state.body.y-1&&state.input.bottom<=state.body.bottom+1,JSON.stringify(state));report.snapshots.push({name,file:activeName,...state});await preserved()}
async function pdfPage(n){await wait(n=>document.querySelector('.pdf-page-button')?.textContent.trim()===n+' / 9'&&!document.querySelector('.pdf-render-status')&&!!document.querySelector('.textLayer span'),n)}
async function gotoPage(n){await target('.pdf-page-button');await input('#pdf-page-number',String(n));await button('前往这一页');await ime(false);await pdfPage(n)}
async function swipe(direction){const d=await c.evaluate(()=>{const r=document.querySelector('.pdf-viewport').getBoundingClientRect();return{r:r.toJSON(),s:devicePixelRatio}}),y=83+(d.r.y+Math.min(200,d.r.height*.45))*d.s;adb('shell','input','swipe',String(Math.round((direction>0?.8:.2)*393*d.s)),String(Math.round(y)),String(Math.round((direction>0?.2:.8)*393*d.s)),String(Math.round(y+3*d.s)),'240');await sleep(350)}
async function normalizePdf(){await button('PDF 操作');await button('阅读设置');report.pdfDisplayBefore=await c.evaluate(()=>[...document.querySelectorAll('.pdf-setting-row')].map(e=>e.innerText));await target('.pdf-setting-row:nth-child(1)');await button('逐页阅读');await pdfPage(3);await button('PDF 操作');await button('阅读设置');await target('.pdf-setting-row:nth-child(2)');await button('原始方向');await pdfPage(3);await button('PDF 操作');await button('阅读设置');await target('.pdf-setting-row:nth-child(3)');await button('适合宽度');await button('应用缩放');await pdfPage(3);assert.ok(await c.evaluate(()=>document.querySelector('.pdf-viewport').classList.contains('pdf-can-swipe')));report.checks.push('Existing PDF rotation/continuous/zoom is recorded, then actual settings choices explicitly enter single-page, original orientation and fit-width before gesture acceptance. Original paper bytes, existing annotations and bookmarks are retained.')}
async function reviewStructures() {
  await preserved()
  for (const v of fixtures) {
    await open(v.name)
    await browse()
    await snapshot(v.format+'-tree')
    if (v.format==='xml') await field(v.group)
    await field(v.format==='toml'?'fontSize':v.field)
    await snapshot(v.format+'-detail')
    await button('修改')
    const value=v.format==='toml'?'18':v.format==='xml'?'reading':'night'
    const selector='#'+v.format+'-value'
    await input(selector,value)
    await snapshot(v.format+'-edit-ime')
    await button('核对这次修改')
    await wait(()=>!!document.querySelector('.structured-review'))
    await ime(false)
    await snapshot(v.format+'-review')
    await back()
    await ime(true)
    assert.equal(await c.evaluate(s=>document.querySelector(s)?.value,selector),value)
    await back()
    await ime(false)
    assert.ok(await c.evaluate(s=>!!document.querySelector(s),selector))
    await button('取消修改')
    await wait(()=>!document.querySelector('.structured-form'))
    await draft(v.name,null)
    await back()
    if (v.format==='xml') await back()
    await wait(()=>!!document.querySelector('.structured-tabs')?.getBoundingClientRect().height)
    if (v.format==='toml') {
      await button('检查 TOML')
      await wait(()=>document.querySelector('.toml-diagnostic-result-title')?.textContent==='TOML 1.0 检查通过')
      await snapshot('toml-direct-check')
      await back()
      await wait(()=>document.activeElement?.classList.contains('toml-tree-check'))
    }
    await closeDocument()
    report.checks.push(v.format+': physical tree/detail/edit, real Gboard, candidate review and keyboard-first Back restore the input; explicit Cancel creates no draft and preserves exact source.')
  }
  await button('设置')
  await target('[data-focus-key="settings-appearance"]')
  await target('label[data-theme="dark"]')
  await wait(()=>document.querySelector('.mobile-app').classList.contains('theme-dark'))
  await back()
  await back()
  originalScale=adb('shell','settings','get','system','font_scale').toString().trim()
  report.originalFontScale=originalScale
  adb('shell','settings','put','system','font_scale','2.0')
  await wait(()=>getComputedStyle(document.documentElement).fontSize==='32px')
  for (const v of fixtures) {
    await open(v.name)
    await browse()
    await snapshot(v.format+'-dark-font200-tree')
    await closeDocument()
  }
  report.checks.push('Actual dark theme and Android 200% fonts retain the three structure views and their reachable controls. Direct TOML check returns to the tree with its opener focused.')
  report.passed=true
}
async function reviewTomlCheckOrigins() {
  await preserved()
  if(await c.evaluate(()=>document.querySelector('.mobile-app').classList.contains('theme-dark'))){
    await button('设置')
    await target('[data-focus-key="settings-appearance"]')
    await target('label[data-theme="light"]')
    await wait(()=>!document.querySelector('.mobile-app').classList.contains('theme-dark'))
    await back()
    await back()
  }
  for(const v of fixtures){
    await open(v.name)
    await browse()
    await snapshot(v.format+'-tree')
    if(v.format!=='toml')await closeDocument()
  }
  await button('检查 TOML')
  await wait(()=>document.querySelector('.toml-diagnostic-result-title')?.textContent==='TOML 1.0 检查通过')
  await snapshot('toml-tree-check')
  await button('返回结构树')
  await wait(()=>document.activeElement?.classList.contains('toml-tree-check'))
  await back()
  await wait(()=>document.activeElement?.dataset.focusKey==='toml-structure-entry')
  await button('检查 TOML')
  await wait(()=>document.querySelector('.toml-diagnostic-result-title')?.textContent==='TOML 1.0 检查通过')
  await snapshot('toml-menu-check')
  await button('返回操作菜单')
  await wait(()=>document.activeElement?.dataset.focusKey==='toml-diagnostic-entry')
  await preserved()
  report.checks.push('Physical header Back has the correct accessible destination and restores the matching opener from both the TOML tree and the source menu.')
  report.passed=true
}
async function reviewLargePreviewReflow() {
  await preserved()
  await button('设置')
  await target('[data-focus-key="settings-appearance"]')
  await target('label[data-theme="dark"]')
  await wait(()=>document.querySelector('.mobile-app').classList.contains('theme-dark'))
  await back()
  await back()
  originalScale=adb('shell','settings','get','system','font_scale').toString().trim()
  report.originalFontScale=originalScale
  adb('shell','settings','put','system','font_scale','2.0')
  await wait(()=>getComputedStyle(document.documentElement).fontSize==='32px')
  for(const v of fixtures){
    await open(v.name)
    await browse()
    if(v.format!=='toml'){
      const previews=await c.evaluate(format=>{
        const label=format==='yaml'?'language':'book[1]'
        const field=[...document.querySelectorAll('.structured-field')].find(e=>e.querySelector('strong')?.textContent===label)
        return [...(field?.querySelectorAll('.structured-preview,.structured-attribute')||[])].map(e=>({text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth}))
      },v.format)
      assert.equal(previews.length,v.format==='yaml'?1:2)
      for(const preview of previews)assert.ok(preview.scroll<=preview.width+1,JSON.stringify(preview))
    }
    await snapshot(v.format+'-dark-font200-tree')
    await closeDocument()
  }
  await preserved()
  report.checks.push('All three final Android trees were reopened at 200% in dark mode. YAML and XML sample preview widths match the real text without ellipses.')
  report.passed=true
}
async function reviewPdfNavigation() {
  await preserved()
  if(await c.evaluate(()=>document.querySelector('.mobile-app').classList.contains('theme-dark'))){
    await button('设置')
    await target('[data-focus-key="settings-appearance"]')
    await target('label[data-theme="light"]')
    await wait(()=>!document.querySelector('.mobile-app').classList.contains('theme-dark'))
    await back()
    await back()
  }
  await open(pdf.relativePath)
  await wait(()=>!!document.querySelector('.pdf-page-button'))
  await gotoPage(3)
  const standard=await c.evaluate(()=>{
    const paper=document.querySelector('.pdf-page-surface')?.getBoundingClientRect()
    return paper?.width<paper?.height&&document.querySelector('.pdf-viewport').classList.contains('pdf-can-swipe')
  })
  if(!standard)await normalizePdf()
  await checkPdfTitle(true)
  await snapshot('reader')
  await swipe(1)
  await pdfPage(4)
  await swipe(-1)
  await pdfPage(3)
  await button('目录与页面')
  await wait(()=>document.querySelector('.pdf-outline [aria-current="location"]')?.textContent.includes('带着想法返回'))
  await snapshot('outline')
  await target('.pdf-outline .is-root button[aria-expanded="true"]')
  await wait(()=>![...document.querySelectorAll('.pdf-outline-link')].some(e=>e.textContent.includes('带着想法返回')))
  await target('.pdf-outline .is-root button[aria-expanded="false"]')
  await wait(()=>document.querySelector('.pdf-outline [aria-current="location"]')?.textContent.includes('带着想法返回'))
  const chapter=await rect(title=>[...document.querySelectorAll('.pdf-outline-link')].find(e=>e.textContent.startsWith(title))?.getBoundingClientRect().toJSON(),'继续思考')
  await tap(chapter,'Open real chapter for page 5')
  await pdfPage(5)
  await gotoPage(3)
  await button('目录与页面')
  await button('页面')
  await thumbnails()
  await snapshot('pages')
  await target('[data-nav-key="next-batch"]')
  await wait(()=>!!document.querySelector('[data-nav-key="page-9"]'))
  await back()
  await pdfPage(3)
  await wait(()=>document.activeElement?.classList.contains('pdf-navigation-opener'))
  await button('目录与页面')
  await wait(()=>!!document.querySelector('[data-nav-key="page-9"]'))
  await target('[data-nav-key="current-page"]')
  await wait(()=>document.activeElement?.dataset.navKey==='page-3')
  await target('[data-nav-key="next-batch"]')
  await wait(()=>!!document.querySelector('[data-nav-key="page-9"]'))
  await target('[data-nav-key="page-9"]')
  await pdfPage(9)
  await gotoPage(3)
  await button('目录与页面')
  await wait(()=>document.querySelector('.pdf-page-preview[aria-current="page"]')?.dataset.navKey==='page-3')
  assert.equal(await c.evaluate(()=>!!document.querySelector('[data-nav-key="page-9"]')),false)
  await thumbnails()
  await snapshot('pages-returned')
  await back()
  await pdfPage(3)
  await preserved()
  report.checks.push('Real Android swipes turn 3→4→3. Collapsing and expanding the outline restores the current chapter, selecting a chapter opens its real page 5, thumbnail Back keeps the browsed batch, Return to current focuses page 3, and a jump in reading resets the stale batch.')

  await closeDocument()
  await button('设置')
  await target('[data-focus-key="settings-appearance"]')
  await target('label[data-theme="dark"]')
  await wait(()=>document.querySelector('.mobile-app').classList.contains('theme-dark'))
  await back()
  await back()
  originalScale=adb('shell','settings','get','system','font_scale').toString().trim()
  report.originalFontScale=originalScale
  adb('shell','settings','put','system','font_scale','2.0')
  await wait(()=>getComputedStyle(document.documentElement).fontSize==='32px')
  await open(pdf.relativePath)
  await pdfPage(3)
  await checkPdfTitle()
  await snapshot('dark-font200-reader')
  await button('目录与页面')
  await wait(()=>!!document.querySelector('.pdf-outline-page'))
  await snapshot('dark-font200-outline')
  await button('页面')
  await thumbnails()
  await snapshot('dark-font200-pages')
  await back()
  await pdfPage(3)
  await preserved()
  report.checks.push('Dark Android system 200% retains the original PDF canvas, the three reading actions, real outline destinations and six rendered thumbnails.')
  report.passed=true
}
async function checkPdfTitle(singleLine=false){
  const title=await c.evaluate(()=>{
    const heading=document.querySelector('.mobile-pdf .reader-header h1'),style=getComputedStyle(heading)
    const stem=heading.querySelector('.pdf-file-stem'),suffix=heading.querySelector('.pdf-file-suffix'),rect=heading.getBoundingClientRect(),suffixRect=suffix.getBoundingClientRect()
    return {font:style.fontSize,stemFont:getComputedStyle(stem).fontSize,suffixFont:getComputedStyle(suffix).fontSize,height:rect.height,lineHeight:parseFloat(style.lineHeight),suffixFits:suffixRect.bottom<=rect.bottom+1&&suffixRect.right<=rect.right+1}
  })
  assert.equal(title.stemFont,title.font)
  assert.equal(title.suffixFont,title.font)
  assert.ok(title.suffixFits&&title.height<=title.lineHeight*(singleLine?1:2)+1,JSON.stringify(title))
}
async function thumbnails(){
  await wait(()=>document.querySelectorAll('.pdf-page-preview canvas').length===6&&[...document.querySelectorAll('.pdf-page-preview canvas')].every(canvas=>canvas.width>1&&canvas.getBoundingClientRect().height>0))
}
try{
 await connect();assert.equal(await c.evaluate(()=>innerWidth),393)
 if(stage.startsWith('prepare')){const list=await c.invoke({op:'list',rootId:'local',relativePath:''});assert.equal(list.truncated,false);for(const v of fixtures){assert.ok(!list.entries.some(e=>e.relativePath===v.name));await c.invoke({op:'write',rootId:'local',relativePath:v.name,content:v.source,expectedSignature:null});assert.equal(await source(v.name),v.source)}report.preparationOnly=true;report.passed=true}
 else if(pdfOnly)await reviewPdfNavigation()
 else if(structuresOnly){
  if(stage==='combined-check-origins')await reviewTomlCheckOrigins()
  else if(stage.startsWith('combined-large-reflow'))await reviewLargePreviewReflow()
  else await reviewStructures()
 }
 else{
  const resume=process.env.LONGEDIT_NATIVE_RESUME_FORMAT;if(resume){assert.ok(['xml','xml-draft','yaml-input','pdf'].includes(resume));if(resume!=='yaml-input')expected.set(fixtures[0].name,fixtures[0].source.replace('"forest"','"night"'));if(resume==='pdf'){expected.set(fixtures[1].name,fixtures[1].source.replace('category="design"','category="reading"'));expected.set(fixtures[2].name,fixtures[2].source.replace('fontSize = 17','fontSize = 18'))}report.resume={after:resume==='pdf'?'acceptance8':resume==='yaml-input'?'acceptance7':resume==='xml'?'acceptance3':'acceptance4',from:resume}}await preserved();for(const v of fixtures)await draft(v.name,resume==='xml-draft'&&v.format==='xml'?v.source.replace('category="design"','category="reading"'):null);report.startingSourceIntegrity=true
  if(resume==='xml-draft'){const v=fixtures[1];await finishSave(v.name,v.source.replace('category="design"','category="reading"'));await closeDocument();report.checks.push('Resumed the intact XML draft left by acceptance4. System Back commits/dismisses real Gboard composition before Undo/Redo, followed by explicit exact save; no pending data was reset.')}
  if(resume==='pdf')await closeDocument();if(resume==='yaml-input'){assert.equal(await c.evaluate(()=>document.querySelector('#yaml-value')?.value),'fnight');report.resume.pendingInput='fnight';await back();await ime(false);await back();await back();await wait(()=>!!document.querySelector('.structured-tabs'));report.checks.push('The unsubmitted fnight from acceptance7 is retained while going back to the tree. Reopening Continue modification must restore it before deliberate physical correction to night. Native deletion is now observed one Backspace at a time, rather than assuming a rapid ADB key batch was fully processed.')}else await wait(()=>!!document.querySelector('.phone-library'))
  if(await c.evaluate(()=>document.querySelector('.mobile-app').classList.contains('theme-dark'))){await button('设置');await target('[data-focus-key="settings-appearance"]');await target('[data-focus-key="settings-theme"]');await button('浅色');await back();await back()}
  for(const v of fixtures.filter(v=>resume!=='pdf'&&(!resume||resume==='yaml-input'||v.format!=='yaml'&&(resume!=='xml-draft'||v.format!=='xml')))){if(!(resume==='yaml-input'&&v.format==='yaml')){await open(v.name);await browse()}else activeName=v.name;await snapshot(v.format+'-tree');if(v.format==='xml')await field(v.group);await field(v.format==='toml'?'fontSize':v.field);await snapshot(v.format+'-detail');await button(resume==='yaml-input'&&v.format==='yaml'?'继续修改':'修改');await ime(true);if(resume==='yaml-input'&&v.format==='yaml')assert.equal(await c.evaluate(()=>document.querySelector('#yaml-value').value),'fnight');const value=v.format==='yaml'?'night':v.format==='xml'?'reading':'18';await input('#'+v.format+'-value',value);await snapshot(v.format+'-edit-ime');if(v.format==='toml')assert.equal(await c.evaluate(()=>document.querySelector('#toml-value').getAttribute('inputmode')),'decimal');await button('核对这次修改');await wait(()=>!!document.querySelector('.structured-review'));await ime(false);await snapshot(v.format+'-review');await back();await ime(true);assert.equal(await c.evaluate(f=>document.querySelector('#'+f+'-value').value,v.format),value);await back();await ime(false);assert.ok(await c.evaluate(f=>!!document.querySelector('#'+f+'-value-form'),v.format));await button('核对这次修改');await wait(()=>!!document.querySelector('.structured-review'));const next=v.format==='yaml'?v.source.replace('"forest"','"night"'):v.format==='xml'?v.source.replace('category="design"','category="reading"'):v.source.replace('fontSize = 17','fontSize = 18');await save(v.name,next);await closeDocument()}
  if(resume!=='pdf')report.checks.push('All three actual structure trees, details, editing with real English/decimal Gboard and separate review are opened. Review Back preserves input; system Back first dismisses IME. Each exact BOM/CRLF patch is independently applied, undone, redone and explicitly saved only in its new synthetic file.')
  await open(pdf.relativePath);await wait(()=>!!document.querySelector('.pdf-page-button'));await gotoPage(3);await normalizePdf();await snapshot('pdf-reader');await swipe(1);await pdfPage(4);await swipe(-1);await pdfPage(3);await button('目录与页面');await wait(()=>!!document.querySelector('.pdf-outline-page'));await snapshot('pdf-outline');await button('页面');await wait(()=>document.querySelectorAll('.pdf-page-preview canvas').length===6&&[...document.querySelectorAll('.pdf-page-preview canvas')].every(e=>e.width>1));await snapshot('pdf-pages');await back();await pdfPage(3);await button('PDF 操作');await snapshot('pdf-menu');await button('阅读设置');await target('.pdf-setting-row:nth-child(3)');await button('放大 PDF');await back();await wait(()=>!document.querySelector('.pdf-settings-layer'));await back();await wait(()=>!!document.querySelector('.pdf-action-menu'));assert.equal(await c.evaluate(()=>document.activeElement?.dataset.pdfAction),'settings');await back();await button('在 PDF 内查找');await input('.pdf-search-task input[type=search]','reading');await snapshot('pdf-search-ime');await back();await ime(false);assert.ok(await c.evaluate(()=>!!document.querySelector('.pdf-search-task')?.getBoundingClientRect().height));await button('查找');await wait(()=>!!document.querySelector('.pdf-results button'));await ime(false);await snapshot('pdf-search-results');await target('[data-search-page="3"]');await pdfPage(3);await back();await wait(()=>!!document.querySelector('.pdf-search-task')?.getBoundingClientRect().height);await back();await pdfPage(3);await preserved();await closeDocument();report.checks.push('The original PDF is identified by its pre-existing byte hash. Real horizontal swipes go 3→4→3; actual outline destinations, thumbnails and the three bottom actions are opened. Settings option Back→settings→original menu and keyboard-first search Back retain page 3 and source bytes.')
  await button('设置');await target('[data-focus-key="settings-appearance"]');await target('[data-focus-key="settings-theme"]');await button('深色');await back();await back();await open(fixtures[0].name);await browse();await snapshot('yaml-dark-tree');await closeDocument();await open(fixtures[2].name);await browse();await field('fontSize');await button('修改');await input('#toml-value','19');originalScale=adb('shell','settings','get','system','font_scale').toString().trim();report.originalFontScale=originalScale;adb('shell','settings','put','system','font_scale','2.0');await sleep(1400);await snapshot('font200-toml-edit-ime');await button('核对这次修改');await wait(()=>!!document.querySelector('.structured-review'));await ime(false);await snapshot('font200-toml-review');await back();await ime(true);await button('取消修改');await ime(false);await closeDocument();await open(pdf.relativePath);await pdfPage(3);await snapshot('font200-pdf-reader');await button('目录与页面');await button('页面');await wait(()=>document.querySelectorAll('.pdf-page-preview canvas').length===6&&[...document.querySelectorAll('.pdf-page-preview canvas')].every(e=>e.width>1));await snapshot('font200-pdf-pages');await preserved();report.checks.push('Actual dark YAML and Android 200% TOML numeric Gboard/review plus PDF reading/pages retain checked controls and current fields. The unsaved 19 is explicitly cancelled; saved TOML stays 18. Existing source, annotation and bookmark bytes are independently checked at closeout.');report.expectedSources=Object.fromEntries(expected);report.pdf=pdf;report.passed=true
 }
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;try{await writeFile(out+'/'+stage+'-failure.png',adb('exec-out','screencap','-p'))}catch{}}
finally{
 if(originalScale!==undefined){
  for(let attempt=0;attempt<3;attempt++){
   if(originalScale==='null')adb('shell','settings','delete','system','font_scale')
   else adb('shell','settings','put','system','font_scale',originalScale)
   await sleep(900)
   report.restoredScale=adb('shell','settings','get','system','font_scale').toString().trim()
   if(report.restoredScale===originalScale)break
  }
  if((structuresOnly||pdfOnly)&&report.restoredScale!==originalScale){report.passed=false;report.failure='Original Android font scale was not restored';process.exitCode=1}
 }
 c?.close();await writeFile(out+'/'+stage+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({stage,passed:report.passed,snapshots:report.snapshots.length,checks:report.checks,failure:report.failure},null,2))
}
