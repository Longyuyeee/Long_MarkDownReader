import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {mobileAdb as adb,connectMobileWebView,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
import {markdownV3Name,markdownV3Source,markdownV3Code} from './fixtures/mobile-markdown-v3.mjs'
const out=process.env.LONGEDIT_MARKDOWN_NATIVE_OUTPUT||'docs/evidence/mobile-0.1.0/markdown-v3-2026-11-05/native';await assert.rejects(access(out+'/acceptance.json'))
const report={scope:'Actual installed API29/WebView124 x86_64. Physical ADB taps/swipes/Back and Gboard. Read-only DOM locates targets; no CSS injection or DOM click/input simulation. Native copy confirmed by ClipboardManager readback and OS paste into the synthetic document, then Undo. No ARM or TalkBack acceptance.',actions:[],checks:[],passed:false},sleep=ms=>new Promise(r=>setTimeout(r,ms));let c
const resumeDark=process.argv.includes('--resume-dark')
let scaleToRestore
if(resumeDark){const prior=JSON.parse(await readFile(out+'/attempt3.json','utf8'));assert.equal(prior.checks.length,3);report.actions=prior.actions;report.checks=prior.checks;report.continuedFrom='attempt3.json';report.systemNightModeLimitation='This API29 image reports mNightModeLocked=true; cmd uimode night yes returns no. Dark rendering is validated through the real app theme picker instead.'}
async function connect(){for(let n=0;n<50;n++){try{c=await connectMobileWebView();return}catch(e){if(n===49)throw e;await sleep(200)}}}
async function wait(fn,arg){for(let n=0;n<100;n++){if(await c.evaluate(fn,arg))return;await sleep(150)}throw Error('Native task not ready: '+fn)}
async function frame(fn,arg){const tree=await c.command('Page.getFrameTree',{}),child=tree.frameTree.childFrames?.find(f=>f.frame.url==='about:srcdoc');assert.ok(child);const world=await c.command('Page.createIsolatedWorld',{frameId:child.frame.id,worldName:'markdown-v3-acceptance',grantUniveralAccess:false}),r=await c.command('Runtime.evaluate',{contextId:world.executionContextId,expression:`(${fn})(${JSON.stringify(arg)??'undefined'})`,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function tapRect(rect,label,frameOffset=0){const screen=await c.evaluate(()=>({scale:devicePixelRatio,height:innerHeight}));assert.ok(rect&&rect.height>0&&rect.y+frameOffset>=0&&rect.y+frameOffset+rect.height/2<screen.height,JSON.stringify({label,rect,screen}));const x=Math.round((rect.x+rect.width/2)*screen.scale),y=Math.round(83+(rect.y+rect.height/2+frameOffset)*screen.scale);report.actions.push({label,rect,frameOffset,x,y});adb('shell','input','tap',String(x),String(y));await sleep(350)}
async function button(label){const rect=await c.evaluate(label=>[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height&&!e.disabled&&!e.closest('[inert]')).find(e=>e.getAttribute('aria-label')===label||e.textContent.trim()===label)?.getBoundingClientRect().toJSON(),label);await tapRect(rect,label)}
async function observe(stage){c.close();c=null;const r=spawnSync(process.execPath,['scripts/review-mobile-markdown-native.mjs','observe',stage],{timeout:40000,encoding:'utf8',maxBuffer:3*1024*1024});await writeFile(out+'/'+stage+'-observation.log',r.stdout+r.stderr);assert.equal(r.status,0,r.stdout+r.stderr);await connect();return JSON.parse(await readFile(out+'/'+stage+'.json','utf8'))}
const source=async()=>assert.equal((await c.invoke({op:'read',rootId:'local',relativePath:markdownV3Name})).content,markdownV3Source)
async function openFixture() {
  await wait(() => !!document.querySelector('.phone-library button.file-row'))
  for (let attempt = 0; attempt < 30; attempt++) {
    assert.ok(await c.evaluate(() => !!document.querySelector('.phone-library')), 'List task changed during scrolling')
    const target = await c.evaluate(name => {
      const row = [...document.querySelectorAll('button.file-row')].find(e => e.querySelector('strong')?.textContent === name)
      return row?.getBoundingClientRect().toJSON()
    }, markdownV3Name)
    if (target && target.y > 120 && target.bottom < 650) {
      await tapRect(target, 'Open synthetic Markdown')
      return
    }
    const more = await c.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(e => /^再显示 \d+ 项$/.test(e.textContent.trim()))
      const rect = button?.getBoundingClientRect()
      return rect && rect.top > 120 && rect.bottom < 650 ? rect.toJSON() : null
    })
    if (!target && more) await tapRect(more, 'Show more library files')
    else {
      const down = !target || target.y >= 120
      report.actions.push({ label: 'Physical list swipe', observedTarget: target })
      adb('shell', 'input', 'swipe', '540', down ? '1700' : '650', '540', down ? '650' : '1700', '550')
      await sleep(400)
    }
  }
  throw Error('Fixture row not reached')
}
try{
 // The 83px system status-bar inset is read from this AVD's dumpsys window;
 // 1080x2280, density440, CSS393x751. Fail on a different configuration.
 assert.match(adb('shell','wm','size').toString(),/1080x2280/);assert.match(adb('shell','wm','density').toString(),/440/)
 assert.match(adb('shell','dumpsys','window','windows').toString(),/mFrame=\[0,0\]\[1080,83\]/)
 await connect();assert.deepEqual(await c.evaluate(()=>({width:innerWidth,height:innerHeight})),{width:393,height:751});await source()
 if(!resumeDark){
 await openFixture()
 await wait(()=>!!document.querySelector('.markdown-reading'));await sleep(500)
 const light=await observe('light');assert.equal(light.reader.title,'在城市里，慢慢阅读');assert.equal(light.reader.fontReady,true);assert.equal(light.reader.code,markdownV3Code);assert.ok(light.reader.syntax>10&&light.reader.table);assert.equal(light.reader.y,0);assert.equal(light.reader.background,'rgb(250, 251, 248)');assert.equal(light.page.geometry['.markdown-edit-fab'].width,56)
 report.checks.push('Installed light page renders offline title font, actual syntax tokens and bordered table, one 56px edit action, no horizontal page overflow; exact BOM/CRLF source unchanged')
 const copy=await frame(()=>document.querySelector('[data-longedit-copy-code="0"]')?.getBoundingClientRect().toJSON()),offset=await c.evaluate(()=>document.querySelector('iframe').getBoundingClientRect().y);await tapRect(copy,'Copy actual code',offset)
 for(let n=0;n<50;n++){if(await frame(()=>document.querySelector('.reader-code-status')?.textContent==='已复制'))break;assert.ok(n<49);await sleep(100)}
 await observe('code-copied');await source();await button('编辑');await wait(()=>!!document.querySelector('.cm-editor'))
 const editable=await c.evaluate(()=>document.querySelector('.cm-content').getBoundingClientRect().toJSON());await tapRect({...editable,width:Math.min(editable.width,100),height:Math.min(editable.height,48)},'Focus actual editor')
 for(let n=0;n<30;n++){if(/mInputShown=true/.test(adb('shell','dumpsys','input_method').toString()))break;assert.ok(n<29,'Gboard did not open');await sleep(200)}
 await observe('native-edit-ime');const before=await c.evaluate(()=>document.querySelector('.cm-content').innerText)
 adb('shell','input','keyevent','279');report.actions.push({label:'Android KEYCODE_PASTE from actual clipboard'});await sleep(650)
 const pasted=await c.evaluate(()=>document.querySelector('.cm-content').innerText);assert.equal(pasted.length-before.length,markdownV3Code.length);assert.ok(pasted.split("const books = ['阅读', '写作', '思考'];").length>=3)
 await button('撤销');await wait(before=>document.querySelector('.cm-content')?.innerText===before,before);await source()
 report.checks.push('Native ClipboardManager readback succeeds; Android OS Paste inserts the exact Unicode code text into the synthetic editor, one Undo restores the editor text and source file remains byte-identical')
 adb('shell','input','keyevent','4');report.actions.push({label:'First Android Back'});await wait(()=>!!document.querySelector('.cm-editor')&&innerHeight===751);await observe('native-back-keyboard')
 adb('shell','input','keyevent','4');report.actions.push({label:'Second Android Back'});await wait(()=>!!document.querySelector('.markdown-reading'));const back=await observe('native-back-reading');assert.equal(back.reader.y,0);await source()
 report.checks.push('Real Gboard opens; first Android Back closes only the keyboard, second Back returns from editing to the same reading position')
 }
 if(await c.evaluate(()=>!!document.querySelector('.has-document'))){adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('.has-document'))}
 if (!await c.evaluate(() => !!document.querySelector('.theme-dark'))) {
   await button('设置')
   const appearance = await c.evaluate(() => document.querySelector('[data-focus-key="settings-appearance"]').getBoundingClientRect().toJSON())
   await tapRect(appearance, 'Appearance')
   const darkCard = await c.evaluate(() => document.querySelector('[data-focus-key="theme-dark"]').closest('label').getBoundingClientRect().toJSON())
   await tapRect(darkCard, 'Dark theme')
   await wait(() => !!document.querySelector('.theme-dark'))
   adb('shell', 'input', 'keyevent', '4')
   await sleep(350)
   adb('shell', 'input', 'keyevent', '4')
   await wait(() => !!document.querySelector('.phone-library'))
 }
 await openFixture()
 await wait(()=>!!document.querySelector('.theme-dark.markdown-reading'));const dark=await observe('dark');assert.equal(dark.reader.background,'rgb(17, 28, 40)');assert.equal(dark.reader.y,0);assert.equal(dark.reader.fontReady,true)
 adb('shell','input','swipe','420','1040','420','1040','850');report.actions.push({label:'Actual Android long press on reading text'});await sleep(650)
 const selection=await frame(()=>getSelection()?.toString());assert.ok(selection?.length,'Native reading selection did not appear')
 await wait(() => !document.querySelector('.markdown-edit-fab')?.getBoundingClientRect().height)
 const selected=await observe('dark-selection');assert.ok(selected.reader.selection?.length);adb('shell','input','keyevent','4')
 await wait(() => !!document.querySelector('.markdown-edit-fab')?.getBoundingClientRect().height)
 assert.equal(await frame(() => getSelection()?.toString()), '')
 report.checks.push('Actual Android long press creates a text selection and platform action bubble; Back dismisses the selection while keeping the reading page')
 adb('shell','input','swipe','540','1800','540','650','400');report.actions.push({label:'Physical reading swipe to end'});await wait(()=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='100');const end=await observe('dark-end');assert.ok(Math.abs(end.reader.height-end.reader.viewport-end.reader.y)<2);await source()
 report.checks.push('Real app theme picker changes the reading page and native system bars to dark; actual swipe reaches the code ending and truthful 100% progress, with no document-wide horizontal overflow')
 scaleToRestore = adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim()
 adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0')
 await wait(() => getComputedStyle(document.documentElement).fontSize === '32px')
 await button('编辑')
 await wait(() => !!document.querySelector('.cm-editor') && innerHeight < 751)
 assert.match(adb('shell', 'dumpsys', 'input_method').toString(), /mInputShown=true/)
 const large = await observe('editor-large-ime')
 assert.equal(large.page.buttons.filter(button => ['撤销', '重做', '标题', '加粗', '列表', '图片与附件'].includes(button.label)).length, 6)
 assert.equal(await c.evaluate(() => {
   const cursor = document.querySelector('.cm-cursor-primary')
   const title = document.querySelector('.cm-md-bom-heading')
   return cursor && title && getComputedStyle(cursor).borderLeftColor === getComputedStyle(title).color
 }), true, 'Dark Android editor cursor matches the theme caret color')
 assert.equal(await c.evaluate(() => {
   const heading = document.querySelector('.document-heading h1')
   const range = document.createRange()
   range.selectNodeContents(heading)
   const box = heading.getBoundingClientRect()
   return [...range.getClientRects()].every(line => line.right <= box.right + 1 && line.bottom <= box.bottom + 1)
 }), true, 'Complete editor filename at Android 200% font size')
 adb('shell', 'input', 'keyevent', '4')
 await wait(() => !!document.querySelector('.cm-editor') && innerHeight === 751)
 adb('shell', 'input', 'keyevent', '4')
 await wait(() => !!document.querySelector('.markdown-reading'))
 report.checks.push('Android system 200% font and real Gboard leave the full filename and all six editor actions reachable')
 adb('shell','input','keyevent','4');report.actions.push({label:'Android Back to actual library source'});await wait(()=>!document.querySelector('.has-document'));await source();await observe('root-return')
 report.checks.push('Android Back exits reading to its actual library source; previous sources/drafts/provider bytes are checked at each observation')
 report.passed=true
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;try{await writeFile(out+'/acceptance-failure.png',adb('exec-out','screencap','-p'))}catch{}}
finally{
 c?.close()
 if(scaleToRestore !== undefined){
   const font = () => adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim()
   for (let attempt = 0; attempt < 3; attempt++) {
     if (scaleToRestore === 'null') adb('shell', 'settings', 'delete', 'system', 'font_scale')
     else adb('shell', 'settings', 'put', 'system', 'font_scale', scaleToRestore)
     await sleep(900)
     if (font() === scaleToRestore) break
   }
   report.fontRestored = font() === scaleToRestore
   if (!report.fontRestored) { report.passed = false; process.exitCode = 1 }
 }
 await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify({passed:report.passed,checks:report.checks,failure:report.failure},null,2))
}
