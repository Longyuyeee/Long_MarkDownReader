import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15945',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v135-browser')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[]
let page
try{
 for(const reuse of (process.env.LONGEDIT_SEARCH_REUSE?[process.env.LONGEDIT_SEARCH_REUSE==='1']:[false,true]))for(const mode of (process.env.LONGEDIT_SEARCH_MODES?.split(',')||['json','yaml','xml','toml'])){
  page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});const errors=[]
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});console.log('Start search',mode,'reuse',reuse)
  await page.goto(base+'/scripts/fixtures/v135-source-search-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),source=root.locator('.cm-content'),panel=root.locator('.cm-search')
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const open=async letter=>{await page.evaluate(({letter,mode})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{letter,mode});await fresh()}
  const query=()=>panel.locator('input[name=search]'),replace=()=>panel.locator('input[name=replace]')
  const settings=async()=>({search:await query().inputValue(),replace:await replace().inputValue(),caseSensitive:await panel.locator('input[name=case]').isChecked(),regexp:await panel.locator('input[name=re]').isChecked(),wholeWord:await panel.locator('input[name=word]').isChecked()})
  const set=async value=>{await query().fill(value.search);await replace().fill(value.replace);await panel.locator('input[name=case]').setChecked(value.caseSensitive);await panel.locator('input[name=re]').setChecked(value.regexp);await panel.locator('input[name=word]').setChecked(value.wholeWord)}
  const show=async()=>{await source.click();await page.keyboard.press('Control+f');await query().waitFor({state:'visible'})}
  const a={search:'我的草稿 10',replace:'替换文字',caseSensitive:true,regexp:false,wholeWord:true},b={search:'另一份资料 (\\d+)',replace:'资料 $1',caseSensitive:false,regexp:true,wholeWord:false}
  await fresh();await source.fill(positionDraft(mode));await fresh();await show();await set(a)
  // input/paste values are captured even before a blur/change or keyup.
  await open('B');assert.equal(await panel.count(),0);await show();await set(b)
  await open('A');assert.deepEqual(await settings(),a);assert.equal(await query().evaluate(e=>document.activeElement===e),false)
  assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),positionDraft(mode))
  await open('B');assert.deepEqual(await settings(),b);await open('A')
  let pendingReadInput='not-applicable'
  if(reuse){
   await page.evaluate(m=>{structuredAudit.holdRead=true;void structuredAudit.router.push('/editor?path=C:/ui/B.'+m)},mode)
   await page.waitForFunction(()=>structuredAudit.pending.some(p=>p.kind==='holdRead'))
   const exposed=await query().isVisible()
   if(exposed){await query().fill('我的草稿 11');await replace().fill('读取期间的输入')}
   await page.evaluate(()=>structuredAudit.release('holdRead'));await fresh();await open('A')
   assert.deepEqual(await settings(),exposed?{...a,search:'我的草稿 11',replace:'读取期间的输入'}:a)
   pendingReadInput=exposed?'preserved':'hidden-during-loading';await set(a)
  }
  await panel.locator('button[name=close]').click();await open('B');await open('A');assert.equal(await panel.count(),0)
  await show();assert.deepEqual(await settings(),a)
  // Explicit selected-text Ctrl+F retains the native selected-text priority.
  await source.click();await page.keyboard.press('Control+Home');if(['json','xml'].includes(mode))await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Home');await page.keyboard.press('Shift+End')
  const selected=await page.evaluate(()=>structuredAudit.sourceSelection());assert.ok(selected.includes('field000'))
  await page.keyboard.press('Control+f');assert.equal(await query().inputValue(),selected)
  await set(a)
  // A return during pending analysis must leave an outline input focused.
  await open('B');await page.evaluate(m=>{structuredAudit.holdAnalysis=true;void structuredAudit.router.push('/editor?path=C:/ui/A.'+m)},mode)
  await page.waitForFunction(()=>structuredAudit.pending.some(p=>p.kind==='holdAnalysis'))
  const filter=root.locator(mode==='json'?'input[aria-label="筛选字段路径"]':mode==='yaml'?'input[aria-label="筛选 YAML 结构提纲"]':'aside input').first()
  if(!await filter.isVisible())await root.locator('header button').filter({hasText:mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题'}).click()
  await filter.fill('field050');await page.evaluate(()=>structuredAudit.release('holdAnalysis'));await fresh()
  assert.equal(await filter.evaluate(e=>document.activeElement===e),true);assert.deepEqual(await settings(),a)
  // Invalid regex and a genuine no-match are inline, retain input and source.
  const before=await page.evaluate(()=>structuredAudit.sourceText())
  await set({...a,search:'[',regexp:true});await panel.locator('.structured-search-feedback').filter({hasText:'正则表达式无效'}).waitFor()
  assert.equal(await query().getAttribute('aria-invalid'),'true');await open('B');await open('A')
  assert.equal(await query().inputValue(),'[');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),before)
  await set({...a,search:'does-not-exist-135'});await panel.locator('.structured-search-feedback').filter({hasText:'没有匹配内容'}).waitFor()
  // Replacements are ordinary current-file draft edits, with native undo/redo.
  await set({...a,search:'我的草稿',replace:'新的草稿',wholeWord:false});await panel.locator('button[name=replaceAll]').click();await fresh()
  const changed=before.replaceAll('我的草稿','新的草稿');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),changed)
  assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),positionSource(mode))
  await source.click();await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),before)
  await page.keyboard.press('Control+y');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),changed)
  await page.keyboard.press('Control+s');await page.waitForFunction(({mode,changed})=>structuredAudit.files['C:/ui/A.'+mode].content===changed,{mode,changed})
  assert.equal(await page.evaluate(m=>structuredAudit.store.tabs.find(t=>t.path==='C:/ui/A.'+m).isDirty,mode),false)
  // Search input survives changed contents; matches come from the new body.
  await page.evaluate(m=>{const f=structuredAudit.files['C:/ui/B.'+m];f.content=f.content.replaceAll('另一份资料','外部更新');f.signature+='changed'},mode)
  await open('B');assert.deepEqual(await settings(),b);await panel.locator('.structured-search-feedback').filter({hasText:'没有匹配内容'}).waitFor()
  assert.ok((await page.evaluate(()=>structuredAudit.sourceText())).includes('外部更新'))
  await open('A');await page.evaluate(m=>{structuredAudit.files['C:/ui/B.'+m].readOnlyReason='fixture-readonly'},mode);await open('B')
  assert.equal(await replace().count(),0);assert.equal(await panel.locator('button[name=replaceAll]').count(),0)
  assert.equal(await source.getAttribute('contenteditable'),'false');assert.equal(await query().inputValue(),b.search)
  await open('A');const current={...a,search:'新的草稿',replace:'另外的草稿',wholeWord:false};await set(current)
  const combinations=[]
  if(!reuse&&process.env.LONGEDIT_SEARCH_STYLES!=='0')for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style)
   await open('B');await open('A');assert.deepEqual(await settings(),current)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);combinations.push({style,width})
  }
  if(!reuse)await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true})
  if(!reuse&&process.env.LONGEDIT_SEARCH_STYLES!=='0'){
   await page.evaluate(()=>{structuredAudit.store.theme='dark';document.body.dataset.theme='dark'})
   await page.waitForTimeout(350)
   assert.deepEqual(await settings(),current);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   await page.screenshot({path:resolve(output,mode+'-dark-640.png'),fullPage:true})
  }
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>structuredAudit.calls.filter(c=>/^write_.*_source_document$/.test(c.command)).length),1)
  checks.push({mode,reusedComponent:reuse,status:'passed',perFileInputsAndOptions:true,closedPanelRetained:true,selectedTextPriority:true,pendingFocusPreserved:true,pendingReadInput,invalidRegexAndNoMatch:true,replaceUndoRedoAndExplicitSave:true,changedBodyRecomputed:true,readOnlyProtected:true,combinations,runtimeErrors:errors})
  await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n')
 console.log(checks.length+' search ownership cases / '+checks.reduce((n,c)=>n+c.combinations.length,0)+' style/window combinations passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
