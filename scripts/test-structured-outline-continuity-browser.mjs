import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {outlineContinuityDraft,outlineContinuitySources} from './lib/structured-outline-continuity-fixture.mjs'
import {outlineNavigationPrefix} from './lib/structured-outline-navigation-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15944',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v133-browser')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[]
let page
try{
 for(const reuse of [false,true])for(const mode of ['json','yaml','xml','toml']){
  page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v133-outline-continuity-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),rows=root.locator('[data-outline-node]'),source=root.locator('.cm-content[contenteditable=true]')
  const filter=root.locator(mode==='json'?'input[aria-label="筛选字段路径"]':mode==='yaml'?'input[aria-label="筛选 YAML 结构提纲"]':'aside input').first()
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const open=async letter=>{await page.evaluate(({letter,mode})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{letter,mode});await fresh();await page.waitForFunction(({letter,mode})=>structuredAudit.store.activeTabId==='C:/ui/'+letter+'.'+mode,{letter,mode})}
  await fresh();await root.locator('[data-outline-node*="second"]').click();await source.fill(outlineContinuityDraft(mode));await fresh()
  let draft=outlineContinuityDraft(mode)
  await filter.fill('second');await page.waitForTimeout(180)
  await open('B');assert.equal(await filter.inputValue(),'');assert.equal(await root.locator('[aria-current=true][data-outline-node]').count(),0)
  await filter.fill('third');await root.locator('[data-outline-node*="third"]').click()
  await open('A');assert.equal(await filter.inputValue(),'second');assert.ok((await root.locator('[aria-current=true][data-outline-node]').getAttribute('data-outline-node')).includes('second'))
  assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),draft);assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),outlineContinuitySources[mode])
  assert.equal(await page.evaluate(()=>!!document.activeElement?.matches('[data-outline-node]')),false)
  await filter.fill('v133-filter-only-unique');await page.waitForTimeout(180);assert.equal(await rows.count(),0)
  await open('B');assert.equal(await filter.inputValue(),'third');await open('A');assert.equal(await filter.inputValue(),'v133-filter-only-unique');assert.equal(await rows.count(),0)
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('v133-filter-only-unique')),false)
  await filter.fill('');await page.waitForTimeout(180)
  if(mode==='json'){
   await root.locator('header button').filter({hasText:'树形'}).click()
   const group=()=>root.locator('.tree-row').filter({has:page.locator('.tree-node-main strong').filter({hasText:/^group$/})})
   await group().locator('.tree-toggle').click();assert.equal(await group().getAttribute('aria-expanded'),'false')
   await open('B');assert.equal(await root.locator('.tree-rows').isVisible(),false)
   await open('A');await group().waitFor();assert.equal(await group().getAttribute('aria-expanded'),'false')
   await root.locator('header button').filter({hasText:'源码'}).click()
  }
  if(mode==='toml'){
   await root.locator('button[aria-label="展开数组 items"]').click();await root.locator('[data-outline-node*="items[1]"]').waitFor()
   await open('B');assert.equal(await root.locator('[data-outline-node*="items[1]"]').count(),0)
   await open('A');await root.locator('[data-outline-node*="items[1]"]').waitFor();await fresh()
  }
  // Let an old file's real asynchronous analysis finish after switching away.
  await page.evaluate(()=>{structuredAudit.holdAnalysis=true});draft=outlineNavigationPrefix(mode)+draft
  await source.fill(draft);await page.waitForFunction(()=>structuredAudit.pending.some(p=>p.kind==='holdAnalysis'))
  await open('B');await page.evaluate(()=>structuredAudit.release('holdAnalysis'));await fresh();assert.equal(await filter.inputValue(),'third')
  await open('A');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),draft)
  if(mode==='json'){
   await root.locator('header button').filter({hasText:'树形'}).click()
   const group=root.locator('.tree-row').filter({has:page.locator('.tree-node-main strong').filter({hasText:/^group$/})});assert.equal(await group.getAttribute('aria-expanded'),'false')
   await root.locator('header button').filter({hasText:'源码'}).click()
  }
  if(mode==='toml'){
   await root.locator('[data-outline-node*="items[1]"]').waitFor()
   draft=draft.replace(/^items.*\n/m,'');await source.fill(draft);await fresh();assert.equal(await root.locator('[data-outline-node*="items"]').count(),0)
   await open('B');await open('A');assert.equal(await root.locator('[data-outline-node*="items"]').count(),0)
  }
  // Close the clean B tab; the dirty A draft must remain untouched.
  await page.evaluate(m=>structuredAudit.store.removeTab('C:/ui/B.'+m),mode);await open('B');assert.equal(await filter.inputValue(),'');assert.equal(await root.locator('[aria-current=true][data-outline-node]').count(),0)
  assert.equal(await page.evaluate(m=>structuredAudit.store.tabs.find(t=>t.path==='C:/ui/A.'+m)?.content,mode),draft)
  const combinations=[]
  if(!reuse)for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style)
   await page.evaluate(()=>new Promise(requestAnimationFrame).then(()=>new Promise(requestAnimationFrame)))
   if(!await filter.isVisible())await root.locator('header button').filter({hasText:mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题'}).click()
   await filter.fill('third');await root.locator('[data-outline-node*="third"]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement?.matches('.cm-content')&&structuredAudit.sourceSelection().includes('最后'))
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);combinations.push({style,width})
  }
  if(!reuse)await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true})
  assert.deepEqual(errors,[]);checks.push({mode,reusedComponent:reuse,status:'passed',perFileFilter:true,semanticSelection:true,draftsPreserved:true,emptyFilterRetained:true,noFocusSteal:true,oldAnalysisIsolated:true,closedCleanTabReset:true,expansion:mode==='json'||mode==='toml',combinations,runtimeErrors:errors});await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log('Four formats: remount/reuse, per-file filters, valid selections, JSON/TOML expansion, late analysis, closed-tab cleanup, drafts and72 style/window cases passed.')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
