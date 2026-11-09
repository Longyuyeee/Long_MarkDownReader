import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {renderMobileDesignComparison} from './mobile-design-comparison.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=`docs/evidence/mobile-0.1.0/pdf-reading-browser-${Date.now()}`;await mkdir(output,{recursive:true})
const bytes=await readFile('tests/android-storage-provider/src/main/assets/pdf-reading/reading-guide.pdf'),sha=b=>createHash('sha256').update(b).digest('hex')
const priorKey=JSON.stringify(['local','保留.md']),prior={rootId:'local',relativePath:'保留.md',content:'# 原有正文\r\n',signature:'prior',modified:1},priorDraft={...prior,content:'原有未保存输入😎',expectedSignature:'prior',revision:11,updated:1}
const report={kind:'mobile-pdf-reading-tasks',nativeAndroidTest:false,checks:[],errors:[],externalRequests:[],workers:[],sourceSha256:sha(bytes)}
const browser=await chromium.launch({channel:'chrome',headless:true});let page,key
const button=name=>page.getByRole('button',{name,exact:true}),data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
const rendered=()=>page.waitForFunction(()=>document.querySelector('.pdf-viewport')&&!document.querySelector('.pdf-render-status')&&document.querySelector('canvas')?.width>0)
async function preserved(){const d=await data();assert.deepEqual(d.documents[priorKey],prior);assert.deepEqual(d.drafts[priorKey],priorDraft)}
async function binary(){assert.equal(sha(Buffer.from((await data()).attachments[key].base64,'base64')),sha(bytes))}
async function goto(n){await page.locator('.pdf-page-button').tap();await page.getByLabel(/前往第几页/).fill(String(n));await button('前往这一页').tap();await rendered()}
async function library(){await button('返回资料库').tap();await button('导入 PDF 阅读').waitFor()}
async function reopen(){const p=JSON.parse(key)[1];await page.locator('.file-row').filter({hasText:p}).tap();await rendered()}
try {
 const context=await browser.newContext({viewport:{width:390,height:870},isMobile:true,hasTouch:true})
 await context.addInitScript(({priorKey,prior,priorDraft})=>{if(!localStorage.getItem('longedit-mobile-preview-v1'))localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify({version:1,documents:{[priorKey]:prior},drafts:{[priorKey]:priorDraft}}))},{priorKey,prior,priorDraft})
 context.on('request',request=>{if(!/^https?:\/\/127\.0\.0\.1:\d+\//.test(request.url())&&!/^(blob:|data:)/.test(request.url()))report.externalRequests.push(request.url())})
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)));page.on('worker',worker=>report.workers.push(worker.url()))
 await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL||'http://127.0.0.1:9012/mobile.html')
 await page.getByLabel('选择 PDF 文件',{exact:true}).setInputFiles({name:'阅读指南.pdf',mimeType:'application/pdf',buffer:bytes})
 await button('第 1 / 3 页').waitFor();await rendered();await page.getByText('已记住阅读位置',{exact:true}).waitFor()
 key=Object.keys((await data()).attachments).find(k=>JSON.parse(k)[1].endsWith('.pdf'));assert.ok(key)
 assert.equal(await page.locator('.pdf-paper canvas').count(),1);const ink=await page.locator('.pdf-paper canvas').evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<a.length;i+=4)if(a[i]<200&&a[i+1]<200&&a[i+2]<200)n++;return n});assert.ok(ink>500)
 assert.ok(report.workers.some(url=>url.includes('pdf.worker')));assert.equal(await button('保存').count(),0);await preserved();await binary()
 report.checks.push('Real file input creates an independent exact binary PDF copy; a local PDF.js worker renders actual ink on one canvas, preserving all prior notes and drafts')

 await page.locator('.pdf-page-button').tap();await page.getByLabel(/前往第几页/).fill('4');await button('前往这一页').tap();await page.getByRole('alert').filter({hasText:'页码应在'}).waitFor();assert.equal(await button('第 1 / 3 页').count(),1);await page.getByLabel(/前往第几页/).fill('2');await button('前往这一页').tap();await rendered();await button('页面文字').tap();await page.locator('.pdf-page-text pre').filter({hasText:'SEARCH TARGET: quiet reading'}).waitFor();await button('原版页面').tap();await rendered()
 report.checks.push('Page navigation rejects out-of-range input; page 2 exposes its real extracted text separately from the unchanged original page layout')

 await button('放大 PDF').tap();await rendered();await button('放大 PDF').tap();await rendered();const dimensions=await page.locator('.pdf-paper canvas').evaluate(c=>({w:c.width,h:c.height}));assert.ok(dimensions.w*dimensions.h<=4_000_000)
 await page.locator('.pdf-viewport').evaluate(e=>{e.scrollTop=150;e.dispatchEvent(new Event('scroll'))});await page.waitForFunction(key=>JSON.parse(localStorage.getItem('longedit-mobile-pdf-reading-v1'))?.[key]?.fraction>0,key)
 const point=await page.evaluate(key=>JSON.parse(localStorage.getItem('longedit-mobile-pdf-reading-v1'))[key],key);assert.equal(point.page,2);assert.equal(point.zoom,1.5)
 await page.reload();await button('导入 PDF 阅读').waitFor();await reopen();await button('第 2 / 3 页').waitFor();assert.equal(await page.locator('.pdf-zoom>span').innerText(),'150%');assert.ok(await page.locator('.pdf-viewport').evaluate(e=>e.scrollTop)>50);await preserved();await binary()
 report.checks.push('Zoom respects the pixel budget; the exact page, zoom and in-page fraction survive a process-like reload and reopening from the real library')

 await button('在 PDF 内查找').tap();await page.getByLabel('查找 PDF 文字',{exact:true}).evaluate(input=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='quiet';input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'quiet',isComposing:true}))});assert.equal(await button('搜索').isEnabled(),true);await button('搜索').tap();await page.getByText('已检查 3 / 3 页，找到 3 处。',{exact:true}).waitFor();await page.getByLabel('查找 PDF 文字',{exact:true}).evaluate(input=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await page.getByText('已检查 3 / 3 页，找到 3 处。',{exact:true}).waitFor();assert.equal(await page.locator('.pdf-results button').count(),3);await button('关闭查找').tap();report.checks.push('An explicit search uses the text visible during uncommitted IME composition, without requiring a space or losing the query to a delayed model update')

 await button('在 PDF 内查找').tap();await page.getByLabel('查找 PDF 文字',{exact:true}).fill('安静');await button('搜索').tap();await page.getByText('已检查 3 / 3 页，找到 1 处。',{exact:true}).waitFor();await page.locator('.pdf-results button').filter({hasText:'第 3 页'}).tap();await rendered();await button('第 3 / 3 页').waitFor();await button('页面文字').tap();await page.locator('.pdf-page-text pre').filter({hasText:'中文检索：安静阅读'}).waitFor();await button('原版页面').tap();await rendered()
 await button('在 PDF 内查找').tap();await page.getByLabel('查找 PDF 文字',{exact:true}).fill('quiet');await button('搜索').tap();await page.getByText('已检查 3 / 3 页，找到 3 处。',{exact:true}).waitFor();assert.equal(await page.locator('.pdf-results button').count(),3);await button('关闭查找').tap();await binary()
 report.checks.push('Full-document search extracts all three real pages, locates Chinese and case-insensitive English, opens the exact result page and never rewrites PDF bytes')

 await goto(1);await button('下一页').tap();await button('下一页').tap();await rendered();await button('第 3 / 3 页').waitFor();await button('页面文字').tap();await page.locator('.pdf-page-text pre').filter({hasText:'End of the synthetic'}).waitFor();await button('原版页面').tap();await rendered();assert.equal(await page.locator('.pdf-paper canvas').count(),1)
 await page.locator('.pdf-page-button').tap();assert.equal(await page.evaluate(()=>window.__longeditMobileBack()),true);await page.getByLabel(/前往第几页/).waitFor({state:'detached'});await button('在 PDF 内查找').tap();assert.equal(await page.evaluate(()=>window.__longeditMobileBack()),true);await page.getByLabel('查找 PDF 文字',{exact:true}).waitFor({state:'detached'});assert.equal(await page.getByRole('region',{name:'PDF 阅读工作区'}).count(),1)
 report.checks.push('Rapid page requests cancel old renders without stale text; Android-back handling closes page/search controls first and keeps the PDF open')

 await library();await page.evaluate(({key,b64})=>{const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1'));d.attachments[key].base64=b64;localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(d))},{key,b64:Buffer.concat([bytes,Buffer.from('\n')]).toString('base64')});await reopen();await button('第 1 / 3 页').waitFor();await page.getByText('文件已变化，已从首页重新打开。',{exact:true}).waitFor();await library();await page.evaluate(({key,b64})=>{const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1'));d.attachments[key].base64=b64;localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(d))},{key,b64:bytes.toString('base64')});await preserved()
 report.checks.push('An externally changed binary fingerprint resets the old reading point visibly instead of applying it to changed content; other document and draft records remain intact')

 const count=Object.keys((await data()).attachments).length
 await page.getByLabel('选择 PDF 文件',{exact:true}).setInputFiles({name:'wrong.txt',mimeType:'application/pdf',buffer:bytes});await page.getByText('请选择 PDF 文件。',{exact:true}).waitFor();assert.equal(Object.keys((await data()).attachments).length,count)
 await page.getByLabel('选择 PDF 文件',{exact:true}).setInputFiles({name:'too-large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(20*1024*1024+1)});await page.getByText('当前支持 20 MiB 以内的 PDF。',{exact:true}).waitFor();assert.equal(Object.keys((await data()).attachments).length,count)
 await page.getByLabel('选择 PDF 文件',{exact:true}).setInputFiles({name:'damaged.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nbroken')});await page.getByRole('heading',{name:'暂时无法打开这份 PDF'}).waitFor();await library();await page.getByRole('button',{name:'关闭提示',exact:true}).click().catch(()=>{});await reopen();await rendered();await preserved();await binary()
 report.checks.push('Wrong suffix and oversized input create no copy; damaged PDF parsing has a visible retry/back route without corrupting prior sources or drafts')
 await library();const annotated=await readFile('scripts/fixtures/v126-search/Paper.pdf');await page.getByLabel('选择 PDF 文件',{exact:true}).setInputFiles({name:'link-fixture.pdf',mimeType:'application/pdf',buffer:annotated});await button('第 1 / 2 页').waitFor();await rendered();assert.equal(await page.locator('a[href^="https://example.invalid"]').count(),0);await preserved();await binary();report.checks.push('A real PDF containing a URI annotation is rendered without an interactive link layer or external requests; page rendering permits existing static annotation appearances')

 await library();const designKey=JSON.stringify(['local','阅读指南.pdf']);await page.evaluate(({key,b64})=>{const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1'));d.attachments[key]={base64:b64};localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(d))},{key:designKey,b64:bytes.toString('base64')});await page.reload();await page.locator('.file-row').filter({hasText:'阅读指南.pdf'}).tap();await rendered()
 const ribbon=await page.locator('.preview-ribbon').boundingBox();await page.setViewportSize({width:390,height:844+Math.ceil(ribbon.height)});await rendered()
 const box=await page.locator('.preview-ribbon').boundingBox(),clip={x:0,y:box.y+box.height,width:390,height:844};await page.screenshot({path:output+'/390-pdf-light.png',clip})
 const design={title:'Long编辑 · PDF 阅读设计对齐',reference:'docs/design/mobile-0.1.0/pdf-reading-v1.png',actual:'390-pdf-light.png',logicalViewport:{width:390,height:844},excluded:'Only preview ribbon; real PDF canvas and controls retained',boxes:{}}
 for(const [key,selector] of Object.entries({header:'.mobile-pdf .reader-header',summary:'.pdf-summary',viewport:'.pdf-viewport',canvas:'.pdf-paper canvas',position:'.pdf-position',footer:'.pdf-footer'})){const b=await page.locator(selector).boundingBox();design.boxes[key]={...b,y:b.y-box.height}}
 report.design=design;await writeFile(output+'/alignment.json',JSON.stringify(design,null,2)+'\n');await renderMobileDesignComparison(browser,output,design)
 await button('切换深色').tap();await page.screenshot({path:output+'/390-pdf-dark.png',clip});await page.setViewportSize({width:360,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await button('页面文字').tap();await page.locator('.pdf-page-text pre').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/360-pdf-dark-200.png'})
 report.checks.push('The real library document produces a design comparison and measured page geometry; dark UI keeps the PDF paper original, while 200% page text stays readable without body overflow')

 await page.evaluate(()=>document.documentElement.style.fontSize='');await button('原版页面').tap();await rendered();await page.setViewportSize({width:390,height:180});await rendered();await button('PDF 缩放选项').tap();await button('放大 PDF').tap();await rendered();await button('返回翻页').tap();await button('下一页').tap();await rendered();assert.ok(await page.locator('.pdf-viewport').evaluate(e=>e.clientHeight>=30));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/390-pdf-short-180.png'});await preserved();await binary()
 report.checks.push('At 180px height a single-row footer switches between zoom and paging; actual page navigation stays reachable and binary data and prior drafts remain exact')
 assert.deepEqual(report.externalRequests,[]);assert.deepEqual(report.errors,[]);report.passed=true
} catch(e){report.passed=false;report.failure=String(e?.stack||e);if(page)await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(output)}
