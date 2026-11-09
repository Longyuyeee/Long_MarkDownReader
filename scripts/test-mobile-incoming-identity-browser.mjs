import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {openMobileIncoming} from './mobile-document-navigation.mjs'
import {readTextImportPreview} from './mobile-text-import-navigation.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const out=process.env.LONGEDIT_INCOMING_IDENTITY_OUTPUT||`docs/evidence/mobile-0.1.0/incoming-identity-${Date.now()}`
await mkdir(out);await writeFile(out+'/.gitignore','*\n')
const freeze=JSON.parse(await readFile('docs/design/mobile-incoming-identity-v1/freeze.json','utf8'))
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']
const receipts=Object.fromEntries(Object.values(freeze.receipts).map((r,i)=>{const content=i===0?'较新的正文😀\n原链接 https://example.invalid/new?keep=1':'较早的正文'+i;return[ids[i],{...r,id:ids[i],content,bytes:Buffer.byteLength(content),digest:createHash('sha256').update(content).digest('hex')}]}))
const stateKey='longedit-mobile-preview-v1',documentKey=JSON.stringify(['local','正在写.md']),source='源文件保留\n',draft='正文第一行😀\n返回后在这里继续写'
const report={kind:'identify-same-name-arrivals-by-received-time',nativeAndroidTest:false,transport:'isolated browser PreviewStorage, not Android IPC or SAF',checks:[],geometry:[],scans:[],errors:[],externalRequests:[],passed:false}
const browser=await chromium.launch({channel:'chrome',headless:true});let page
const data=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),stateKey)
const back=()=>page.evaluate(()=>window.__longeditMobileBack())
const geometry=p=>p.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return{header:box(document.querySelector('.sheet-heading')),rows:[...document.querySelectorAll('.incoming-row')].map(box),metadata:[...document.querySelectorAll('.incoming-row small')].map(box)}})
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Hong_Kong'})
 await context.addInitScript(({stateKey,documentKey,source,receipts})=>{if(window!==window.top)return;if(!localStorage.getItem(stateKey))localStorage.setItem(stateKey,JSON.stringify({version:1,documents:{[documentKey]:{rootId:'local',relativePath:'正在写.md',content:source,signature:'source-signature',modified:1}},drafts:{},fileImports:receipts}))},{stateKey,documentKey,source,receipts})
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url())&&!['127.0.0.1','localhost'].includes(new URL(r.url()).hostname))report.externalRequests.push(r.url())})
 await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL||'http://127.0.0.1:9012/mobile.html');await page.locator('.file-row').filter({hasText:'正在写.md'}).tap();await page.getByRole('button',{name:'编辑',exact:true}).tap()
 const editor=page.getByRole('textbox',{name:'笔记正文',exact:true});await editor.fill(draft);await editor.press('Control+End');await editor.press('ArrowLeft');await page.evaluate(()=>window.__identityEditor=document.querySelector('.cm-editor'))
 await openMobileIncoming(page);await page.getByRole('dialog',{name:'收到的内容',exact:true}).waitFor()
 const rows=page.locator('.incoming-row'),times=Object.values(freeze.receipts).map(r=>new Date(r.created).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong'}))
 assert.equal(await rows.count(),3);for(let i=0;i<3;i++)assert.ok((await rows.nth(i).innerText()).includes(times[i]));assert.notEqual(await rows.nth(0).innerText(),await rows.nth(1).innerText());assert.equal((await data()).drafts[documentKey].content,draft);assert.deepEqual((await data()).fileImports,receipts)
 const reference=await browser.newPage({viewport:{width:390,height:844}});await reference.goto('http://127.0.0.1:9026/design/mobile-incoming-identity-v1/index.html')
 for(const variant of [{name:'light',width:390,height:844,dark:false,font:'16px'},{name:'dark-320-200',width:320,height:700,dark:true,font:'32px'}]){
  for(const p of [page,reference]){await p.setViewportSize({width:variant.width,height:variant.height});await p.evaluate(v=>{document.querySelector('.mobile-app').classList.toggle('theme-dark',v.dark);document.documentElement.style.fontSize=v.font},variant)}
  const actual=await geometry(page),expected=await geometry(reference);assert.deepEqual(actual,expected,variant.name+' design geometry');report.geometry.push({variant:variant.name,actual,expected,matched:true})
  await page.screenshot({path:out+'/'+variant.name+'-actual.png'});await reference.screenshot({path:out+'/'+variant.name+'-reference.png'})
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'),'utf8'));const scan=await page.evaluate(async()=>{const r=await axe.run(document,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return{violations:r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))}});assert.deepEqual(scan.violations,[]);report.scans.push({variant:variant.name,...scan});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  for(let i=0;i<3;i++){await rows.nth(i).scrollIntoViewIfNeeded();const box=await rows.nth(i).boundingBox();assert.ok(box.height>=48);assert.ok((await rows.nth(i).innerText()).includes(times[i]));const overflow=await rows.nth(i).locator('span').evaluate(e=>e.scrollWidth>e.clientWidth);assert.equal(overflow,false)}
 }
 await reference.close();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.querySelector('.mobile-app').classList.remove('theme-dark');document.documentElement.style.fontSize='16px'})
 // Select by the visible time and name, then independently check the receipt ID/content.
 const newest=page.getByRole('button',{name:new RegExp('分享文字.txt.*'+times[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))});await newest.tap();await page.getByRole('dialog',{name:'核对文字',exact:true}).waitFor();assert.equal(await readTextImportPreview(page),receipts[ids[0]].content)
 assert.equal((await data()).fileImports[ids[0]].incoming,false);assert.deepEqual((await data()).fileImports[ids[1]],receipts[ids[1]]);await back();await page.getByRole('dialog',{name:'收到的内容',exact:true}).waitFor();assert.equal(await page.locator(`[data-incoming-key="text:${ids[0]}"]`).evaluate(e=>e===document.activeElement),true)
 await back();await editor.waitFor();assert.equal(await page.evaluate(()=>document.querySelector('.cm-editor')===window.__identityEditor),true);assert.equal((await data()).documents[documentKey].content,source);assert.equal((await data()).drafts[documentKey].content,draft)
 await editor.press('X');assert.equal((await page.locator('.cm-line').allTextContents()).join('\n'),draft.slice(0,-1)+'X'+draft.slice(-1));await editor.press('Control+z');assert.equal((await page.locator('.cm-line').allTextContents()).join('\n'),draft)
 report.checks.push('Same-name same-state arrivals expose distinct received times without acknowledging them','Frozen light/dark/320-width/200%-text geometry matches and all rows remain readable/tappable','Selecting by visible newest time reads and acknowledges only that receipt; Back restores its row','Leaving review retains the same editor, source and protected draft; caret input and Undo resume at the prior position')
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.passed=true
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{})}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({out,passed:report.passed,checks:report.checks.length,failure:report.failure}))}
