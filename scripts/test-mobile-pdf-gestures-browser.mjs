import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {renderMobileDesignComparison} from './mobile-design-comparison.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=`docs/evidence/mobile-0.1.0/pdf-gestures-browser-${Date.now()}`;await mkdir(output,{recursive:true})
const bytes=await readFile('tests/android-storage-provider/src/main/assets/pdf-reading/reading-guide.pdf'),sha=b=>createHash('sha256').update(b).digest('hex')
const priorKey=JSON.stringify(['local','保留.md']),prior={rootId:'local',relativePath:'保留.md',content:'# 原有正文\r\n',signature:'prior',modified:1},draft={...prior,content:'保持输入😎',expectedSignature:'prior',revision:11,updated:1}
const report={kind:'mobile-pdf-gestures',nativeAndroidTest:false,touchScope:'Synthetic DOM multi-touch exercises gesture state and geometry. Physical Android input is verified separately, without CDP.',checks:[],errors:[],externalRequests:[],sourceSha256:sha(bytes)}
const browser=await chromium.launch({channel:'chrome',headless:true});let page,key
const button=name=>page.getByRole('button',{name,exact:true}),rendered=()=>page.waitForFunction(()=>document.querySelector('.pdf-page-surface canvas')?.width>0&&!document.querySelector('.pdf-render-status')&&!document.querySelector('.pdf-pinching'))
const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem('longedit-mobile-pdf-reading-v1'))?.[key],key)
async function preserved(){const d=await page.evaluate(()=>JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')));assert.deepEqual(d.documents[priorKey],prior);assert.deepEqual(d.drafts[priorKey],draft);assert.equal(sha(Buffer.from(d.attachments[key].base64,'base64')),sha(bytes))}
const position=()=>page.locator('.pdf-viewport').evaluate(h=>{const p=h.querySelector('.pdf-page-surface').getBoundingClientRect(),v=h.getBoundingClientRect();return{paper:{x:p.x,y:p.y,w:p.width,h:p.height},viewport:{x:v.x,y:v.y,w:v.width,h:v.height},left:h.scrollLeft,top:h.scrollTop,width:h.scrollWidth,height:h.scrollHeight}})
async function touches(type,points){return page.locator('.pdf-viewport').evaluate((host,{type,points})=>{const target=host.querySelector('canvas')||host,t=points.map(([identifier,clientX,clientY])=>new Touch({identifier,target,clientX,clientY})),e=new TouchEvent(type,{bubbles:true,cancelable:true,touches:t,targetTouches:t,changedTouches:t});target.dispatchEvent(e);return{prevented:e.defaultPrevented,transform:host.querySelector('.pdf-page-surface')?.style.transform}}, {type,points})}
async function pinch(ratio,{end='touchend',moveX=0,moveY=0}={}){
 const before=await position(),cx=before.viewport.x+before.viewport.w/2,cy=before.viewport.y+before.viewport.h*.55,span=100
 const first=await touches('touchstart',[[1,cx-span/2,cy]]);assert.equal(first.prevented,false)
 await touches('touchstart',[[1,cx-span/2,cy],[2,cx+span/2,cy]])
 await touches('touchmove',[[1,cx+moveX-span*ratio/2,cy+moveY],[2,cx+moveX+span*ratio/2,cy+moveY]])
 await page.locator('.pdf-pinching').waitFor();const preview=await page.locator('.pdf-page-surface').evaluate(e=>({transform:e.style.transform,width:e.querySelector('canvas').width}));assert.ok(preview.transform.includes('scale('))
 if(end==='third')await touches('touchstart',[[1,cx-70,cy],[2,cx+70,cy],[3,cx,cy+60]])
 else if(end==='pause')await page.evaluate(()=>dispatchEvent(new Event('longedit-mobile-pause')))
 else await touches(end,[])
 await rendered();return{before,after:await position(),preview,focus:{x:cx+moveX,y:cy+moveY},original:{x:cx,y:cy}}
}
try{
 const context=await browser.newContext({viewport:{width:390,height:872},isMobile:true,hasTouch:true})
 await context.addInitScript(({priorKey,prior,draft})=>{if(!localStorage.getItem('longedit-mobile-preview-v1'))localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify({version:1,documents:{[priorKey]:prior},drafts:{[priorKey]:draft}}))},{priorKey,prior,draft})
 context.on('request',r=>{if(!/^https?:\/\/127\.0\.0\.1:\d+\//.test(r.url())&&!/^(blob:|data:)/.test(r.url()))report.externalRequests.push(r.url())})
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)))
 await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL||'http://127.0.0.1:9012/mobile.html');await page.getByLabel('选择 PDF 文件',{exact:true}).setInputFiles({name:'阅读指南.pdf',mimeType:'application/pdf',buffer:bytes});await rendered();await page.locator('.pdf-gesture-hint').filter({hasText:'双指缩放'}).waitFor()
 key=Object.keys((await page.evaluate(()=>JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))).attachments).find(k=>JSON.parse(k)[1].endsWith('.pdf'));assert.ok(key)
 await button('放大 PDF').tap();await rendered();await button('放大 PDF').tap();await rendered()
 await page.locator('.pdf-viewport').evaluate(h=>{h.scrollTop=150;h.scrollLeft=40});const r=await pinch(4/3,{moveX:12,moveY:-10})
 for(const axis of ['x','y']){const size=axis==='x'?'w':'h',before=(r.original[axis]-r.before.paper[axis])/r.before.paper[size],after=(r.focus[axis]-r.after.paper[axis])/r.after.paper[size];assert.ok(Math.abs(after-before)<.004,`${axis} focus drift ${after-before}`)}
 assert.equal((await saved()).zoom,2);assert.equal(await page.locator('.pdf-zoom>span').innerText(),'200%');assert.equal(await page.locator('.pdf-page-surface').evaluate(e=>e.style.transform),'');report.focus=r
 report.checks.push('Actual PDF renders; synthetic two-touch preview follows the moving midpoint and the final 200% canvas preserves the same original text location on both axes')
 const layer=await page.locator('.textLayer').boundingBox(),canvas=await page.locator('.pdf-paper canvas').boundingBox();for(const k of ['x','y','width','height'])assert.ok(Math.abs(layer[k]-canvas[k])<1)
 assert.ok(await page.locator('.pdf-paper canvas').evaluate(c=>c.width*c.height<=4_000_000));report.checks.push('Final canvas stays within the existing pixel budget and the selectable text layer exactly follows its new size and origin')
 const point=await saved();assert.ok(point.fraction>0&&point.horizontal>0);await button('返回资料库').tap();await page.reload();await page.locator('.file-row').filter({hasText:JSON.parse(key)[1]}).tap();await rendered();const restored=await position();report.restored=restored;assert.ok(Math.abs(restored.left-r.after.left)<2&&Math.abs(restored.top-r.after.top)<2);assert.equal((await saved()).zoom,2)
 report.checks.push('Closing, reloading and reopening restores page, zoom, vertical and horizontal reading position without changing source bytes or drafts')
 const old=await saved();for(const end of ['touchcancel','third','pause']){await pinch(1.2,{end});const now=await saved();assert.equal(now.zoom,old.zoom);assert.equal(await page.locator('.pdf-page-surface').evaluate(e=>e.style.transform),'')}
 report.checks.push('System touch cancellation, an extra third finger and native pause discard transient preview and keep the last completed reading point')
 await pinch(9);assert.equal((await saved()).zoom,3);await pinch(.01);assert.equal((await saved()).zoom,1);assert.equal(await button('缩小 PDF').isDisabled(),true);assert.equal((await position()).left,0)
 report.checks.push('Extreme outward and inward gestures stop at 300% and fit width; horizontal position returns inside the page and no blank overscroll is stored')
 await button('放大 PDF').tap();await rendered();await button('放大 PDF').tap();await rendered();await page.locator('.pdf-viewport').evaluate(h=>{h.scrollTop=130;h.scrollLeft=35});const b=await position();await button('放大 PDF').tap();await rendered();const a=await position();for(const axis of ['x','y']){const size=axis==='x'?'w':'h',mid=b.viewport[axis]+b.viewport[size]/2;assert.ok(Math.abs((mid-b.paper[axis])/b.paper[size]-(mid-a.paper[axis])/a.paper[size])<.004)}await button('适合宽度').tap();await rendered();assert.equal((await saved()).zoom,1)
 report.checks.push('Accessible plus/minus controls preserve the viewport center rather than resetting to page top; fit width stays available independently of gestures')
 await button('页面文字').tap();await page.locator('.pdf-page-text pre').waitFor();await touches('touchstart',[[1,100,300],[2,220,300]]);await touches('touchmove',[[1,60,300],[2,280,300]]);await touches('touchend',[]);assert.equal(await page.locator('.pdf-pinching').count(),0);assert.equal(await page.locator('.pdf-gesture-hint').count(),0);await button('原版页面').tap();await rendered()
 report.checks.push('Extracted page text retains native selection and scrolling, with document pinch handling disabled')
 const vb=(await position()).viewport,cx=vb.x+vb.w/2,cy=vb.y+vb.h/2;await touches('touchstart',[[1,cx-50,cy],[2,cx+50,cy]]);await touches('touchmove',[[1,cx-80,cy],[2,cx+80,cy]]);await button('下一页').tap();await rendered();await button('第 2 / 3 页').waitFor();assert.equal((await saved()).zoom,1);assert.equal((await saved()).fraction,0);await button('上一页').tap();await rendered()
 report.checks.push('Paging during a preview cancels it and opens the selected physical page at its top without leaking the old page anchor')
 await button('放大 PDF').tap();await rendered();await button('放大 PDF').tap();await rendered();const appTop=Math.ceil((await page.locator('.preview-ribbon').boundingBox()).height);await page.setViewportSize({width:390,height:844+appTop});await rendered();await page.locator('.pdf-viewport').evaluate(h=>{h.scrollLeft=0;h.scrollTop=0});await page.locator('.document-heading h1').focus();await page.waitForTimeout(400);await page.screenshot({path:output+'/390-pdf-gestures-light.png',clip:{x:0,y:appTop,width:390,height:844}})
 const design={title:'Long编辑 · PDF 双指缩放设计对齐',reference:'docs/design/mobile-0.1.0/pdf-gestures-v1.png',actual:'390-pdf-gestures-light.png',logicalViewport:{width:390,height:844},boxes:{},footer:'原图保持。实际为同一三页阅读指南的真实 PDF.js 150% 页面；原文排版、批注计数和 44px 可触按钮按实际可读性保留。核对页头、摘要、阅读区、状态和手势提示/双行底栏；不把图稿粘到 PDF。'}
 for(const[k,selector]of Object.entries({header:'.mobile-pdf .reader-header',summary:'.pdf-summary',viewport:'.pdf-viewport',paper:'.pdf-page-surface',position:'.pdf-position',footer:'.pdf-footer',hint:'.pdf-gesture-hint',zoom:'.pdf-zoom',pages:'.pdf-pages'})){const b=await page.locator(selector).boundingBox();design.boxes[k]={...b,y:b.y-appTop}}
 assert.equal(design.boxes.paper.width,537);assert.ok(design.boxes.hint.height>=20);assert.ok(design.boxes.viewport.height>450);await writeFile(output+'/alignment.json',JSON.stringify(design,null,2)+'\n');await renderMobileDesignComparison(browser,output,design);report.design=design
 report.checks.push('Same-sized 390×844 actual 150% paper, hint and controls are measured against the unmodified preimplementation image')
 await button('切换深色').tap();await page.locator('.document-heading h1').focus();await page.waitForTimeout(400);await page.screenshot({path:output+'/390-pdf-gestures-dark.png',clip:{x:0,y:appTop,width:390,height:844}});await page.setViewportSize({width:320,height:720});await rendered();await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await button('页面文字').tap();await page.locator('.pdf-page-text pre').waitFor();await page.screenshot({path:output+'/320-dark-200.png'});await page.evaluate(()=>document.documentElement.style.fontSize='');await button('原版页面').tap();await rendered()
 report.checks.push('Dark chrome keeps white original PDF paper, and 320px/200% text remains contained with the page-text alternative')
 await page.setViewportSize({width:390,height:180});await rendered();await button('PDF 缩放选项').tap();await button('放大 PDF').tap();await rendered();await button('返回翻页').tap();await button('下一页').tap();await rendered();assert.ok((await position()).viewport.h>=30);await page.screenshot({path:output+'/390-short-180.png'});await preserved();assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[])
 report.checks.push('At 180px height the existing one-row zoom/page switch remains usable, while source PDF, prior document and draft remain exact and all requests remain local')
 report.passed=true
}catch(e){report.passed=false;report.failure=String(e.stack||e);process.exitCode=1;if(page)await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{})}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(output)}
