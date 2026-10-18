import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022',output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1119-source-race'
await fs.mkdir(output);const browser=await chromium.launch(),report={nativeBridgeMocked:true,desktopInputUsed:false,status:'running'}
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'no-preference'})
 try{
  await page.goto(base+'/scripts/fixtures/v1119-organizing-browser.html');await page.locator('.canvas-node textarea').first().waitFor();await page.evaluate(()=>organizingAudit.holdResolver=true);await page.getByRole('button',{name:'＋ 文件',exact:true}).click();await page.locator('.n-dialog input').fill('late/old.md');await page.locator('.n-dialog button').filter({hasText:'添加文件节点'}).click();await page.locator('.n-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>organizingAudit.pending.length===1)
  await page.getByRole('button',{name:'重新指定',exact:true}).click();await page.locator('.n-dialog input').fill('B.opml');await page.locator('.n-dialog button').filter({hasText:'使用此来源'}).click();await page.locator('.n-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('.source-inspector')?.textContent.includes('来源可用'));await page.evaluate(()=>organizingAudit.release());await page.waitForTimeout(180)
  report.visible=await page.locator('.source-inspector').innerText();report.openDisabled=await page.getByRole('button',{name:'打开来源',exact:true}).isDisabled();await page.screenshot({path:output+'/late-error.png'});assert.match(report.visible,/来源可用/);assert.equal(report.openDisabled,false);report.status='passed'
 }catch(error){report.status='failed';report.failure=String(error.stack||error);throw error}
 finally{await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n')}
}finally{await browser.close()}
