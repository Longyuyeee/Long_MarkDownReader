import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15986',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v1311-browser')
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[];let page
try{
 const probe=await browser.newPage()
 await probe.goto(base+'/scripts/fixtures/v1311-search-return-reactivity-browser.html',{waitUntil:'domcontentloaded',timeout:120000})
 await probe.waitForFunction(()=>window.probeResult)
 assert.equal((await probe.evaluate(()=>probeResult)).status,'passed','cached menus must update after a late draft binding')
 await probe.close()
 for(const reuse of [false,true])for(const mode of ['json','yaml','xml','toml']){
  console.log('Search return',mode,reuse);page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v1311-search-return-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),source=root.locator('.cm-content'),panel=root.locator('.cm-search'),find=panel.locator('input[name=search]'),modal=page.locator('.structured-search-matches-dialog')
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const exact=text=>page.waitForFunction(text=>structuredAudit.sourceText()===text,text)
  const show=async()=>{if(await source.getAttribute('contenteditable')==='false'){
   const button=root.locator('header button[aria-label^="'+(mode==='json'?'搜索源码':'查找')+'"]');if(mode==='json'&&!await button.isVisible())await root.locator('header').getByRole('button',{name:'编辑工具',exact:true}).click();await button.click()
  }else{await source.focus();await page.keyboard.press('Control+f')}await find.waitFor({state:'visible'})}
  const open=async letter=>{await page.evaluate(({mode,letter})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{mode,letter});await fresh()}
  const point=()=>page.evaluate(()=>structuredAudit.returnTest.point())
  const position=async(anchor,head)=>{await page.evaluate(({anchor,head})=>structuredAudit.returnTest.position(anchor,head),{anchor,head});await page.waitForTimeout(150)}
  const list=async()=>{await panel.locator('button[name=showMatches]').click();await modal.waitFor({state:'visible'})}
  const jump=async index=>{await list();await modal.locator('.matches-item').nth(index).click();await modal.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement===document.querySelector('.cm-content'));await page.waitForTimeout(150)}
  const back=async()=>{assert.equal(await page.evaluate(()=>structuredAudit.returnTest.available()),true);await page.evaluate(()=>structuredAudit.returnTest.run());await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('.cm-content')),true)}
  const same=(a,b,scroll=true)=>{assert.deepEqual(a.ranges,b.ranges);assert.equal(a.mainIndex,b.mainIndex);if(scroll){assert.ok(Math.abs(a.top-b.top)<2,JSON.stringify({actual:a,expected:b}));assert.ok(Math.abs(a.left-b.left)<2)}}
  await fresh();const draft=positionDraft(mode);await source.fill(draft);await exact(draft);await fresh();await show();await find.fill('我的草稿');await position(1800,1790);const origin=await point();assert.ok(origin.top>0)
  await list();await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>structuredAudit.returnTest.available()),false)
  await jump(0);assert.equal(await page.evaluate(()=>structuredAudit.sourceSelection()),'我的草稿');await back();same(await point(),origin);assert.equal(await page.evaluate(()=>structuredAudit.returnTest.available()),false)
  await jump(0);const first=await point();await jump(10);await back();same(await point(),first);await back();same(await point(),origin)
  await jump(0);await page.evaluate(()=>structuredAudit.previewTest.edit({from:0,insert:'\n'}));await fresh();await back();const mapped=await point();assert.deepEqual(mapped.ranges,origin.ranges.map(r=>({anchor:r.anchor+1,head:r.head+1})));await exact('\n'+draft)
  await page.keyboard.press('Control+z');await exact(draft);await page.keyboard.press('Control+z');await exact(positionSource(mode));await page.keyboard.press('Control+y');await exact(draft);await fresh()
  // A captured command from A must never act after a route replacement.
  await show();await find.fill('我的草稿');await position(1800,1790);await jump(0);await page.evaluate(()=>window.oldSearchReturn=structuredAudit.returnTest.capture());await open('B')
  assert.equal(await page.evaluate(()=>structuredAudit.returnTest.available()),false);assert.equal(await page.evaluate(async()=>{try{await oldSearchReturn.run();return false}catch{return true}}),true)
  await open('A');await show();await find.fill('我的草稿');assert.equal(await page.evaluate(()=>structuredAudit.returnTest.available()),false);await position(1800,1790)
  const combinations=[]
  if(!reuse)for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style)
   await position(1800,1790);const before=await point();await jump(0);await back();same(await point(),before);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);combinations.push({style,width})
  }
  if(!reuse){await page.waitForTimeout(200);await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true});await page.evaluate(()=>{structuredAudit.store.theme='dark';document.body.dataset.theme='dark'});await page.waitForTimeout(200);await page.screenshot({path:resolve(output,mode+'-dark-640.png'),fullPage:true})}
  // Read-only navigation is available, without enabling editing or replacement.
  await page.evaluate(m=>structuredAudit.files['C:/ui/B.'+m].readOnlyReason='fixture-readonly',mode);await open('B');await show();await find.fill('另一份资料');await position(1800,1790);const readonlyOrigin=await point();await jump(0);await back();same(await point(),readonlyOrigin)
  const readonly=positionSource(mode).replace('原稿','另一份资料');await page.keyboard.press('Delete');await exact(readonly);assert.equal(await panel.locator('button[name=previewReplace],button[name=replaceAll],input[name=replace]').count(),0)
  assert.equal(await page.evaluate(()=>structuredAudit.calls.filter(c=>/^write_.*_source_document$/.test(c.command)).length),0);assert.deepEqual(errors,[])
  checks.push({mode,reusedComponent:reuse,status:'passed',selectionAndScrollExact:true,consecutiveReturn:true,mappedEdit:true,noTextUndoStep:true,cancelCreatesNoPosition:true,staleOwnerRejected:true,readonlyReturn:true,noDiskWrites:true,runtimeErrors:errors,combinations});await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',cachedMenuReactive:true,nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log('Search return 8 ownership / 72 style-window combinations passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
