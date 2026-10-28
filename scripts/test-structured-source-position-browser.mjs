import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionDraft,positionSource} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15945',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v134-browser')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[]
let page
try{
 for(const reuse of (process.env.LONGEDIT_POSITION_REUSE?[process.env.LONGEDIT_POSITION_REUSE==='1']:[false,true]))for(const mode of (process.env.LONGEDIT_POSITION_MODES?.split(',')||['json','yaml','xml','toml'])){
  page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  console.log('Start',mode,'reuse',reuse);await page.goto(base+'/scripts/fixtures/v134-source-position-browser.html?mode='+mode+'&reuse='+(reuse?'1':'0'),{waitUntil:'domcontentloaded',timeout:120000})
  const root=page.locator('.'+mode+'-workspace'),source=root.locator('.cm-content[contenteditable=true]'),outline=root.locator('[role=group][aria-label$="结构提纲"]')
  const filter=root.locator(mode==='json'?'input[aria-label="筛选字段路径"]':mode==='yaml'?'input[aria-label="筛选 YAML 结构提纲"]':'aside input').first()
  const fresh=()=>page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const open=async letter=>{await page.evaluate(({letter,mode})=>structuredAudit.router.push('/editor?path=C:/ui/'+letter+'.'+mode),{letter,mode});await fresh()}
  const position=()=>page.evaluate(()=>{const view=document.querySelector('.cm-content').cmTile.root.view;view.lineBlockAtHeight(0);const line=view.lineBlockAtHeight(view.scrollDOM.scrollTop);return{line:view.state.doc.lineAt(line.from).number,offset:view.scrollDOM.scrollTop-line.top,height:view.scrollDOM.scrollHeight,client:view.scrollDOM.clientHeight,snapshot:view.scrollSnapshot().value,ranges:view.state.selection.ranges.map(({anchor,head})=>({anchor,head})),top:view.scrollDOM.scrollTop,text:view.state.doc.toString()}})
  const equal=async expected=>{await page.waitForFunction(p=>{const v=document.querySelector('.cm-content').cmTile.root.view;const line=v.lineBlockAtHeight(v.scrollDOM.scrollTop);return JSON.stringify(v.state.selection.ranges.map(({anchor,head})=>({anchor,head})))===JSON.stringify(p.ranges)&&v.state.doc.lineAt(line.from).number===p.line&&Math.abs(v.scrollDOM.scrollTop-line.top-p.offset)<3},expected).catch(async error=>{await writeFile(resolve(output,'position-mismatch.json'),JSON.stringify({expected,actual:await position()},null,2));throw error});assert.equal((await position()).text,expected.text)}
  await fresh();await source.fill(positionDraft(mode));await fresh()
  await page.keyboard.press('Control+End');await page.keyboard.press('ArrowUp');await page.keyboard.press('End');await page.keyboard.press('Shift+Home');await page.waitForTimeout(80)
  const a=await position();assert.ok(a.top>500);assert.ok(a.ranges[0].anchor>a.ranges[0].head)
  await outline.hover();await page.mouse.wheel(0,1600);await page.waitForTimeout(100);const outlineTop=await outline.evaluate(e=>e.scrollTop);assert.ok(outlineTop>200)
  await open('B');assert.equal((await position()).top,0);await source.click();await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Shift+End');await page.waitForTimeout(80);const b=await position()
  await open('A');await equal(a);await page.waitForFunction(({mode,top})=>Math.abs(document.querySelector('.'+mode+'-workspace [role=group][aria-label$="结构提纲"]').scrollTop-top)<3,{mode,top:outlineTop})
  assert.equal(await page.evaluate(m=>structuredAudit.files['C:/ui/A.'+m].content,mode),positionSource(mode))
  await open('B');await equal(b);await open('A');await equal(a)
  // A real outline navigation takes precedence over the return position.
  await filter.fill('field002');await root.locator('[data-outline-node*="field002"]').click();assert.ok((await page.evaluate(()=>structuredAudit.sourceSelection())).includes('我的草稿 2'))
  const located=await position();await open('B');await open('A');await equal(located)
  await filter.fill('');await page.waitForTimeout(180)
  if(mode==='json'){
   await root.locator('header button').filter({hasText:'树形'}).click();const tree=root.locator('.tree-rows');await tree.hover();await page.mouse.wheel(0,1900);await page.waitForTimeout(120);const top=await tree.evaluate(e=>e.scrollTop);assert.ok(top>300)
   await open('B');await open('A');await page.waitForFunction(top=>Math.abs(document.querySelector('.tree-rows')?.scrollTop-top)<3,top)
   await root.locator('header button').filter({hasText:'源码'}).click();await equal(located)
  }
  const combinations=[]
  if(!reuse)for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   console.log('Style',mode,style,width);await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{structuredAudit.store.visualStyle=style;document.body.dataset.style=style},style)
   if(!await filter.isVisible())await root.locator('header button').filter({hasText:mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题'}).click()
   await page.waitForTimeout(350);await source.click();await page.keyboard.press('Control+End');await page.keyboard.press('ArrowUp');await page.keyboard.press('End');await page.keyboard.press('Shift+Home');await page.waitForTimeout(180);const point=await position()
   await open('B');await open('A');if(!await filter.isVisible())await root.locator('header button').filter({hasText:mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题'}).click();await equal(point);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);combinations.push({style,width})
  }
  if(!reuse)await page.screenshot({path:resolve(output,mode+'-640.png'),fullPage:true})
  // A returning file must not take focus from input during pending analysis.
  await open('B');await page.evaluate(m=>{structuredAudit.holdAnalysis=true;void structuredAudit.router.push('/editor?path=C:/ui/A.'+m)},mode)
  await page.waitForFunction(()=>structuredAudit.pending.some(item=>item.kind==='holdAnalysis'))
  if(!await filter.isVisible())await root.locator('header button').filter({hasText:mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题'}).click()
  await filter.fill('field050');await page.evaluate(()=>structuredAudit.release('holdAnalysis'));await fresh()
  assert.equal(await filter.evaluate(element=>document.activeElement===element),true)
  await root.locator('[data-outline-node*="field050"]').click();assert.ok((await page.evaluate(()=>structuredAudit.sourceSelection())).includes('我的草稿 50'))
  // Replacing disk contents cannot apply a stale source position.
  await open('B');await page.evaluate(m=>{structuredAudit.files['C:/ui/B.'+m].content=structuredAudit.files['C:/ui/B.'+m].content.replaceAll('原稿','外改');structuredAudit.files['C:/ui/B.'+m].signature+='changed'},mode)
  await open('A');await open('B');await page.waitForTimeout(80);assert.deepEqual((await position()).ranges,[{anchor:0,head:0}]);assert.equal((await position()).top,0)
  assert.equal(await page.evaluate(m=>structuredAudit.store.tabs.find(t=>t.path==='C:/ui/A.'+m).isDirty,mode),true)
  assert.deepEqual(errors,[]);checks.push({mode,reusedComponent:reuse,status:'passed',sourceSelectionAndScroll:true,reverseSelection:true,outlineScroll:true,explicitNavigationWins:true,pendingAnalysisDoesNotStealFilterFocus:true,changedContentFallsBack:true,draftsPreserved:true,jsonTreeScroll:mode==='json',combinations,runtimeErrors:errors});await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log(checks.length+' ownership cases and'+checks.reduce((n,c)=>n+c.combinations.length,0)+' style/window combinations: source selection/scroll, outline/tree scroll, navigation priority, changed-source fallback and drafts passed.')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
