import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
const{chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15988',output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v1313-menu-browser')
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[];let page
try{
 for(const mode of ['json','yaml','xml','toml']){
  page=await browser.newPage({viewport:{width:1280,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v1313-library-navigation-browser.html?mode='+mode,{waitUntil:'domcontentloaded',timeout:120000})
  const cdp=await page.context().newCDPSession(page),evaluate=x=>page.evaluate(x),ui=nativeUserInput({send:(m,p)=>cdp.send(m,p),evaluate},{timeoutMs:30000}),root='.'+mode+'-workspace',source=root+' .cm-content',view=`document.querySelector('${source}').cmTile.root.view`
  const filter=root+(mode==='json'?' input[aria-label="筛选字段路径"]':mode==='yaml'?' input[aria-label="筛选 YAML 结构提纲"]':' aside input')
  const fresh=()=>ui.waitFor(`document.querySelector('${root}')?.dataset.analysisCurrent==='true'&&document.querySelector('${root}')?.dataset.loading==='false'`,'current source')
  const point=()=>evaluate(`({ranges:${view}.state.selection.ranges.map(r=>({anchor:r.anchor,head:r.head})),mainIndex:${view}.state.selection.mainIndex,top:${view}.scrollDOM.scrollTop,left:${view}.scrollDOM.scrollLeft})`)
  const same=(a,b)=>{assert.deepEqual(a.ranges,b.ranges);assert.equal(a.mainIndex,b.mainIndex);assert.ok(Math.abs(a.top-b.top)<3,JSON.stringify({mode,actual:a,expected:b}));assert.ok(Math.abs(a.left-b.left)<3)}
  const pause=()=>page.waitForTimeout(180),visible=s=>`!!document.querySelector(${JSON.stringify(s)})?.getClientRects().length`
  await fresh();await ui.fill(source,positionDraft(mode));await fresh()
  for(const width of [1280,1000,800]){
   await page.setViewportSize({width,height:width===1280?820:width===1000?700:640});await pause()
   if(!await evaluate(visible(filter)))await ui.clickText(root+' header button',mode==='json'?'结构与诊断':mode==='yaml'?'结构与问题':mode==='xml'?'元素与问题':'分区与问题')
   await ui.fill(filter,'field00');await pause();await ui.click(source);await ui.key('End','End',35,2);for(let i=0;i<4;i++)await ui.key('ArrowLeft','ArrowLeft',37,8);await pause();const origin=await point();assert.ok(origin.top>0)
   await ui.click(root+' [data-outline-node*="field002"]');await ui.waitFor(`document.activeElement===document.querySelector('${source}')`,'source focus after locate');await pause();const target=await point();assert.equal(target.top,0)
   for(const direction of ['return','forward','return']){
    await ui.click('[data-testid=library-document-menu]');await ui.waitFor(visible('[data-testid=library-search-'+direction+']'),'actual menu action '+direction)
    if(direction==='forward'&&width!==1000){await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-'+width+'.png'),fullPage:true})}
    await ui.click('[data-testid=library-search-'+direction+']');await ui.waitFor(`document.activeElement===document.querySelector('${source}')`,'source focus after menu navigation');await pause();same(await point(),direction==='forward'?target:origin)
   }
   assert.equal(await evaluate(`${view}.state.doc.toString()`),positionDraft(mode));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);assert.deepEqual(errors,[])
   checks.push({mode,width,status:'passed',actualLibraryMenu:true,blurredSourceFocus:true,topForwardExact:true,originBackExact:true,draftPreserved:true});console.log('Library menu',mode,width,'passed')
  }
  assert.equal(await evaluate(`shellAudit.disk.get('C:/shell-fixture/A.${mode}')`),positionSource(mode));assert.equal(await evaluate(`shellAudit.calls.filter(c=>c.command.startsWith('write_')).length`),0)
  await page.close();page=undefined
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks},null,2)+'\n');console.log('Actual Library menu 12 format-window cases passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks},null,2));throw error}finally{await browser.close()}
