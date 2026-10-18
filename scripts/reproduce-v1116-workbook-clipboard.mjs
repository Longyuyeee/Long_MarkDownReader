// Observation only: actual WorkbookView and real isolated browser clipboard.
// Existing fixture simulates native IPC; this is NOT installed/XLSX disk proof.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=path.resolve('docs/evidence/v1116-workbook-before')
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true})
try{
 const context=await browser.newContext({viewport:{width:1280,height:800},permissions:['clipboard-read','clipboard-write'],reducedMotion:'no-preference'})
 const page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022')+'/scripts/fixtures/workbook-save-browser.html')
 const first=page.locator('.workbook-cell').first()
 await first.waitFor();await first.click()
 await page.evaluate(text=>navigator.clipboard.writeText(text),'"会议\n备注"\t可见\t00123')
 const clipboardReceived=await page.evaluate(()=>navigator.clipboard.readText())
 await page.keyboard.press('Control+v')
 await page.waitForFunction(()=>document.querySelector('.workbook-cell')?.textContent.includes('会议'))
 await page.waitForTimeout(350)
 const observed=await page.locator('.sheet-row').evaluateAll(rows=>rows.slice(0,2).map(row=>Array.from(row.querySelectorAll('.workbook-cell .cell-content')).slice(0,3).map(cell=>cell.textContent)))
 await page.screenshot({path:path.join(output,'quoted-multiline-paste.png')})
 const expectedFirstCell='会议'+(clipboardReceived.includes('\r\n')?'\r\n':'\n')+'备注'
 assert.notEqual(observed[0][0],expectedFirstCell,'Baseline no longer reproduces: reassess before changing product')
 assert.ok(observed[0][0].includes('会议'));assert.deepEqual(errors,[])
 const report={status:'reproduced-not-fixed',evidenceLevel:'actual-WorkbookView-real-headless-clipboard-native-IPC-simulated',nativeBridgeMocked:true,desktopInputUsed:false,sourceUserContentIncluded:false,productSourceCommit:'a40c0ea2a71a7cd1230c8704cb1e45b2c79c9cba',clipboardReceived,expected:{rows:1,columns:3,values:[[expectedFirstCell,'可见','00123']]},observed,errors,note:'Quoted multiline field is split into physical rows by current pasteSelection; no native save, no installed acceptance, no product changes.'}
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n')
 console.log('REPRODUCED: quoted multiline workbook paste splits one logical field; observation only, not fixed or native acceptance')
}finally{await browser.close()}
