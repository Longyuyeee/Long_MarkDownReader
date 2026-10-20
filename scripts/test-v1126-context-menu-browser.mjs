import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1126-structured-history-development/context-menu',base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9036'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({args:['--no-proxy-server']}),checks=[],errors=[];const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(String(e)))
try{
 await page.goto(base+'/scripts/fixtures/file-management-browser.html');await page.getByRole('link',{name:'资料库',exact:true}).click()
 const file=page.locator('[data-drop-path="C:/workflow-fixture/项目方案.md"]'),folder=page.locator('[data-drop-path="C:/workflow-fixture/Inbox"]')
 const item=text=>page.locator('.n-dropdown-option-body__label').filter({hasText:new RegExp('^'+text+'$')}).last()
 const reachable=async target=>{await target.hover();const box=await target.boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=1281);assert.equal(await target.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true)}
 for(const style of ['soft','neo','glass','airy','minimal','sharp']){
  await page.evaluate(style=>{window.workflowAudit.store.visualStyle=style;window.workflowAudit.store.theme=style==='glass'?'dark':'green'},style)
  await file.click({button:'right'});await item('更多操作').hover();await reachable(item('编辑显示样式'));await item('使用外部应用打开').hover();await page.waitForTimeout(180);assert.ok(await page.locator('.n-dropdown-menu').count()>=3);await page.keyboard.press('Escape');await page.mouse.click(1100,780)
  await folder.click({button:'right'});await item('新建').hover();await item('文件夹').waitFor();await reachable(item('文件夹'));await page.mouse.click(1100,780)
  checks.push(style+' file More, nested external apps, folder New are visible and pointer reachable')
 }
 await page.setViewportSize({width:1280,height:500});await file.click({button:'right'});await item('更多操作').hover();await reachable(item('编辑显示样式'));await page.screenshot({path:output+'/short-window.png'});checks.push('short window scrolling and submenu remain reachable')
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/result.json',JSON.stringify({status:'passed',nativeBridgeMocked:true,desktopInputUsed:false,checks,errors},null,2));console.log('File submenu checks passed: '+checks.length)
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});await fs.writeFile(output+'/failure.json',JSON.stringify({failure:String(error.stack||error),checks,errors},null,2));throw error}finally{await browser.close()}
