import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {outlineNavigationDraft,outlineNavigationSources,outlineNavigationPrefix} from './lib/structured-outline-navigation-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15943',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v132-browser')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[]
let current
try{
 for(const mode of ['json','yaml','xml','toml']){
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'}),errors=[];current=page
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v132-outline-navigation-browser.html?mode='+mode,{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),rows=root.locator('[data-outline-node]'),source=root.locator('.cm-content[contenteditable=true]')
  const fresh=()=>page.waitForFunction(mode=>document.querySelector('.'+mode+'-workspace')?.dataset.analysisCurrent==='true',mode)
  await fresh();await rows.first().waitFor()
  const second=root.locator('[data-outline-node*="second"]'),third=root.locator('[data-outline-node*="third"]')
  await rows.first().focus();await page.keyboard.press('End');assert.ok((await page.locator(':focus').getAttribute('data-outline-node')).includes('third'))
  await page.keyboard.press('ArrowUp');assert.ok((await page.locator(':focus').getAttribute('data-outline-node')).includes('second'))
  assert.equal(await root.locator('[data-outline-node][aria-current=true]').count(),1)
  await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement?.matches('.cm-content'))
  assert.ok((await page.evaluate(()=>structuredAudit.sourceSelection())).includes('保留😀'))
  await source.fill(outlineNavigationDraft(mode));await fresh()
  assert.ok((await root.locator('[data-outline-node][aria-current=true]').getAttribute('data-outline-node')).includes('second'))
  await second.focus();await page.keyboard.press('Enter');assert.ok((await page.evaluate(()=>structuredAudit.sourceSelection())).includes('保留😀'))
  const draft=await page.evaluate(()=>structuredAudit.sourceText());await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),draft)
  assert.equal(await page.evaluate(mode=>structuredAudit.files['C:/ui/A.'+mode].content,mode),outlineNavigationSources[mode])
  const filter=root.locator(mode==='json'?'input[aria-label="筛选字段路径"]':mode==='yaml'?'input[aria-label="筛选 YAML 结构提纲"]':'aside input').first()
  await filter.fill('second');await page.waitForTimeout(350);assert.equal(await rows.count(),mode==='json'?2:1);assert.equal(await second.count(),1);assert.equal(await root.locator('[data-outline-node*="first"],[data-outline-node*="third"]').count(),0)
  await second.focus();await page.keyboard.press('ArrowDown');assert.equal(await second.getAttribute('tabindex'),'0');await page.keyboard.press('Enter');assert.ok((await page.evaluate(()=>structuredAudit.sourceSelection())).includes('保留😀'))
  await filter.fill('无匹配结果');await page.waitForTimeout(350);assert.equal(await rows.count(),0);await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),draft)
  await filter.fill('');await page.waitForTimeout(350)
  await page.evaluate(()=>{structuredAudit.holdAnalysis=true})
  const heldDraft=outlineNavigationPrefix(mode)+draft
  await source.fill(heldDraft);await page.waitForFunction(()=>structuredAudit.pending.some(p=>p.kind==='holdAnalysis'))
  await third.focus();await page.keyboard.press('Home');assert.ok((await page.locator(':focus').getAttribute('data-outline-node')).includes('third'))
  await page.evaluate(()=>structuredAudit.release('holdAnalysis'));await fresh();await page.waitForFunction(()=>document.activeElement?.dataset.outlineNode?.includes('third'));await page.keyboard.press('Home');assert.ok(!(await page.locator(':focus').getAttribute('data-outline-node')).includes('third'))
  await page.evaluate(mode=>structuredAudit.router.push('/editor?path=C:/ui/B.'+mode),mode);await fresh();await page.waitForFunction(()=>structuredAudit.sourceText().includes('另一份资料'))
  assert.equal(await root.locator('[data-outline-node][aria-current=true]').count(),0)
  await page.evaluate(mode=>structuredAudit.router.push('/editor?path=C:/ui/A.'+mode),mode);await fresh();await page.waitForFunction(()=>structuredAudit.sourceText().includes('我的草稿'))
  assert.equal(await page.evaluate(()=>structuredAudit.sourceText()),heldDraft)
  const combinations=[]
  for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app');store.visualStyle=style;document.body.dataset.style=style},style)
   await page.evaluate(()=>new Promise(requestAnimationFrame).then(()=>new Promise(requestAnimationFrame)))
   if(!await rows.first().isVisible()){await root.locator('header button').filter({hasText:mode==='json'?'结构与诊断':mode==='toml'?'分区与问题':mode==='xml'?'元素与问题':'结构与问题'}).click()}
   await rows.first().waitFor({state:'visible'});await rows.first().focus();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement?.matches('.cm-content')&&structuredAudit.sourceSelection().includes('最后'))
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   combinations.push({style,width})
  }
  await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true})
  assert.deepEqual(errors,[]);checks.push({mode,status:'passed',keyboard:true,selectionAfterOffsets:true,filterAndEmpty:true,staleAnalysis:true,fileSwitchDraft:true,normalMotion:true,combinations,runtimeErrors:errors});await page.close()
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,checks},null,2));console.log('Four source editors: keyboard, Unicode offsets, filters, delayed analysis, switching drafts and72 style/window cases passed.')
}catch(error){await current?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}
finally{await browser.close()}
