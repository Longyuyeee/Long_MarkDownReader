import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {findFixture} from './lib/document-find-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1125-find-development/external',browser=await chromium.launch({headless:true}),checks=[],errors=[]
await fs.mkdir(output,{recursive:true});let page
try{
 for(const mode of ['wysiwyg','ir','sv']){
  page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(String(e.stack||e)))
  await page.goto('http://127.0.0.1:9035/scripts/fixtures/v1125-find-external-browser.html?mode='+mode,{waitUntil:'domcontentloaded',timeout:60000});const p=page.locator('#vditor .vditor-'+mode).getByText('第二段 用户 之外 用户。',{exact:true});await p.waitFor();await page.locator('.actions').getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>window.externalAudit.calls.some(c=>c.command==='write_external_text_document'));const baseline=await page.evaluate(()=>window.externalAudit.disk);assert.equal(baseline,findFixture+(mode==='sv'?'\n':''));await p.click();await page.keyboard.press('Home');for(let i=0;i<4;i++)await page.keyboard.press('ArrowRight');for(let i=0;i<2;i++)await page.keyboard.press('Shift+ArrowRight');assert.equal(await page.evaluate(()=>getSelection().toString()),'用户')
  // The menu steals focus: its mousedown must remember the precise original selection.
  await page.getByTitle('文档操作',{exact:true}).click();await page.getByText('查找替换… · Ctrl+H',{exact:true}).click();const modal=page.locator('.document-find-dialog');await modal.getByText('1 / 1 处',{exact:true}).waitFor();await modal.getByRole('textbox',{name:'替换内容',exact:true}).fill('访客');await modal.getByRole('button',{name:'替换这一处',exact:true}).click();await modal.getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.dirty-dot').waitFor();assert.equal(await page.evaluate(()=>window.externalAudit.disk),baseline)
  await page.locator('#vditor button[data-type="undo"]').click();await p.waitFor();await page.keyboard.press('Control+h');await modal.waitFor();await modal.locator('.n-base-selection').click();await page.getByText('整篇文档',{exact:true}).last().click();await modal.getByRole('textbox',{name:'查找内容',exact:true}).fill('第二段 用户');await modal.getByRole('textbox',{name:'替换内容',exact:true}).fill('第二段 访客');await modal.getByRole('button',{name:'替换这一处',exact:true}).click();await modal.getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.actions').getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.dirty-dot'));assert.equal(await page.evaluate(()=>window.externalAudit.disk),baseline.replace('第二段 用户','第二段 访客'));checks.push({id:mode+'-external-menu-selection-unsaved-undo-and-explicit-save',status:'passed'})
  await page.close()
 }
 assert.deepEqual(errors,[])
}catch(cause){await fs.writeFile(output+'/failure.json',JSON.stringify({error:String(cause.stack||cause),body:await page.locator('body').innerText(),checks,errors},null,2));await page.screenshot({path:output+'/failure.png'});throw cause}
finally{await fs.writeFile(output+'/report.json',JSON.stringify({nativeBridgeMocked:true,desktopInputUsed:false,checks,errors},null,2));await browser.close()}
console.log(JSON.stringify({status:'passed',checks:checks.length,nativeBridgeMocked:true}))
