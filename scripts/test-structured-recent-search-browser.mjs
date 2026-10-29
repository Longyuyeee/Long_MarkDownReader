import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15995',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v139-browser')
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[];let page
try{
 for(const reuse of [false,true])for(const mode of ['json','yaml','xml','toml']){
  console.log('Recent search',mode,reuse);page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v139-recent-search-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),source=root.locator('.cm-content'),panel=root.locator('.cm-search'),find=panel.locator('input[name=search]'),replacement=panel.locator('input[name=replace]'),recent=panel.locator('select[name=recentSearch]'),modal=page.locator('.structured-replacement-dialog')
  const exact=text=>page.waitForFunction(text=>structuredAudit.sourceText()===text,text)
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const open=async letter=>{await page.evaluate(({mode,letter})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{mode,letter});await fresh()}
  const show=async()=>{await source.click();await page.keyboard.press('Control+f');await find.waitFor({state:'visible'})}
  const count=()=>recent.locator('option').count()
  await fresh();await source.fill(positionDraft(mode));await exact(positionDraft(mode));await fresh();await show()
  await recent.focus();assert.match(await recent.innerText(),/暂无使用记录/)
  await find.fill('未使用');await replacement.fill('仅输入');await panel.locator('button[name=close]').click();await show();await recent.focus();assert.match(await recent.innerText(),/暂无使用记录/)
  await find.fill('我的草稿 (\\d+)');await replacement.fill('确认 $1');await panel.locator('input[name=re]').check();await panel.locator('button[name=next]').click()
  await recent.focus();assert.equal(await count(),3);assert.match(await recent.innerText(),/确认 \$1/)
  await panel.locator('button[name=next]').click();await recent.focus();assert.equal(await count(),3)
  await open('B');await show();await recent.focus();assert.match(await recent.innerText(),/确认 \$1/)
  const selection=await page.evaluate(()=>structuredAudit.sourceSelection());await recent.selectOption('0');await recent.press('Home');await recent.press('ArrowDown');await recent.press('Enter');assert.equal(await find.inputValue(),'我的草稿 (\\d+)');assert.equal(await replacement.inputValue(),'确认 $1');assert.equal(await panel.locator('input[name=re]').isChecked(),true)
  assert.equal(await page.evaluate(()=>structuredAudit.sourceSelection()),selection);assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),positionSource(mode).replace('原稿','另一份资料'));assert.equal(await page.evaluate(()=>document.activeElement?.name),'recentSearch')
  await open('A');await show();await recent.focus();await recent.selectOption('0');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),positionDraft(mode))
  // Reusing a condition preserves the active selection scope and disables stale previews.
  await page.evaluate(()=>structuredAudit.previewTest.scope());await panel.locator('button[name=previewReplace]').click();await modal.waitFor({state:'visible'});assert.match(await modal.locator('.replacement-summary').innerText(),/3 处/)
  await modal.getByRole('button',{name:'取消',exact:true}).click();await modal.waitFor({state:'hidden'})
  await find.fill('我的草稿');await panel.locator('input[name=re]').uncheck();await panel.locator('button[name=next]').click()
  await panel.locator('button[name=previewReplace]').click();await modal.waitFor({state:'visible'})
  await recent.dispatchEvent('focus');await recent.selectOption('1',{force:true});await modal.locator('[role=alert]').waitFor();assert.equal(await page.evaluate(()=>structuredAudit.previewTest.tryApply()),false)
  await modal.getByRole('button',{name:'刷新预览',exact:true}).click();assert.match(await modal.locator('.replacement-summary').innerText(),/选区内/);await modal.getByRole('button',{name:'取消',exact:true}).click();await modal.waitFor({state:'hidden'})
  // Invalid expressions and IME confirmation do not enter the used list or replace text.
  await recent.focus();const before=await count();await find.fill('[');await panel.locator('input[name=re]').check();await find.press('Enter');await recent.focus();assert.equal(await count(),before)
  await find.fill('我的草稿');await panel.locator('input[name=re]').uncheck();await find.dispatchEvent('compositionstart');await find.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true});await find.dispatchEvent('compositionend');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),positionDraft(mode))
  const combinations=[]
  if(!reuse)for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style);await recent.focus();await page.waitForTimeout(50)
   const box=await recent.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);combinations.push({style,width})
  }
  if(!reuse){await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true});await page.evaluate(()=>{structuredAudit.store.theme='dark';document.body.dataset.theme='dark'});await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-dark-640.png'),fullPage:true})}
  await recent.selectOption('clear');assert.match(await recent.innerText(),/暂无使用记录/);assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),positionDraft(mode));assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),positionSource(mode))
  assert.equal(await page.evaluate(()=>structuredAudit.calls.filter(c=>/^write_.*_source_document$/.test(c.command)).length),0);assert.deepEqual(errors,[])
  checks.push({mode,reusedComponent:reuse,status:'passed',onlyUsedConditionsRecorded:true,crossFileReuse:true,queryOptionsExact:true,noNavigationOrFocusTheft:true,scopePreserved:true,stalePreviewRejected:true,clearKeepsDraftAndInput:true,noDiskWrites:true,runtimeErrors:errors,combinations});await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log('Recent search8 ownership /72 style/window combinations passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
