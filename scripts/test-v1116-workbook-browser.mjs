import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9022', output = process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY || 'docs/evidence/v1116-workbook-browser'
await fs.mkdir(output) // Evidence is immutable: a rerun needs a fresh directory.
const browser=await chromium.launch({headless:true}), context=await browser.newContext({viewport:{width:1280,height:860},permissions:['clipboard-read','clipboard-write'],reducedMotion:'no-preference'}),page=await context.newPage()
page.setDefaultTimeout(12000)
const report={status:'running',evidenceLevel:'actual-WorkbookView-real-headless-clipboard-and-input-simulated-native-IPC',nativeBridgeMocked:true,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],layouts:[],errors:[]}
page.on('pageerror',e=>report.errors.push(e.message))
const cell=(row,column)=>page.locator('.sheet-row').nth(row).locator('.workbook-cell').nth(column)
const value=(row,column)=>cell(row,column).locator('.cell-content').textContent()
const open=async(query='')=>{await page.goto(base+'/scripts/fixtures/workbook-save-browser.html?v1116=1'+query);await cell(0,0).waitFor()}
const paste=async(row,column,text)=>{await page.evaluate(text=>navigator.clipboard.writeText(text),text);await cell(row,column).click();await page.keyboard.press('Control+v')}
const wait=async(row,column,text)=>{await page.waitForFunction(({row,column,text})=>document.querySelectorAll('.sheet-row')[row]?.querySelectorAll('.workbook-cell .cell-content')[column]?.textContent===text,{row,column,text})}
const tools=async()=>{await page.locator('.tool-panel-trigger').click();await page.getByText('数据、Table 与规则',{exact:true}).click();await page.waitForTimeout(400)}
const save=async()=>{await page.locator('.workbook-actions .primary').click();await page.waitForFunction(()=>!!workbookAudit.pending);await page.evaluate(()=>workbookAudit.pending());await page.waitForFunction(()=>!workbookAudit.pending&&!document.querySelector('.workbook-actions .primary').textContent.includes('保存中'))}
try{
 await open();await paste(1,0,'"会议\r\n备注"\t可见\t00124\t');await page.waitForFunction(()=>document.querySelector('.workbook-actions .primary')?.textContent.includes('(3)'))
 assert.match(await value(1,0),/^会议\r?\n备注$/);assert.equal(await value(2,0),'不要修改');assert.equal(await value(1,2),'00124');assert.equal(await value(1,3),'')
 await page.keyboard.press('Control+z');await wait(1,2,'00123');assert.equal(await value(1,3),'0.1');await page.keyboard.press('Control+y');await wait(1,2,'00124')
 assert.equal(await page.evaluate(()=>workbookAudit.writes.length),0);report.primaryInputTrace=await page.evaluate(()=>workbookAudit.inputTrace);assert.ok(report.primaryInputTrace.some(event=>event.type==='paste'&&event.trusted&&event.types.includes('text/plain')));await page.screenshot({path:output+'/01-quoted-paste-one-undo.png'});report.checks.push('Quoted multiline, empty trailing cell and identifier paste affect one row only; whole paste undo/redo; no auto-save')
 await save();const edits=await page.evaluate(()=>workbookAudit.writes[0].edits);assert.equal(edits.find(e=>e.column===2).kind,'string');assert.equal(edits.find(e=>e.column===3).kind,'empty');report.requestedEdits=edits
 await open();await cell(4,0).click();await page.keyboard.press('Control+c');await cell(5,0).click();await page.keyboard.press('Control+v');await wait(5,0,'=保留文本')
 await cell(4,3).click();await page.keyboard.press('Control+c');await cell(5,3).click();await page.keyboard.press('Control+v');await page.waitForFunction(()=>workbookAudit.translations?.[0]?.rowDelta===1);await save()
 const typed=await page.evaluate(()=>workbookAudit.writes[0].edits);assert.deepEqual(typed.map(e=>[e.row,e.column,e.kind,e.input]),[[5,0,'string','=保留文本'],[5,3,'formula','=D3+D4']]);report.typedEdits=typed;report.checks.push('Own typed clipboard preserves literal = text and translates actual formula relative references, without guessing from its display')
 await open();await cell(1,0).click();await page.keyboard.press('Control+c');const quoted=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(quoted.startsWith('"会议'));await cell(5,0).click();await page.keyboard.press('Control+v');await page.waitForFunction(()=>document.querySelectorAll('.sheet-row')[5]?.querySelector('.cell-content')?.textContent.includes('旧备注'));report.checks.push('Copied multiline scalar is quoted and pastes back into one cell')
 await open();await tools();await page.getByTitle('排序字段',{exact:true}).selectOption('2');const order=[]
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'下一条',exact:true}).click();order.push(await page.locator('.workbook-cell.selected').first().evaluate(c=>c.closest('.sheet-row').querySelectorAll('.cell-content')[2].textContent))}
 assert.deepEqual(order,['00007','00123','9007199254740993123','9007199254740993124']);report.navigationOrder=order
 await page.getByTitle('筛选字段',{exact:true}).selectOption('1');await page.getByPlaceholder('包含筛选',{exact:true}).fill('可见');const selection=await page.locator('.formula-bar output').textContent()
 await page.getByRole('button',{name:'复制筛选结果',exact:true}).click();await page.getByText('已复制 3 行会话结果和表头；原工作表与选区未改变',{exact:true}).waitFor()
 const result=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(result.startsWith('任务\t状态\t编号\t数值'));assert.ok(!result.includes('不要修改'));assert.ok(result.indexOf('00007')<result.indexOf('00123'));assert.equal(await value(2,0),'不要修改');assert.equal(await page.locator('.formula-bar output').textContent(),selection);assert.equal(await page.evaluate(()=>workbookAudit.writes.length),0);report.resultClipboard=result
 await page.screenshot({path:output+'/02-filtered-result-copy.png'});report.checks.push('Long-ID sort is exact; result copy includes header and only matching rows in sort order, preserving selection, hidden data and source grid')
 await open();await cell(1,3).click();await cell(2,3).click({modifiers:['Shift']});const handle=page.locator('.fill-handle');await handle.waitFor();const from=await handle.boundingBox(),to=await cell(3,3).boundingBox();await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await page.mouse.up();await wait(3,3,'0.3');await page.keyboard.press('Control+z');await wait(3,3,'3');report.checks.push('Actual pointer fill gives 0.1,0.2,0.3 and one undo restores the original target')
 await paste(1,0,'a'.repeat(32768));await page.getByText('单元格超过32767字符，本次未修改',{exact:true}).waitFor();assert.equal(await value(1,0),'会议\r\n旧备注');assert.equal(await value(2,0),'不要修改')
 await paste(1,0,'"未闭合\t字段');await page.getByText('剪贴板中有未闭合引号，本次未修改',{exact:true}).waitFor();assert.equal(await value(1,2),'00123');report.checks.push('Oversized native-cell text and malformed TSV reject whole paste without partial writes')
 for(const style of ['soft','neo','glass','airy','minimal','sharp'])for(const theme of ['white','dark']){
  await open('&theme='+theme+'&dark='+(theme==='dark'?'1':'0'));await page.evaluate(style=>workbookAudit.store.visualStyle=style,style);await tools();await page.getByTitle('筛选字段',{exact:true}).selectOption('1');await page.getByPlaceholder('包含筛选',{exact:true}).fill('可见');await page.screenshot({path:`${output}/style-${style}-${theme}.png`});report.layouts.push({style,theme})
 }
 for(const width of [760,480,360]){await page.setViewportSize({width,height:720});const box=await page.locator('.workbook-actions .primary').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);await page.getByRole('button',{name:'复制筛选结果',exact:true}).click();await page.screenshot({path:`${output}/narrow-${width}.png`});report.layouts.push({width,height:720})}
 assert.deepEqual(report.errors,[]);report.status='passed';console.log('PASS: XLSX actual clipboard, quoted/type/formula/sort/result/fill/bounds and 15 normal-motion layouts; native IPC simulated')
}catch(error){report.status='failed';report.failure=String(error.stack||error);await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error}
finally{await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
