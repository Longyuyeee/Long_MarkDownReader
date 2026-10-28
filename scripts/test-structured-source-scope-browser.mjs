import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15965',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v136-browser')
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[];let page
try{
 for(const reuse of [false,true])for(const mode of ['json','yaml','xml','toml']){
  page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle),pending=[];window.scopeDigests={hold:false,release(){this.hold=false;for(const resume of pending.splice(0))resume()}};crypto.subtle.digest=(...args)=>window.scopeDigests.hold?new Promise(resolve=>pending.push(()=>resolve(digest(...args)))):digest(...args)})
  console.log('Scope',mode,reuse);await page.goto(base+'/scripts/fixtures/v136-source-scope-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),source=root.locator('.cm-content'),panel=root.locator('.cm-search'),find=panel.locator('input[name=search]'),scope=panel.locator('input[name=scope]'),feedback=panel.locator('.structured-search-feedback')
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const open=async letter=>{await page.evaluate(({letter,mode})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{letter,mode});await fresh()}
  const body=()=>page.evaluate(()=>structuredAudit.sourceText())
  const exact=text=>page.waitForFunction(text=>structuredAudit.sourceText()===text,text)
  const select=async()=>{await source.click();await page.keyboard.press('Control+Home');for(let i=0;i<3+(['json','xml'].includes(mode)?1:0);i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowDown')}
  const show=async()=>{await page.keyboard.press('Control+f');await find.waitFor({state:'visible'});await find.fill('我的草稿');await panel.locator('input[name=replace]').fill('选区修改的新值')}
  await fresh();await source.fill(positionDraft(mode));await fresh();await select();await show();assert.equal(await scope.isChecked(),false)
  await scope.check();await feedback.filter({hasText:'选区内 · 3项'}).waitFor()
  await find.fill('field[\\s\\S]*保留');await panel.locator('input[name=re]').check();await feedback.filter({hasText:'1项'}).waitFor()
  await panel.locator('button[name=next]').click();assert.ok((await page.evaluate(()=>structuredAudit.sourceSelection())).includes('field003'))
  await panel.locator('input[name=re]').uncheck();await find.fill('我的草稿');await feedback.filter({hasText:'3项'}).waitFor()
  await panel.locator('button[name=next]').click();await feedback.filter({hasText:'1/3项'}).waitFor();await panel.locator('button[name=prev]').click();await feedback.filter({hasText:'3/3项'}).waitFor()
  await panel.locator('button[name=select]').click();assert.equal((await page.evaluate(()=>structuredAudit.sourceSelection())).includes('我的草稿'),true)
  const expected=positionDraft(mode).replace(/我的草稿 ([345])(?!\d)/g,'选区修改的新值 $1')
  await panel.locator('button[name=replaceAll]').click();await exact(expected);await fresh();assert.equal(await body(),expected)
  assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),positionSource(mode))
  await source.click();await page.keyboard.press('Control+z');await exact(positionDraft(mode));assert.equal(await body(),positionDraft(mode));await feedback.filter({hasText:'3项'}).waitFor()
  await page.keyboard.press('Control+y');await exact(expected);assert.equal(await body(),expected);await find.fill('选区修改的新值');await feedback.filter({hasText:'3项'}).waitFor()
  await open('B');assert.equal(await panel.count(),0);await source.click();await page.keyboard.press('Control+f');await find.fill('另一份资料');assert.equal(await scope.isChecked(),false)
  await page.evaluate(()=>scopeDigests.hold=true);await open('A');await feedback.filter({hasText:'正在确认选区'}).waitFor()
  await open('B');await open('A');await page.evaluate(()=>scopeDigests.release())
  assert.equal(await find.inputValue(),'选区修改的新值');await feedback.filter({hasText:/^选区内 · (?:[123]\/)?3项$/}).waitFor();assert.equal(await find.evaluate(e=>document.activeElement===e),false)
  await panel.locator('button[name=close]').click();await open('B');await open('A');assert.equal(await panel.count(),0);await source.click();await page.keyboard.press('Control+f');await feedback.filter({hasText:/^选区内 · (?:[123]\/)?3项$/}).waitFor()
  await page.keyboard.press('Escape');await source.click();await page.keyboard.press('Control+s');await page.waitForFunction(({mode,expected})=>structuredAudit.files['C:/ui/A.'+mode].content===expected,{mode,expected})
  // Scope is deliberately not applied to a body changed outside this editor.
  await select();await page.keyboard.press('Control+f');await scope.uncheck();await scope.check();await find.fill('选区修改的新值');await feedback.filter({hasText:'选区内 · 3项'}).waitFor()
  await open('B');await page.evaluate(m=>{const f=structuredAudit.files['C:/ui/A.'+m];f.content='\n'+f.content;f.signature+='outside'},mode);await open('A')
  await feedback.filter({hasText:'选区已变化，请重新选区'}).waitFor();assert.equal(await scope.isChecked(),true);assert.equal(await panel.locator('button[name=replaceAll]').isDisabled(),true)
  assert.equal(await find.inputValue(),'选区修改的新值');const changed=await body();await scope.uncheck();await feedback.filter({hasText:'3项'}).waitFor();assert.equal(await body(),changed)
  // Empty scope remains explicit and disabled instead of falling back to all.
  await source.click();await page.keyboard.press('Control+Home');await scope.check();await feedback.filter({hasText:'请先在正文选择范围'}).waitFor();assert.equal(await panel.locator('button[name=replaceAll]').isDisabled(),true)
  await select();await panel.locator('button[name=scopeUpdate]').click();await feedback.filter({hasText:'选区内'}).waitFor()
  const beforeRewrite=await body(),rewritten=beforeRewrite.replaceAll('保留','重写')
  await source.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(rewritten)
  await page.waitForFunction(text=>structuredAudit.sourceText()===text,rewritten);await fresh();await feedback.filter({hasText:'选区已变化，请重新选区'}).waitFor()
  assert.equal(await panel.locator('button[name=replaceAll]').isDisabled(),true);await source.click();await page.keyboard.press('Control+z');await exact(beforeRewrite);assert.equal(await body(),beforeRewrite);await feedback.filter({hasText:'选区内'}).waitFor();await scope.uncheck()
  const combinations=[]
  if(!reuse)for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style)
   await open('B');await open('A');assert.equal(await find.inputValue(),'选区修改的新值');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);combinations.push({style,width})
  }
  if(!reuse){await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true});await page.evaluate(()=>{structuredAudit.store.theme='dark';document.body.dataset.theme='dark'});await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-dark-640.png'),fullPage:true})}
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>structuredAudit.calls.filter(c=>/^write_.*_source_document$/.test(c.command)).length),1)
  checks.push({mode,reusedComponent:reuse,status:'passed',explicitScope:true,nativeCommandsRespectScope:true,undoRedoExact:true,draftBeforeExplicitSave:true,closedPanelAndFileOwnership:true,changedBodyFailsClosed:true,emptyAndNewScope:true,combinations,runtimeErrors:errors});await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log('Scope8 ownership /72 style/window combinations passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
