import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),baseline=process.argv.includes('--baseline'),output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY
assert.ok(output);await fs.mkdir(output)
const browser=await chromium.launch({headless:true}),context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:1180,height:800}}),page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message));const cell=(row)=>page.locator('.sheet-row').nth(row).locator('.workbook-cell').nth(3)
try{
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022')+'/scripts/fixtures/workbook-save-browser.html?v1116=1');await cell(4).waitFor();await cell(4).click();await page.keyboard.press('Control+x');await page.waitForFunction(()=>document.querySelectorAll('.sheet-row')[4].querySelectorAll('.cell-content')[3].textContent==='')
 await cell(5).click();await page.keyboard.press('Control+v');await page.waitForFunction(()=>document.querySelector('.formula-bar input').value.startsWith('='))
 const formula=await page.locator('.formula-bar input').inputValue();assert.equal(formula,baseline?'=D3+D4':'=D2+D3');assert.deepEqual(errors,[]);await page.screenshot({path:output+'/formula-cut.png'})
 await fs.writeFile(output+'/results.json',JSON.stringify({status:baseline?'reproduced-not-fixed':'passed',formula,expectedMoveFormula:'=D2+D3',nativeBridgeMocked:true,desktopInputUsed:false,sourceUserContentIncluded:false,errors,scope:'Actual component and real headless cut/paste; simulated native translation/save, not native disk acceptance'},null,2)+'\n')
 console.log(baseline?'REPRODUCED: formula cut incorrectly shifts references':'PASS: actual formula cut preserves references')
}finally{await browser.close()}
