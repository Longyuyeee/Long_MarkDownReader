// Actual component route transition; simulated native bridge, never installer acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY
assert.ok(output);await fs.mkdir(output);const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));let status='failed'
try{
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022')+'/scripts/fixtures/v1117-docx-browser.html');await page.locator('.docx-page').waitFor();await page.getByTitle('打开 DOCX 页面编辑').click();await page.locator('.docx-editor textarea').fill('我没保存，不应该因同一路径打开外部预览就丢失。')
 await page.evaluate(()=>{void docxAudit.router.replace('/docx?path=C:/ui/项目计划.docx&external=1')})
 await page.getByRole('dialog').waitFor({timeout:2000});await page.getByRole('dialog').getByRole('button',{name:'继续编辑',exact:true}).click()
 assert.equal(await page.locator('.docx-editor textarea').inputValue(),'我没保存，不应该因同一路径打开外部预览就丢失。');assert.equal(await page.evaluate(()=>docxAudit.writes.length),0);assert.equal(await page.locator('.draft-list article').count(),1);assert.deepEqual(errors,[]);status='passed'
}finally{await page.screenshot({path:output+'/same-path-external.png'});await fs.writeFile(output+'/results.json',JSON.stringify({status,errors,nativeBridgeMocked:true,desktopInputUsed:false,scope:'Same path internal-to-external route must ask before discarding a draft'},null,2)+'\n');await browser.close()}
