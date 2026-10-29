import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15995',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v1310-browser')
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[];let page
try{
 for(const reuse of [false,true])for(const mode of ['json','yaml','xml','toml']){
  console.log('Search matches',mode,reuse);page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v1310-search-matches-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),source=root.locator('.cm-content'),panel=root.locator('.cm-search'),find=panel.locator('input[name=search]'),modal=page.locator('.structured-search-matches-dialog'),items=modal.locator('.matches-item')
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const exact=text=>page.waitForFunction(text=>structuredAudit.sourceText()===text,text)
  const show=async()=>{await source.click();await page.keyboard.press('Control+f');await find.waitFor({state:'visible'})}
  const open=async letter=>{await page.evaluate(({mode,letter})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{mode,letter});await fresh()}
  const matches=async()=>{await panel.locator('button[name=showMatches]').click();await modal.waitFor({state:'visible'})}
  const close=async()=>{await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});await page.waitForTimeout(250)}
  await fresh();const draft=positionDraft(mode);await source.fill(draft);await exact(draft);await fresh();await show();await find.fill('我的草稿');await matches()
  assert.match(await modal.locator('.matches-summary').innerText(),/100 处/);assert.equal(await items.count(),20);assert.equal(await items.first().locator('mark').innerText(),'我的草稿')
  await modal.getByRole('button',{name:'下一页',exact:true}).click();assert.match(await items.first().innerText(),/^21 ·/);await items.first().focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await modal.waitFor({state:'hidden'})
  await page.waitForFunction(()=>document.activeElement===document.querySelector('.cm-content'));assert.equal(await page.evaluate(()=>structuredAudit.sourceSelection()),'我的草稿');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),draft)
  // Navigation must not add an undo step: the preceding draft edit undoes immediately.
  await page.keyboard.press('Control+z');await exact(positionSource(mode));await page.keyboard.press('Control+y');await exact(draft);await fresh()
  await show();await page.evaluate(()=>structuredAudit.previewTest.scope());await find.fill('我的草稿 (\\d+)');await panel.locator('input[name=re]').check();await matches();assert.match(await modal.locator('.matches-summary').innerText(),/3 处.*选区内/);assert.equal(await items.first().locator('mark').innerText(),'我的草稿 3');await close()
  await page.waitForFunction(()=>document.activeElement?.name==='showMatches');await matches()
  await page.evaluate(()=>structuredAudit.previewTest.query({search:'我的草稿'}));await modal.locator('[role=alert]').waitFor();assert.equal(await items.first().isDisabled(),true)
  await modal.getByRole('button',{name:'刷新结果',exact:true}).click();assert.equal(await items.first().isDisabled(),false);assert.match(await modal.locator('.matches-summary').innerText(),/3 处/)
  await page.evaluate(()=>structuredAudit.previewTest.edit({from:0,insert:' '}));await modal.locator('[role=alert]').waitFor();assert.equal(await items.first().isDisabled(),true);await close();await source.click();await page.keyboard.press('Control+z');await exact(draft);await fresh()
  await show();await find.fill('不存在的匹配');await matches();assert.match(await modal.innerText(),/没有匹配内容/);await close()
  await find.fill('[');await page.waitForTimeout(180);assert.equal(await panel.locator('button[name=showMatches]').isDisabled(),true)
  await find.fill('(?=我的草稿)');await matches();assert.equal(await items.first().locator('mark').innerText(),'（匹配位置）');await close()
  // A modal from A cannot keep old positions or move focus after switching to B.
  await matches();await open('B');await modal.waitFor({state:'hidden'});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),positionSource(mode).replace('原稿','另一份资料'))
  await open('A');await show();await find.fill('我的草稿');await panel.locator('input[name=re]').uncheck();if(await panel.locator('input[name=scope]').isChecked())await panel.locator('input[name=scope]').uncheck()
  const combinations=[]
  if(!reuse)for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style);await matches();await page.waitForTimeout(100)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);const box=await modal.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0);combinations.push({style,width});await close()
  }
  if(!reuse){await matches();await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true});await page.evaluate(()=>{structuredAudit.store.theme='dark';document.body.dataset.theme='dark'});await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-dark-640.png'),fullPage:true});await close()}
  assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),draft);assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),positionSource(mode))
  assert.equal(await page.evaluate(()=>structuredAudit.calls.filter(c=>/^write_.*_source_document$/.test(c.command)).length),0);assert.deepEqual(errors,[])
  checks.push({mode,reusedComponent:reuse,status:'passed',navigationExact:true,pagingAndKeyboard:true,cancelFocus:true,scopePreserved:true,staleQueryAndDraftRejected:true,ownerReset:true,noDiskWrites:true,noUndoStep:true,runtimeErrors:errors,combinations});await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log('Search matches 8 ownership / 72 style-window combinations passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
