// Retained preimplementation observations, not native installation acceptance.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const root=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY||'docs/evidence/v1116-workbook-baseline',base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022'
await fs.mkdir(root) // Never overwrite an acknowledged original observation.
const browser=await chromium.launch({headless:true})
let page
try{
 const context=await browser.newContext({viewport:{width:1280,height:860},permissions:['clipboard-read','clipboard-write'],reducedMotion:'no-preference'})
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/docs/design/v1116-workbook-editing.html');await page.screenshot({path:'docs/design/v1116-workbook-editing.png',fullPage:true})
 const open=async()=>{await page.goto(base+'/scripts/fixtures/workbook-save-browser.html?v1116=1');await page.locator('.workbook-cell').first().waitFor()}
 const cell=(row,column)=>page.locator('.sheet-row').nth(row).locator('.workbook-cell').nth(column)
 const paste=async(row,column,text)=>{await cell(row,column).click();await page.evaluate(t=>navigator.clipboard.writeText(t),text);const received=await page.evaluate(()=>navigator.clipboard.readText());await page.keyboard.press('Control+v');await page.waitForTimeout(180);return received}
 await open();const received=await paste(1,0,'"会议\n备注"\t可见\t00123')
 const pasted=await page.locator('.sheet-row').evaluateAll(rows=>rows.slice(1,3).map(row=>Array.from(row.querySelectorAll('.workbook-cell .cell-content')).slice(0,3).map(e=>e.textContent)))
 assert.equal(pasted[0][0],'"会议');await page.screenshot({path:root+'/01-quoted-paste-split.png'})
 await open();await paste(1,2,'00124');await page.getByRole('button',{name:'保存 (1)',exact:true}).click();await page.waitForFunction(()=>workbookAudit.writes.length===1)
 const requestedWrite=await page.evaluate(()=>workbookAudit.writes[0].edits);assert.equal(requestedWrite[0].kind,'number');await page.screenshot({path:root+'/02-identifier-number-draft.png'})
 await open();await cell(1,0).click();await page.keyboard.press('Control+c');await page.waitForTimeout(100);const copiedMultiline=await page.evaluate(()=>navigator.clipboard.readText())
 await page.locator('.tool-panel-trigger').click();await page.getByText('数据、Table 与规则',{exact:true}).click();await page.getByTitle('排序字段',{exact:true}).selectOption('2');await page.getByRole('button',{name:'升序',exact:true}).click()
 const navigationOrder=[];for(let i=0;i<4;i++){await page.getByRole('button',{name:'下一条',exact:true}).click();navigationOrder.push(await page.locator('.workbook-cell.selected').first().evaluate(cell=>cell.closest('.sheet-row').querySelectorAll('.workbook-cell .cell-content')[2].textContent))}
 assert.ok(navigationOrder.indexOf('9007199254740993124')<navigationOrder.indexOf('9007199254740993123'));await page.screenshot({path:root+'/03-precision-sort.png'})
 assert.deepEqual(errors,[])
 await fs.writeFile(root+'/results.json',JSON.stringify({status:'reproduced-not-fixed',nativeBridgeMocked:true,desktopInputUsed:false,sourceUserContentIncluded:false,received,pasted,requestedWrite,copiedMultiline,navigationOrder,errors,scope:'Production WorkbookView; actual headless clipboard and user input; existing native IPC simulated. No XLSX disk save or producer acceptance.'},null,2)+'\n')
 console.log('REPRODUCED: quoted paste split, identifier requested as number, unquoted multiline copy and long-ID sort precision tie; native disk not tested')
}catch(error){await fs.writeFile(root+'/driver-failure.json',JSON.stringify({status:'failed-driver-observation',failure:String(error.stack||error),nativeBridgeMocked:true,sourceUserContentIncluded:false},null,2)+'\n');await page?.screenshot({path:root+'/driver-failure.png'}).catch(()=>{});throw error}finally{await browser.close()}
