import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
import {installedMarkdownValueExpression} from './lib/installed-markdown-observation.mjs'
import {replacedSource} from './lib/inline-link-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),q=JSON.stringify
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15989',output=process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v1315-browser',browser=await chromium.launch({headless:true,args:['--no-proxy-server']})
const checks=[],layouts=[],errors=[]
await mkdir(output,{recursive:true})
try{
 for(const mode of ['wysiwyg','ir','sv']){
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v1315-library-links-browser.html?editor='+mode)
  const session=await page.context().newCDPSession(page),send=(m,a)=>session.send(m,a),evaluate=e=>page.evaluate(e),ui=nativeUserInput({send,evaluate},{timeoutMs:15000}),root='#vditor-lib .vditor-'+mode+' > '+(mode==='wysiwyg'?'pre':'div'),store='shellAudit.store'
  await ui.waitFor('typeof ('+installedMarkdownValueExpression+')==="string"','editor ready');await page.waitForTimeout(700)
  const before=await evaluate(installedMarkdownValueExpression)
  const linkTarget=mode==='sv'?`[...document.querySelectorAll('#vditor-lib .vditor-sv__marker--link')].find(e=>e.textContent.includes('missing.md'))`:mode==='ir'?`[...document.querySelectorAll('#vditor-lib .vditor-ir__link')].find(e=>e.textContent==='同一份资料')`:`[...document.querySelectorAll('#vditor-lib a[href]')].find(e=>e.textContent==='同一份资料')`
  await ui.clickTarget(linkTarget,'right');await ui.clickText('.n-dropdown-option-body__label','更换文件目标…');await page.locator('[data-testid=inline-link-repair-dialog]').waitFor()
  await ui.click('.inline-link-repair-dialog .n-base-selection');await ui.clickTarget(`[...document.querySelectorAll('.n-base-select-option')].find(e=>e.querySelector('strong')?.textContent==='新 目标.md')`)
  await ui.waitFor('!document.querySelector("[data-testid=inline-link-repair-apply]").disabled','target verified')
  assert.ok(await evaluate('document.querySelector(".inline-link-repair-dialog").textContent.includes("保留原章节定位")'))
  for(const style of ['soft','neo','glass','airy','minimal','sharp'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?640:900});await evaluate(store+'.visualStyle='+q(style));await page.waitForTimeout(80)
   const geometry=await page.locator('.inline-link-repair-dialog').boundingBox();assert.ok(geometry.x>=0&&geometry.x+geometry.width<=width+1);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);layouts.push({mode,style,width})
   if(mode==='wysiwyg'&&width===800)await page.screenshot({path:output+'/dialog-'+style+'.png'})
  }
  await page.setViewportSize({width:1440,height:900});await ui.click('[data-testid=inline-link-repair-apply]');await page.locator('[data-testid=inline-link-repair-dialog]').waitFor({state:'detached'})
  await ui.waitFor(installedMarkdownValueExpression+'==='+q(replacedSource(before)),'only selected destination replaced');assert.equal(await evaluate(store+'.tabs[0].content'),replacedSource(before));assert.equal(await evaluate('shellAudit.disk.get("C:/shell-fixture/A.md")'),before.trimEnd()+'\n');assert.equal(await evaluate(store+'.tabs[0].isDirty'),true)
  await ui.key('z','KeyZ',90,2);await ui.waitFor(installedMarkdownValueExpression+'==='+q(before),'one undo');await ui.key('y','KeyY',89,2);await ui.waitFor(installedMarkdownValueExpression+'==='+q(replacedSource(before)),'redo');checks.push(mode+':single-link,draft,undo,redo,fragment')
  await page.close()
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify({status:'passed',evidenceLevel:'headless-browser-mocked-ipc',checks,layouts,errors},null,2));console.log('PASS',checks.length,'mode transactions /',layouts.length,'layouts')
}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages())){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});await writeFile(output+'/failure.json',JSON.stringify({error:String(error.stack),body:await page.locator('body').innerText(),html:await page.locator('#vditor-lib').innerHTML().catch(()=>''),errors},null,2))}throw error}finally{await browser.close()}
