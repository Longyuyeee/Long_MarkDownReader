import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const{chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1115-table-before',base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true})
try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:1100,height:760}}),page=await context.newPage()
 await page.goto(base+'/scripts/fixtures/table-bulk-browser.html');const cells=page.locator('.data-cell input');await cells.first().waitFor()
 await page.screenshot({path:output+'/before.png'});const clipboard='会议纪要\t待处理\t00123\r\n交付检查\t已完成\t9007199254740993123\r\n'
 await page.evaluate(text=>navigator.clipboard.writeText(text),clipboard);await cells.first().click();await page.keyboard.press('Control+v')
 const actual=await cells.evaluateAll(inputs=>inputs.map(input=>input.value)),trace=await page.evaluate(()=>tableBulkAudit.trace)
 assert.equal(actual[1],'待处理');assert.equal(actual[3],'核对合同');assert.notEqual(actual[0],'会议纪要');assert.ok(trace.some(e=>e.type==='paste'&&e.trusted))
 await page.screenshot({path:output+'/actual-single-input-collapse.png'})
 await fs.writeFile(output+'/results.json',JSON.stringify({status:'reproduced',scope:'actual-production-TableView-real-headless-clipboard-simulated-native-IPC',clipboard,actual,trace,defect:'Multiple rows/columns collapse into the focused single-line input; other cells are unchanged.',sourceUserContentIncluded:false},null,2)+'\n')
 console.log('Reproduced real multi-cell paste collapse; original result retained.')
}finally{await browser.close()}
