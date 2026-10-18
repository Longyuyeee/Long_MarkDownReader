import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),baseline=process.argv.includes('--baseline'),output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY
assert.ok(output);await fs.mkdir(output)
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:860},permissions:['clipboard-read','clipboard-write']}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
const value=()=>page.locator('.sheet-row').nth(1).locator('.cell-content').nth(0).textContent()
try{
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022')+'/scripts/fixtures/workbook-save-browser.html?v1116=1');await page.locator('.workbook-cell').first().waitFor();await page.locator('.sheet-row').nth(1).locator('.workbook-cell').nth(0).click();const before=await value()
 await page.locator('.tool-panel-trigger').click();await page.getByText('数据、Table 与规则',{exact:true}).click();const input=page.getByPlaceholder('包含筛选',{exact:true});await input.fill('可见');await input.press('Home');await input.press('Delete');await page.waitForTimeout(200)
 const after=await value(),query=await input.inputValue();assert.equal(after,baseline?'':before);assert.equal(query,baseline?'可见':'见')
 if(!baseline){await input.press('Control+a');await input.press('Control+c');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'见');await page.evaluate(()=>navigator.clipboard.writeText('可见'));await input.press('Control+v');assert.equal(await input.inputValue(),'可见');assert.equal(await value(),before);await page.locator('.sheet-row').nth(1).locator('.workbook-cell').nth(0).click();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.formula-bar output').textContent(),'B2')}
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/control-keyboard.png'});await fs.writeFile(output+'/results.json',JSON.stringify({status:baseline?'reproduced-not-fixed':'passed',before,after,query,nativeBridgeMocked:true,desktopInputUsed:false,sourceUserContentIncluded:false,errors,scope:'Actual WorkbookView and trusted headless key/clipboard input; native persistence simulated'},null,2)+'\n')
 console.log(baseline?'REPRODUCED: Delete in filter input clears the selected worksheet cell':'PASS: filter input owns Delete/copy/paste; clicking the grid returns arrow-key navigation')
}finally{await browser.close()}
