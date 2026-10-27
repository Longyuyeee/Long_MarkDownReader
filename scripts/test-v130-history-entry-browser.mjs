// Whole production application; only fixture IPC/disk are simulated.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=resolve(process.env.FULL_WINDOW_OUTPUT||'.release-secrets/v130-history')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[]
let activePage
try {
 for(const mode of ['json','yaml','xml','toml']){
  const page=await browser.newPage({viewport:{width:1280,height:820},reducedMotion:'no-preference'}),errors=[]
  activePage=page
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`http://127.0.0.1:15941/scripts/fixtures/full-window-review-browser.html?fixture=v1120-structured&surface=embedded&mode=${mode}`,{waitUntil:'domcontentloaded',timeout:90000})
  await page.waitForFunction(()=>window.fullWindowAudit?.ready)
  const source=page.locator('.cm-content[contenteditable=true]')
  await source.waitFor()
  const original=await page.evaluate(()=>structuredAudit.sources[structuredAudit.mode])
  const draft=mode==='json'?JSON.stringify({value:'我的未保存草稿',rows:Array.from({length:30},(_,i)=>i)},null,2)
   :original.replace('原稿','我的未保存草稿')+Array.from({length:30},(_,i)=>mode==='xml'?`<!-- 保留记录 ${i} -->\n`:`# 保留记录 ${i}\n`).join('')
  await source.fill(draft)
  const read=()=>page.evaluate(()=>document.querySelector('.cm-content').cmTile.root.view.state.doc.toString())
  const close=async()=>{await page.locator('.text-history-dialog').getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.text-history-dialog').waitFor({state:'detached'})}
  await page.getByTestId('structured-history').click()
  await page.locator('.text-history-dialog .history-version-button').first().waitFor()
  await close()
  await page.getByTestId('library-document-menu').click()
  await page.locator('.document-menu-content').getByRole('button',{name:'历史与差异',exact:true}).click()
  await page.locator('.text-history-dialog .history-version-button').first().waitFor()
  await close()
  if(await page.getByRole('button',{name:'导航',exact:true}).getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'导航',exact:true}).click()
  await page.locator('#tab-history').click()
  await page.locator('#panel-history .history-version-button').first().click()
  const diff=page.locator('.history-diff-dialog')
  await diff.waitFor()
  assert.ok((await diff.innerText()).includes('初稿'))
  assert.ok((await diff.innerText()).includes('我的未保存草稿'))
  await diff.getByRole('button',{name:'取消',exact:true}).click()
  await page.locator('.text-history-dialog .history-version-button').first().waitFor()
  await close()
  assert.equal(await read(),draft)
  await page.locator('#panel-history .history-version-button').first().click()
  await diff.getByRole('button',{name:'替换编辑区…',exact:true}).click()
  await page.locator('.n-dialog').getByRole('button',{name:'保护草稿并替换',exact:true}).click()
  await diff.waitFor({state:'detached'})
  assert.equal(await read(),original.replace('原稿','初稿'))
  await page.waitForFunction(()=>document.activeElement?.matches('.cm-content'))
  await page.keyboard.press('Control+z')
  assert.equal(await read(),draft)
  assert.equal(await page.evaluate(()=>structuredAudit.files['C:/ui/A.'+structuredAudit.mode].content),original)
  checks.push({mode,case:'three-history-entries-compare-cancel-draft-only-restore-and-undo',passed:true})
  for(const style of ['soft','neo','glass','airy','minimal','sharp'])for(const [width,height] of [[1920,1080],[1000,700],[800,600],[640,480]]){
   await page.setViewportSize({width,height})
   await page.evaluate(style=>{fullWindowAudit.store.visualStyle=style;fullWindowAudit.store.theme=style==='neo'?'dark':'white'},style)
   await page.getByTestId('structured-history').scrollIntoViewIfNeeded()
   await page.getByTestId('structured-history').click()
   await page.locator('.text-history-dialog .history-version-button').first().waitFor()
   const closeButton=page.locator('.text-history-dialog').getByRole('button',{name:'关闭',exact:true})
   assert.ok(await closeButton.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight+1&&hit&&e.contains(hit)}),`${mode}/${style}/${width}: history close reachable`)
   if(style==='minimal'&&(width===1920||width===640))await page.screenshot({path:resolve(output,`${mode}-history-${width}.png`)})
   await page.locator('.text-history-dialog .history-version-button').last().click()
   await diff.waitFor()
   await page.waitForTimeout(250)
   for(const name of ['恢复为副本','替换编辑区…','取消'])assert.ok(await diff.getByRole('button',{name,exact:true}).evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight+1&&hit&&e.contains(hit)}),`${mode}/${style}/${width}: ${name} reachable with a long diff`)
   if(style==='minimal'&&(width===1920||width===640))await page.screenshot({path:resolve(output,`${mode}-diff-${width}.png`)})
   await diff.getByRole('button',{name:'取消',exact:true}).click();await close()
   assert.equal(await read(),draft)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0)
   checks.push({mode,style,width,height,case:'whole-window-history-reachable-and-draft-preserved',passed:true})
  }
  assert.deepEqual(errors,[])
  await page.close()
  await writeFile(resolve(output,'report.json'),JSON.stringify({nativeBridgeMocked:true,reducedMotion:'no-preference',checks},null,2))
  console.log(`${mode}: history entries and 24 whole-window combinations passed`)
 }
}catch(error){
 if(activePage&&!activePage.isClosed()){
  await activePage.screenshot({path:resolve(output,'failure.png')})
  const dialogs=await activePage.locator('.history-diff-dialog,.history-diff-dialog .n-card__content,.history-diff-dialog .n-card__footer,.history-diff-dialog button').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {tag:e.className,text:e.textContent.slice(0,60),rect:{x:r.x,y:r.y,width:r.width,height:r.height},overflow:getComputedStyle(e).overflow,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className}}))
  await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),dialogs,checks},null,2))
 }
 throw error
}finally{await browser.close()}
