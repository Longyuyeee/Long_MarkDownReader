import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1119-before',base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022'
await fs.mkdir(output);const browser=await chromium.launch(),observations=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}})
 const start=async mode=>{await page.goto(base+'/scripts/fixtures/v1119-organizing-browser.html?mode='+mode);await page.locator(mode==='canvas'?'.canvas-node textarea':'.inspector textarea').first().waitFor()}
 await start('canvas');await page.locator('.canvas-node textarea').first().fill('我刚写的方案');await page.evaluate(()=>{void organizingAudit.router.push('/canvas?path=C:/ui/B.canvas')});await page.waitForTimeout(350)
 observations.push({id:'canvas-route-update',lost:await page.locator('.canvas-node textarea').first().inputValue()==='B',dialog:await page.locator('.n-dialog').count()});await page.screenshot({path:output+'/canvas-route.png'})
 for(const mode of ['canvas','opml']){
  await start(mode);const input=page.locator(mode==='canvas'?'.canvas-node textarea':'.inspector textarea').first();await input.fill('保存的内容');await input.press('Tab');await page.evaluate(()=>organizingAudit.holdWrite=true);await page.locator(mode==='canvas'?'.canvas-toolbar button.primary':'.header-actions button.primary').click();await page.waitForFunction(()=>organizingAudit.pending.length===1);await input.fill('保存中又补充了内容');await page.evaluate(()=>organizingAudit.release());await page.waitForTimeout(300)
  const visible=await input.inputValue(),disk=await page.evaluate(mode=>{const f=organizingAudit.files['C:/ui/A.'+mode];return mode==='canvas'?JSON.parse(f.content).nodes[0].text:f.document.roots[0].note},mode)
  observations.push({id:mode+'-save-later-input',visible,disk,status:await page.locator(mode==='canvas'?'.save-state':'.statusbar').textContent()});await page.screenshot({path:output+'/'+mode+'-save.png'})
  await start(mode);const edit=page.locator(mode==='canvas'?'.canvas-node textarea':'.inspector textarea').first();await edit.fill('同文件定位前的草稿');await edit.press('Tab');await page.evaluate(mode=>{void organizingAudit.router.push((mode==='canvas'?'/canvas':'/mindmap')+'?path=C:/ui/A.'+mode+'&node='+(mode==='canvas'?'b':'root')+'&locatorToken=next')},mode);await page.waitForTimeout(300)
  observations.push({id:mode+'-locator',visible:await edit.inputValue()});await page.screenshot({path:output+'/'+mode+'-locator.png'})
 }
 assert.equal(observations[0].lost,true,'Keep original failed route behavior as evidence')
 await fs.writeFile(output+'/observations.json',JSON.stringify({nativeBridgeMocked:true,desktopInputUsed:false,observations},null,2)+'\n');console.log(JSON.stringify(observations))
}finally{await browser.close()}
