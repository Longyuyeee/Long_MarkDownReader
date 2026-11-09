import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {mobileAdb as adb,connectMobileWebView,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
import {textV3Name,textV3Source,longTextV3Name,longTextV3Source} from './fixtures/mobile-text-v3.mjs'
const stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const out=process.env.LONGEDIT_TEXT_NATIVE_OUTPUT||'docs/evidence/mobile-0.1.0/text-v3-2026-11-05/native',path=out+'/'+stage+'.json';await assert.rejects(access(path))
const report={scope:'Actual API29 / WebView124 / x86_64 disposable Android session. Physical ADB taps, long press and system Back; CDP reads geometry, state and native storage. Fixture preparation is explicitly separate from UI evidence. No ARM, native Chinese composition or TalkBack claim.',actions:[],checks:[],snapshots:[],passed:false},sleep=ms=>new Promise(r=>setTimeout(r,ms));let c,originalScale
async function connect(){for(let n=0;n<60;n++){try{c=await connectMobileWebView();return}catch(e){if(n===59)throw e;await sleep(200)}}}
async function wait(fn,arg){for(let n=0;n<100;n++){if(await c.evaluate(fn,arg))return;await sleep(150)}throw Error('Native UI not ready '+fn)}
async function tap(rect,label){assert.ok(rect&&rect.height>0,label);const dims=await c.evaluate(()=>({s:devicePixelRatio,h:innerHeight}));assert.ok(rect.y>=0&&rect.y+rect.height/2<dims.h,JSON.stringify({label,rect,dims}));const x=Math.round((rect.x+rect.width/2)*dims.s),y=Math.round(83+(rect.y+rect.height/2)*dims.s);report.actions.push({label,rect,x,y});adb('shell','input','tap',String(x),String(y));await sleep(300)}
async function target(selector,label=selector){await tap(await c.evaluate(s=>document.querySelector(s)?.getBoundingClientRect().toJSON(),selector),label)}
async function button(label){await tap(await c.evaluate(label=>[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height&&!e.disabled&&!e.closest('[inert]')).find(e=>e.getAttribute('aria-label')===label||e.textContent.trim()===label)?.getBoundingClientRect().toJSON(),label),label)}
async function back(){adb('shell','input','keyevent','4');await sleep(400)}
async function open(name) {
  await wait(() => !!document.querySelector('.phone-library button.file-row'))
  for (let attempt = 0; attempt < 40; attempt++) {
    const row = await c.evaluate(name => {
      const file = [...document.querySelectorAll('.phone-library button.file-row')].find(e => e.querySelector('strong')?.textContent === name)
      return file?.getBoundingClientRect().toJSON()
    }, name)
    if (row && row.y > 120 && row.bottom < 650) {
      await tap(row, 'Open ' + name)
      return
    }
    const more = await c.evaluate(() => {
      const button = [...document.querySelectorAll('.phone-library button')].find(e => /^再显示 \d+ 项$/.test(e.textContent.trim()))
      const box = button?.getBoundingClientRect()
      return box && box.top > 120 && box.bottom < 650 ? box.toJSON() : null
    })
    if (!row && more) await tap(more, 'Show more library files')
    else {
      const down = !row || row.y >= 120
      adb('shell', 'input', 'swipe', '540', down ? '1700' : '650', '540', down ? '650' : '1700', '550')
      await sleep(400)
    }
  }
  throw Error('Fixture not reached ' + name)
}
async function reader(fn){const tree=await c.command('Page.getFrameTree',{}),child=tree.frameTree.childFrames?.find(f=>f.frame.url==='about:srcdoc');assert.ok(child);const world=await c.command('Page.createIsolatedWorld',{frameId:child.frame.id,worldName:'text-v3-read-only',grantUniveralAccess:false});const r=await c.command('Runtime.evaluate',{contextId:world.executionContextId,expression:`(${fn})()`,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function verifySources(){for(const[name,content]of [[textV3Name,textV3Source],[longTextV3Name,longTextV3Source]])assert.equal((await c.invoke({op:'read',rootId:'local',relativePath:name})).content,content,name)}
async function snapshot(name){const id=stage+'-'+name;c.close();c=null;const r=spawnSync(process.execPath,['scripts/review-mobile-markdown-native.mjs','observe',id],{timeout:45000,encoding:'utf8',maxBuffer:3*1024*1024,env:{...process.env,LONGEDIT_MARKDOWN_NATIVE_OUTPUT:out}});await writeFile(out+'/'+id+'-observation.log',r.stdout+r.stderr);assert.equal(r.status,0,r.stdout+r.stderr);await connect();const state=await c.evaluate(()=>{const box=s=>document.querySelector(s)?.getBoundingClientRect().toJSON()||null;return{width:innerWidth,height:innerHeight,theme:document.querySelector('.mobile-app').className,header:box('.reader-header'),footer:box('.editor-footer'),pager:box('.source-pager'),dialog:box('.source-page-dialog'),input:box('#source-page-number'),fieldValue:document.querySelector('#source-page-number')?.value,actions:[...document.querySelectorAll('.source-page-dialog footer button')].map(e=>({text:e.textContent.trim(),rect:e.getBoundingClientRect().toJSON()})),sourceFont:document.querySelector('.source-page-content')?getComputedStyle(document.querySelector('.source-page-content')).fontSize:null,overflow:document.documentElement.scrollWidth>innerWidth}});assert.equal(state.overflow,false);report.snapshots.push({name,...state});return state}
async function closeDocument(){for(let n=0;n<5;n++){if(await c.evaluate(()=>!!document.querySelector('.phone-library')))return;await back()}throw Error('Did not return to library')}
async function ime(shown){for(let n=0;n<40;n++){if(/mInputShown=true/.test(adb('shell','dumpsys','input_method').toString())===shown)return;await sleep(150)}throw Error('Actual Gboard visibility '+shown)}
try{
 await connect();assert.equal(await c.evaluate(()=>innerWidth),393);assert.match(adb('shell','dumpsys','window','windows').toString(),/mFrame=\[0,0\]\[1080,83\]/)
 if(stage==='prepare'){
  const entries=await c.invoke({op:'list',rootId:'local',relativePath:''});assert.equal(entries.truncated,false)
  for(const[name,content]of [[textV3Name,textV3Source],[longTextV3Name,longTextV3Source]]){assert.ok(!entries.entries.some(e=>e.relativePath===name),'Fixture already exists');await c.invoke({op:'write',rootId:'local',relativePath:name,content,expectedSignature:null})}await verifySources();report.preparationOnly=true;report.passed=true
 }else{
  await open(textV3Name);await wait(()=>!!document.querySelector('.txt-reading iframe.mobile-reader'));await sleep(600);const short=await snapshot('short');assert.equal(short.header.height,56);assert.equal(short.footer,null);const text=await reader(()=>({content:document.querySelector('pre').textContent,font:getComputedStyle(document.querySelector('pre')).fontSize,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(text.content,textV3Source.replaceAll('\r\n','\n'));assert.equal(text.font,'17px');assert.equal(text.overflow,false)
  const glyph=await reader(()=>{const node=document.querySelector('pre').firstChild,at=node.textContent.indexOf('雨');const r=document.createRange();r.setStart(node,at);r.setEnd(node,at+1);return r.getBoundingClientRect().toJSON()}),frame=await c.evaluate(()=>document.querySelector('iframe.mobile-reader').getBoundingClientRect().toJSON());const px=Math.round((frame.x+glyph.x+glyph.width/2)*2.75),py=Math.round(83+(frame.y+glyph.y+glyph.height/2)*2.75);adb('shell','input','swipe',String(px),String(py),String(px),String(py),'850');await sleep(600);report.selection=await reader(()=>getSelection()?.toString());assert.ok(report.selection?.length);await snapshot('selection');await back();assert.ok(await c.evaluate(()=>!!document.querySelector('.txt-reading')))
  await button('编辑');await wait(()=>!!document.querySelector('.cm-editor'));await ime(true);await snapshot('edit-ime');await back();await ime(false);assert.ok(await c.evaluate(()=>!!document.querySelector('.cm-editor')));for(let n=0;n<3;n++){await back();if(await c.evaluate(()=>!!document.querySelector('.txt-reading')))break}await wait(()=>!!document.querySelector('.txt-reading'));await verifySources();report.checks.push('C1 has a 56dp bar, header Edit and 17px literal text without a footer; actual long-press selection and Gboard/Edit/Back return to the same reading task with exact BOM/CRLF source')
  await closeDocument();await open(longTextV3Name);await wait(()=>!!document.querySelector('.source-fragment'));await sleep(1000);
  // A rerun starts from the real saved state of our own fixture, then resets it through physical controls.
  if(await c.evaluate(()=>!!document.querySelector('.document-search input'))){await target('.document-search input');await ime(true);const length=await c.evaluate(()=>document.querySelector('.document-search input').value.length);adb('shell','input','keyevent','123',...Array(length).fill('67'));await wait(()=>document.querySelector('.document-search input').value==='');await button('关闭文档查找');await ime(false)}
  if(!await c.evaluate(()=>document.querySelector('.source-pager [role=status]').textContent.trim().startsWith('1 /'))){await target('.source-jump-opener');await ime(true);adb('shell','input','text','1');await button('前往');await wait(()=>document.querySelector('.source-pager [role=status]').textContent.trim().startsWith('1 /'))}
  const total=await c.evaluate(()=>Number(document.querySelector('.source-pager [role=status]').textContent.trim().split('/')[1]));report.actualSegments=total;assert.ok(total>12);assert.equal(await c.evaluate(()=>document.querySelectorAll('.source-pager button').length),3);assert.equal(await c.evaluate(()=>!!document.querySelector('.editor-footer')),false);await snapshot('long')
  await target('.source-jump-opener');await ime(true);await snapshot('jump-ime');adb('shell','input','text','0');await button('前往');await wait(()=>!!document.querySelector('.source-page-dialog [role=alert]'));assert.ok(await c.evaluate(()=>document.querySelector('.source-pager [role=status]').textContent.trim().startsWith('1 /')));await snapshot('jump-error');await target('#source-page-number');adb('shell','input','keyevent','67');adb('shell','input','text','12');await wait(()=>document.querySelector('#source-page-number').value==='12');await back();await ime(false);assert.ok(await c.evaluate(()=>!!document.querySelector('.source-page-dialog')));await snapshot('jump-hidden');await back();await wait(()=>!document.querySelector('.source-page-dialog'));assert.equal(await c.evaluate(()=>document.activeElement.classList.contains('source-jump-opener')),true)
  await target('.source-jump-opener');await wait(()=>document.querySelector('#source-page-number').value==='12');await ime(true);await back();await button('分段阅读说明');await wait(()=>!!document.querySelector('.mobile-help-backdrop'));assert.equal(await c.evaluate(()=>document.querySelector('.source-page-layer').getBoundingClientRect().height),0);await snapshot('jump-help');await back();await wait(()=>!document.querySelector('.mobile-help-backdrop'));assert.equal(await c.evaluate(()=>document.querySelector('#source-page-number').value),'12');assert.equal(await c.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'分段阅读说明');await button('前往');await wait(()=>document.querySelector('.source-pager [role=status]').textContent.trim().startsWith('12 /'));await snapshot('long12');report.checks.push('C2/C3 use three real segment controls and a compact modal; real numeric Gboard, invalid input, keyboard Back, modal Back, pending 12, opener focus, Help/Back and Go preserve the reading task')
  await button('在文档内查找');await ime(true);adb('shell','input','text','TrailFocusToken');report.actions.push({label:'Commit the actual Gboard English candidate',x:330,y:1518});adb('shell','input','tap','330','1518');await wait(()=>document.querySelector('.source-page-content mark')&&document.body.innerText.includes('1 / 1'));assert.equal(await c.evaluate(()=>[...document.querySelectorAll('.source-page-content mark')].map(e=>e.textContent).join('')),'TrailFocusToken');await back();await ime(false);await snapshot('search');await button('关闭文档查找');assert.equal(await c.evaluate(()=>document.activeElement?.classList.contains('txt-primary-action')),true);await closeDocument();await open(longTextV3Name);await wait(()=>document.body.innerText.includes('1 / 1'));assert.equal(await c.evaluate(()=>document.querySelector('[aria-label="查找文档内容"]').value),'TrailFocusToken');await button('关闭文档查找');await verifySources();report.checks.push('Header Find physically enters the unique final-segment match; closing and reopening retains query and match, and both complete native files remain byte-exact')
  await closeDocument();await button('设置');await target('[data-focus-key="settings-appearance"]');await target('label[data-theme="dark"]');await back();await back();await wait(()=>!!document.querySelector('.phone-library'));await open(textV3Name);await wait(()=>!!document.querySelector('.txt-reading'));await sleep(500);const dark=await snapshot('dark');assert.ok(dark.theme.includes('theme-dark'));await closeDocument();await open(longTextV3Name);await wait(()=>!!document.querySelector('.source-fragment'));await target('.source-jump-opener');await ime(true);await back();
  originalScale=adb('shell','settings','get','system','font_scale').toString().trim()
  report.originalFontScale=originalScale
  adb('shell','settings','put','system','font_scale','2.0')
  await wait(()=>getComputedStyle(document.documentElement).fontSize==='32px')
  for(const state of ['font200','font200-ime']){
    if(state==='font200-ime'){await target('#source-page-number');await ime(true)}
    const large=await snapshot(state)
    assert.ok(large.input?.y>=large.dialog.y&&large.input.bottom<=large.height)
    assert.equal(large.actions.length,2)
    for(const button of large.actions)assert.ok(button.rect.height>=48&&button.rect.bottom<=large.height)
  }
  await back();await ime(false);await back()
  await verifySources()
  report.checks.push('Dark theme and Android 200% text keep the jump field and both actions reachable with and without numeric Gboard')
  report.passed=true
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
 await writeFile(path,JSON.stringify(report,null,2))
 console.log(JSON.stringify({stage,passed:report.passed,checks:report.checks,failure:report.failure},null,2))
}
