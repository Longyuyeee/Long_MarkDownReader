import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const raw='docs/evidence/mobile-0.1.0/structured-pdf-v3-2026-11-06',out=raw+'/'+stage;await assert.rejects(access(out));await mkdir(out,{recursive:true})
const bytes=await readFile('tests/android-storage-provider/src/main/assets/pdf-navigation/navigation-guide.pdf'),sha=b=>createHash('sha256').update(b).digest('hex'),stateKey='longedit-mobile-preview-v1',oldKey=JSON.stringify(['local','独立原稿.md']),old={rootId:'local',relativePath:'独立原稿.md',content:'# 原稿\r\n',signature:'old',modified:1},oldDraft={...old,content:'# 未完成草稿😎',expectedSignature:'old',revision:3,updated:1},report={passed:false,scope:'Actual production PDF.js, touch browser/CDP input and synthetic isolated storage. No product CSS injection; no native IME or TalkBack claim.',checks:[],scans:[],errors:[],externalRequests:[]};let browser,context,page,key
const button=n=>page.getByRole('button',{name:n,exact:true}),back=async()=>{await page.evaluate(()=>window.__longeditMobileBack());await page.waitForTimeout(100)},rendered=()=>page.waitForFunction(()=>!document.querySelector('.pdf-render-status')&&document.querySelector('.textLayer span')),data=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),stateKey)
async function start(width=390,height=844,font=16,dark=false){if(context)await context.close();if(browser)await browser.close();browser=await chromium.launch({channel:'chrome',headless:true,args:[`--blink-settings=defaultFontSize=${font},defaultFixedFontSize=${font}`]});context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await context.addInitScript(({stateKey,oldKey,old,oldDraft,dark})=>{if(window!==top)return;localStorage.setItem(stateKey,JSON.stringify({version:1,documents:{[oldKey]:old},drafts:{[oldKey]:oldDraft}}));localStorage.setItem('longedit-mobile-preferences-v1',JSON.stringify({version:1,theme:dark?'dark':'light'}))},{stateKey,oldKey,old,oldDraft,dark});page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).hostname!=='127.0.0.1')report.externalRequests.push(r.url())});await page.goto('http://127.0.0.1:9012/mobile.html');await page.getByLabel('选择 PDF 文件',{exact:true}).setInputFiles({name:'阅读指南.pdf',mimeType:'application/pdf',buffer:bytes});await rendered();key=Object.keys((await data()).attachments).find(k=>JSON.parse(k)[1].endsWith('.pdf'))}
async function preserved(){const d=await data();assert.deepEqual(d.documents[oldKey],old);assert.deepEqual(d.drafts[oldKey],oldDraft);assert.equal(sha(Buffer.from(d.attachments[key].base64,'base64')),sha(bytes))}
async function landed(n){await rendered();await page.waitForFunction(({key,n})=>JSON.parse(localStorage.getItem('longedit-mobile-pdf-reading-v1')||'{}')[key]?.page===n,{key,n});assert.equal(await page.locator('.pdf-page-button').innerText(),n+' / 9')}
async function goto(n){await page.locator('.pdf-page-button').tap();await page.locator('#pdf-page-number').fill(String(n));await button('前往这一页').tap();await landed(n)}
async function menu(){await button('PDF 操作').tap();await page.getByRole('dialog',{name:'PDF 操作',exact:true}).waitFor()}
async function checkTitle(singleLine=false){
 const title=await page.locator('.reader-header h1').evaluate(h=>{
  const style=getComputedStyle(h),stem=h.querySelector('.pdf-file-stem'),suffix=h.querySelector('.pdf-file-suffix'),bounds=h.getBoundingClientRect(),suffixBounds=suffix.getBoundingClientRect()
  return {font:style.fontSize,stemFont:getComputedStyle(stem).fontSize,suffixFont:getComputedStyle(suffix).fontSize,height:bounds.height,lineHeight:parseFloat(style.lineHeight),suffixFits:suffixBounds.bottom<=bounds.bottom+1&&suffixBounds.right<=bounds.right+1}
 })
 assert.equal(title.stemFont,title.font)
 assert.equal(title.suffixFont,title.font)
 assert.ok(title.suffixFits&&title.height<=title.lineHeight*(singleLine?1:2)+1,JSON.stringify(title))
}
async function swipe(dx,dy=0,milliseconds=240){const r=await page.locator('.pdf-viewport').boundingBox(),x=r.x+(dx<0?r.width*.8:r.width*.2),y=r.y+Math.min(r.height*.45,200),cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let n=1;n<=6;n++){await page.waitForTimeout(milliseconds/6);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/6,y:y+dy*n/6,id:1}]})}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach()}
async function scan(name,selector='.mobile-pdf'){await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'),'utf8'));const r=await page.evaluate(async()=>axe.run(document,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));report.scans.push({name,violations:r.violations.map(({id,nodes})=>({id,targets:nodes.map(n=>n.target)}))});assert.deepEqual(report.scans.at(-1).violations,[],name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const small=await page.locator(selector+' button:visible').evaluateAll(es=>es.filter(e=>!e.closest('[inert]')).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),r:e.getBoundingClientRect()})).filter(e=>e.r.width<47.9||e.r.height<47.9));assert.deepEqual(small,[],name)}
try{
 await start();await goto(3);assert.equal(await page.locator('.pdf-summary:visible,.pdf-position:visible').count(),0);await scan('reader');await swipe(-180);await landed(4);await swipe(180);await landed(3);await swipe(0,-90);await landed(3);await swipe(-180,0,650);await landed(3);report.checks.push('Reading has a single header, three reachable bottom actions and on-demand controls. Real touch swipes turn adjacent fit-width pages; vertical movement and long-press timing do not turn pages. Original PDF bytes and independent draft remain unchanged.');
 await menu();await scan('menu','.pdf-action-menu');await back();assert.equal(await button('PDF 操作').evaluate(e=>e===document.activeElement),true);await menu();await button('阅读设置').tap();await page.getByRole('button',{name:/^缩放比例/}).tap();await button('放大 PDF').tap();await back();await page.getByRole('region',{name:'PDF 阅读设置'}).waitFor();await back();await page.getByRole('dialog',{name:'PDF 操作',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.dataset.pdfAction),'settings');await button('阅读设置').tap();await page.getByRole('button',{name:/^缩放比例/}).tap();assert.match(await page.locator('.pdf-setting-zoom-value').innerText(),/125%/);await button('应用缩放').tap();await rendered();await swipe(-150);await landed(3);await menu();await button('阅读设置').tap();await page.getByRole('button',{name:/^缩放比例/}).tap();await button('适合宽度').tap();await button('应用缩放').tap();await rendered();await menu();await button('查看文档权限').tap();await back();await page.getByRole('dialog',{name:'PDF 操作',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.dataset.pdfAction),'permissions');await button('查看文档权限').tap();await button('继续阅读').tap();await landed(3);await preserved();report.checks.push('Menu Back restores its opener. Reading settings retain unapplied zoom across option/menu Back, while explicit zoom applies and exits to reading. At zoom, horizontal movement pans instead of turning. Permissions Back restores its real menu entry and explicit Continue returns to reading.');
 await button('目录与页面').tap();await page.locator('.pdf-outline-page').first().waitFor();await scan('outline','.pdf-navigation');const pages=await page.locator('.pdf-outline-page').allTextContents();assert.ok(pages.every(v=>Number(v)>=1&&Number(v)<=9));assert.equal(await page.locator('.pdf-outline [aria-current=location]').count(),1);await button('页面').tap();await page.waitForFunction(()=>document.querySelectorAll('.pdf-page-preview canvas').length===6&&[...document.querySelectorAll('.pdf-page-preview canvas')].every(c=>c.width>1));await scan('pages','.pdf-navigation');await button('后 6 页').tap();await button('打开第 9 页').waitFor();await button('目录').tap();await button('页面').tap();await button('打开第 9 页').waitFor();await button('打开第 9 页').tap();await landed(9);await button('目录与页面').tap();await button('书签').tap();await page.getByText('还没有书签',{exact:true}).waitFor();await scan('bookmarks','.pdf-navigation');await back();await landed(9);await goto(3);await button('在 PDF 内查找').tap();await page.locator('input[type=search]').fill('阅读');await button('查找').tap();await page.locator('[data-search-page="3"]').waitFor();await scan('search-results','.pdf-search-task');await page.locator('[data-search-page="3"]').tap();await landed(3);await back();await page.locator('[data-search-page="3"]').waitFor();await back();await landed(3);await page.locator('.pdf-page-button').tap();await page.locator('#pdf-page-number').fill('99');await button('前往这一页').tap();await page.locator('#pdf-page-dialog-error').waitFor();await scan('invalid-page','.pdf-page-dialog');await back();await landed(3);await preserved();report.checks.push('Outline numbers come from real PDF destinations and one current chapter is indicated. Real two-column page thumbnails retain batch and tab state; choosing a page lands correctly. Bookmarks, search Back and invalid page dialogs retain the reading page and source.');
 for(const[width,height,font,dark]of [[320,640,32,true],[390,502,16,false]]){await start(width,height,font,dark);await goto(3);await scan('reader-'+width+'-'+font);await menu();await scan('menu-'+width+'-'+font,'.pdf-action-menu');await back();await button('目录与页面').tap();await scan('outline-'+width+'-'+font,'.pdf-navigation');await button('页面').tap();await page.waitForFunction(()=>document.querySelectorAll('.pdf-page-preview canvas').length===6&&[...document.querySelectorAll('.pdf-page-preview canvas')].every(c=>c.width>1));await scan('pages-'+width+'-'+font,'.pdf-navigation');await page.screenshot({path:out+'/pages-'+width+'-'+font+'.png'});await preserved()}
 report.checks.push('Dark/320-width/200% browser text and a short 502px window retain checked 48px controls, scroll areas, original page previews and no checked axe violations. Native font and IME are separate.')
 await start()
 await goto(3)
 await checkTitle(true)
 const opener=button('目录与页面')
 await opener.tap()
 await button('页面').tap()
 await button('后 6 页').tap()
 await button('打开第 9 页').waitFor()
 await back()
 assert.equal(await opener.evaluate(e=>e===document.activeElement),true)
 await opener.tap()
 await button('打开第 9 页').waitFor()
 await button('回到当前页').tap()
 const current=page.locator('.pdf-page-preview[aria-current=page]')
 await current.waitFor()
 assert.equal(await current.getAttribute('data-nav-key'),'page-3')
 assert.equal(await current.evaluate(e=>e===document.activeElement),true)
 await button('后 6 页').tap()
 await back()
 await goto(9)
 await goto(3)
 await opener.tap()
 await current.waitFor()
 assert.equal(await current.getAttribute('data-nav-key'),'page-3')
 assert.equal(await button('打开第 9 页').count(),0)
 await preserved()
 await start(320,640,32,true)
 await goto(3)
 await checkTitle()
 report.checks.push('Closing navigation with the same reading page preserves the browsed batch. Jumping in reading resets an unrelated batch, and Return to current page scrolls and focuses the actual thumbnail.')
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.passed=true
}catch(error){report.failure=String(error.stack||error);try{await page?.screenshot({path:out+'/failure.png'})}catch{}process.exitCode=1}finally{await browser?.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2))}console.log(JSON.stringify({passed:report.passed,checks:report.checks,scans:report.scans.length,failure:report.failure}))
