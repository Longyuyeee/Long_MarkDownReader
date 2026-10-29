import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15975',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v137-browser')
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[];let page
try{
 for(const reuse of [false,true])for(const mode of ['json','yaml','xml','toml']){
  page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)})
  console.log('Replacement preview',mode,reuse);await page.goto(base+'/scripts/fixtures/v137-replacement-preview-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),source=root.locator('.cm-content'),panel=root.locator('.cm-search'),find=panel.locator('input[name=search]'),replacement=panel.locator('input[name=replace]'),previewButton=panel.locator('button[name=previewReplace]'),modal=page.locator('.structured-replacement-dialog')
  const apply=()=>modal.getByRole('button',{name:'应用到草稿',exact:true}),refresh=()=>modal.getByRole('button',{name:'刷新预览',exact:true})
  const body=()=>page.evaluate(()=>structuredAudit.sourceText()),exact=text=>page.waitForFunction(text=>structuredAudit.sourceText()===text,text)
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const open=async letter=>{await page.evaluate(({mode,letter})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{mode,letter});await fresh()}
  const show=async()=>{
   if(await source.getAttribute('contenteditable')==='false'){
    const button=root.locator(`header button[aria-label^="${mode==='json'?'搜索源码':'查找'}"],header button[title^="${mode==='json'?'搜索源码':'查找'}"]`)
    if(!await button.isVisible()&&mode==='json')await root.locator('header button').filter({hasText:'编辑工具'}).click()
    await button.click()
   }else{await source.click();await page.keyboard.press('Control+f')}
   await find.waitFor({state:'visible'})
  }
  const preview=async()=>{await previewButton.click();await modal.waitFor({state:'visible'});await apply().waitFor({state:'visible'})}
  const cancel=async()=>{await modal.getByRole('button',{name:'取消',exact:true}).click();await modal.waitFor({state:'hidden'})}
  await fresh();await source.fill(positionDraft(mode));await exact(positionDraft(mode));await fresh();await show();await find.fill('我的草稿');await replacement.fill('预览修改')
  await panel.locator('button[name=next]').click();await panel.locator('.structured-search-feedback').filter({hasText:/\d+\/100项/}).waitFor()
  await replacement.dispatchEvent('compositionstart');await replacement.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,isComposing:true,bubbles:true});await replacement.dispatchEvent('compositionend');assert.equal(await body(),positionDraft(mode))
  await preview();assert.match(await modal.locator('.replacement-summary').innerText(),/100/);assert.equal(await modal.locator('.replacement-item').count(),20)
  assert.equal(await modal.locator('.replacement-before mark').first().innerText(),'我的草稿');assert.equal(await modal.locator('.replacement-after mark').first().innerText(),'预览修改')
  await modal.getByRole('button',{name:'下一页',exact:true}).click();assert.match(await modal.locator('.replacement-location').first().innerText(),/^21 ·/)
  await cancel();assert.equal(await body(),positionDraft(mode));assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),positionSource(mode))
  // Content changes cannot apply an old proposal, even if an invocation bypasses the disabled button.
  await preview();await page.evaluate(()=>structuredAudit.previewTest.edit({from:0,insert:'\n'}));await modal.locator('[role=alert]').waitFor();assert.equal(await apply().isDisabled(),true)
  assert.equal(await page.evaluate(()=>structuredAudit.previewTest.tryApply()),false);assert.equal(await body(),'\n'+positionDraft(mode))
  await refresh().click();assert.equal(await modal.locator('[role=alert]').count(),0);await apply().click();const refreshed='\n'+positionDraft(mode).replaceAll('我的草稿','预览修改');await exact(refreshed);await modal.waitFor({state:'hidden'})
  await source.click();await page.keyboard.press('Control+z');await exact('\n'+positionDraft(mode));await page.keyboard.press('Control+y');await exact(refreshed)
  await page.evaluate(text=>structuredAudit.previewTest.edit({from:0,to:structuredAudit.sourceText().length,insert:text}),positionDraft(mode));await fresh()
  // Changing query or explicit scope invalidates a preview; refreshing uses current conditions.
  await preview();await page.evaluate(()=>structuredAudit.previewTest.query({replace:'查询更新'}));await modal.locator('[role=alert]').waitFor();assert.equal(await page.evaluate(()=>structuredAudit.previewTest.tryApply()),false)
  await refresh().click();assert.equal(await modal.locator('.replacement-after mark').first().innerText(),'查询更新');await cancel()
  await preview();await page.evaluate(()=>structuredAudit.previewTest.scope());await modal.locator('[role=alert]').waitFor();assert.equal(await page.evaluate(()=>structuredAudit.previewTest.tryApply()),false)
  await refresh().click();assert.match(await modal.locator('.replacement-summary').innerText(),/修改 3 处/);assert.match(await modal.locator('.replacement-summary').innerText(),/选区内/);await cancel()
  await find.fill('我的草稿 (\\d+)');await replacement.fill('确认 $1');await panel.locator('input[name=re]').check();await preview()
  assert.equal(await modal.locator('.replacement-after mark').first().innerText(),'确认 3');await apply().click()
  const expected=positionDraft(mode).replace(/我的草稿 ([345])(?!\d)/g,'确认 $1');await exact(expected);await modal.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),positionSource(mode))
  await source.click();await page.keyboard.press('Control+z');await exact(positionDraft(mode));await page.keyboard.press('Control+y');await exact(expected)
  await page.keyboard.press('Control+s');await page.waitForFunction(({mode,expected})=>structuredAudit.files['C:/ui/A.'+mode].content===expected,{mode,expected});await fresh()
  await find.fill('确认');await replacement.fill('不会应用');await preview();await open('B');await modal.waitFor({state:'hidden'});assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),expected)
  await open('A');await page.evaluate(m=>structuredAudit.files['C:/ui/B.'+m].readOnlyReason='fixture-readonly',mode);await open('B');await show();assert.equal(await previewButton.count(),0)
  await open('A');await find.fill('确认');await replacement.fill('确认');await previewButton.click();assert.equal(await modal.isVisible(),false);await panel.locator('.structured-search-feedback').filter({hasText:'替换前后内容相同'}).waitFor()
  await replacement.fill('继续修改');const combinations=[]
  if(!reuse)for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style);await preview();await page.waitForTimeout(350)
   const box=await modal.boundingBox();assert.ok(box.x>=0&&box.width<=width&&box.y>=0&&box.y+box.height<=(width===640?720:900)+1);assert.equal(await apply().isDisabled(),false)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);combinations.push({style,width});await cancel()
  }
  if(!reuse){await preview();await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true});await page.evaluate(()=>{structuredAudit.store.theme='dark';document.body.dataset.theme='dark'});await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-dark-640.png'),fullPage:true});await cancel()}
  assert.equal(await body(),expected);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>structuredAudit.calls.filter(c=>/^write_.*_source_document$/.test(c.command)).length),1)
  checks.push({mode,reusedComponent:reuse,status:'passed',pagedBeforeAfter:true,cancelPreservesDraftAndDisk:true,staleBodyQueryScopeRejected:true,refreshCurrentProposal:true,scopedCapturesAndOneUndo:true,explicitSaveOnly:true,ownerSwitchClosesPreview:true,readonlyHidden:true,unchangedInlineFeedback:true,combinations,runtimeErrors:errors});await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log('Preview8 ownership /72 style/window combinations passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
