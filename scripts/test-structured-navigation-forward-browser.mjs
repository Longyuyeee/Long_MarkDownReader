import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15988',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v1313-browser')
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[];let page
try{
 const probe=await browser.newPage();await probe.goto(base+'/scripts/fixtures/v1313-navigation-forward-reactivity-browser.html',{waitUntil:'domcontentloaded',timeout:120000});await probe.waitForFunction(()=>window.probeResult);assert.equal((await probe.evaluate(()=>probeResult)).status,'passed');await probe.close()
 for(const reuse of [false,true])for(const mode of ['json','yaml','xml','toml']){
  console.log('Navigation forward',mode,reuse);page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v1313-navigation-forward-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),source=root.locator('.cm-content')
  const filter=root.locator(mode==='json'?'input[aria-label="筛选字段路径"]':mode==='yaml'?'input[aria-label="筛选 YAML 结构提纲"]':'aside input').first()
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const exact=text=>page.waitForFunction(text=>structuredAudit.sourceText()===text,text)
  const open=async letter=>{await page.evaluate(({mode,letter})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{mode,letter});await fresh()}
  const inspector=async()=>{await page.waitForTimeout(140);if(!await filter.isVisible())await root.locator('header button').filter({hasText:mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题'}).click();await filter.waitFor()}
  const point=()=>page.evaluate(()=>structuredAudit.returnTest.point())
  const position=async()=>{await source.focus();await page.evaluate(()=>structuredAudit.returnTest.position(1800,1790));await page.waitForTimeout(120);return point()}
  const back=async()=>{assert.equal(await page.evaluate(()=>structuredAudit.returnTest.available()),true);await page.evaluate(()=>structuredAudit.returnTest.run());await page.waitForTimeout(160)}
  const forward=async()=>{assert.equal(await page.evaluate(()=>structuredAudit.forwardTest.available()),true);await page.evaluate(()=>structuredAudit.forwardTest.run());await page.waitForTimeout(180)}
  const same=(a,b)=>{assert.deepEqual(a.ranges,b.ranges);assert.equal(a.mainIndex,b.mainIndex);assert.ok(Math.abs(a.top-b.top)<3,JSON.stringify({actual:a,expected:b}));assert.ok(Math.abs(a.left-b.left)<3)}
  const locate=async key=>{await root.locator('[data-outline-node*="'+key+'"]').click();await page.waitForFunction(()=>document.activeElement===document.querySelector('.cm-content'));await page.waitForTimeout(120)}
  await fresh();const draft=positionDraft(mode);await source.fill(draft);await fresh();await inspector();await filter.fill('field00');await page.waitForTimeout(180)
  const origin=await position();await locate('field002');assert.match(await page.evaluate(()=>structuredAudit.sourceSelection()),/我的草稿 2/);assert.equal(await page.evaluate(()=>structuredAudit.returnTest.capture().title),'返回上次浏览位置')
  const destination=await point();await back();same(await point(),origin);await forward();same(await point(),destination);assert.equal(await page.evaluate(()=>structuredAudit.forwardTest.available()),false);await back();same(await point(),origin);assert.equal(await filter.inputValue(),'field00');assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('.cm-content')),true)
  await locate('field002');const first=await point();await locate('field005');await back();same(await point(),first);await back();same(await point(),origin);await forward();same(await point(),first);await forward();assert.match(await page.evaluate(()=>structuredAudit.sourceSelection()),/我的草稿 5/);await back();await back();same(await point(),origin)
  await locate('field002');await page.evaluate(()=>structuredAudit.previewTest.edit({from:0,insert:'\n'}));await fresh();await back();assert.deepEqual((await point()).ranges,origin.ranges.map(r=>({anchor:r.anchor+1,head:r.head+1})));await exact('\n'+draft)
  await source.focus();await page.keyboard.press('Control+z');await exact(draft);await page.keyboard.press('Control+z');await exact(positionSource(mode));await page.keyboard.press('Control+y');await exact(draft);await fresh()
  await locate('field002');const mappedTarget=await point();await back();await page.evaluate(()=>structuredAudit.previewTest.edit({from:0,insert:'\n'}));await fresh();await forward();assert.deepEqual((await point()).ranges,mappedTarget.ranges.map(r=>({anchor:r.anchor+1,head:r.head+1})));await source.focus();await page.keyboard.press('Control+z');await exact(draft);await fresh();
  await locate('field002');await back();await source.focus();await page.keyboard.press('Control+f');const panel=root.locator('.cm-search'),find=panel.locator('input[name=search]');await find.fill('我的草稿');await panel.locator('button[name=showMatches]').click();const modal=page.locator('.structured-search-matches-dialog');await modal.waitFor({state:'visible'});await modal.locator('.matches-item').nth(4).click();await modal.waitFor({state:'hidden'});await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>structuredAudit.forwardTest.available()),false);const searchTarget=await point();await back();await forward();same(await point(),searchTarget);await exact(draft)
  await source.focus();await page.keyboard.press('Escape');await page.waitForTimeout(150)
  let treeReturn=false,collapsePreserved=false,invalidTreeFallback=false
  if(mode==='json'){
   await filter.fill('');await page.waitForTimeout(160);const sourceOrigin=await position()
   await root.locator('header button').filter({hasText:'树形'}).click();const tree=root.locator('.tree-rows')
   await root.locator('button[aria-label="折叠全部节点"]').click();const collapsed=tree.locator('.tree-row').first();assert.equal(await collapsed.getAttribute('aria-expanded'),'false')
   await collapsed.locator('.tree-node-main').dblclick();await source.waitFor({state:'visible'});await page.waitForTimeout(180);const collapsedTarget=await point();await back();await forward();same(await point(),collapsedTarget);await back();await tree.waitFor({state:'visible'});assert.equal(await tree.locator('.tree-row').first().getAttribute('aria-expanded'),'false');collapsePreserved=true
   await root.locator('button[aria-label="展开全部节点"]').click();await tree.hover();await page.mouse.wheel(0,1500);await page.waitForTimeout(160)
   const target=tree.locator('.tree-node-main').filter({hasText:/field/}).nth(8);await target.click();await page.waitForTimeout(100);const label=await target.locator('strong').innerText(),top=await tree.evaluate(e=>e.scrollTop)
   await target.dblclick();await source.waitFor({state:'visible'});await page.waitForTimeout(180);const treeTarget=await point();await back();await forward();same(await point(),treeTarget);await back();await tree.waitFor({state:'visible'});assert.equal(await tree.locator('.tree-row.selected strong').innerText(),label);assert.ok(Math.abs(await tree.evaluate(e=>e.scrollTop)-top)<3);assert.equal(await tree.evaluate(e=>document.activeElement===e),true)
   await root.locator('header button').filter({hasText:'源码'}).click();await page.waitForTimeout(180);same(await point(),sourceOrigin);treeReturn=true
   await root.locator('header button').filter({hasText:'树形'}).click();await tree.locator('.tree-node-main').filter({hasText:/field/}).nth(8).dblclick();await source.waitFor({state:'visible'})
   await source.focus();await page.keyboard.press('Control+End');await page.keyboard.type('!');await fresh();await back();assert.equal(await tree.isVisible(),false);assert.equal(await source.isVisible(),true);assert.ok((await page.evaluate(()=>structuredAudit.sourceText())).endsWith('!'));invalidTreeFallback=true
   await page.keyboard.press('Control+z');await exact(draft);await fresh()
  }
  await inspector();await filter.fill('field00');await page.waitForTimeout(160);await position();await locate('field002');await back();await page.evaluate(()=>window.oldForward=structuredAudit.forwardTest.capture());await open('B')
  assert.equal(await page.evaluate(()=>structuredAudit.forwardTest.available()),false);assert.equal(await page.evaluate(()=>structuredAudit.returnTest.available()),false);assert.equal(await page.evaluate(async()=>{try{await oldForward.run();return false}catch{return true}}),true);await open('A');await inspector();assert.equal(await filter.inputValue(),'field00')
  const combinations=[]
  if(!reuse)for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style);await inspector()
   const before=await position();await locate('field002');const target=await point();await back();same(await point(),before);await forward();same(await point(),target);await back();same(await point(),before);assert.equal(await filter.inputValue(),'field00');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);combinations.push({style,width})
  }
  if(!reuse){await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true});await page.evaluate(()=>{structuredAudit.store.theme='dark';document.body.dataset.theme='dark'});await page.waitForTimeout(200);await page.screenshot({path:resolve(output,mode+'-dark-640.png'),fullPage:true})}
  await page.evaluate(m=>structuredAudit.files['C:/ui/B.'+m].readOnlyReason='fixture-readonly',mode);await open('B');await inspector();await filter.fill('field00');await page.waitForTimeout(160);const readonlyOrigin=await position();await locate('field002');const readOnlyTarget=await point();await back();same(await point(),readonlyOrigin);await forward();same(await point(),readOnlyTarget);await back();same(await point(),readonlyOrigin)
  await page.keyboard.press('Delete');await exact(positionSource(mode).replace('原稿','另一份资料'));assert.equal(await page.evaluate(()=>structuredAudit.calls.filter(c=>/^write_.*_source_document$/.test(c.command)).length),0);assert.deepEqual(errors,[])
  checks.push({mode,reusedComponent:reuse,status:'passed',forwardExact:true,searchForwardExact:true,branchReset:true,selectionAndScrollExact:true,consecutiveReturn:true,mappedEdit:true,noUndoStep:true,filterPreserved:true,treeReturn,collapsePreserved,invalidTreeFallback,ownerReset:true,readonlyReturn:true,noDiskWrites:true,runtimeErrors:errors,combinations});await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',cachedForwardMenuReactive:true,nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log('Navigation forward 8 ownership / 72 style-window combinations passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
