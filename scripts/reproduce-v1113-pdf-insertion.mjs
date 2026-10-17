import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1113-baseline';fs.mkdirSync(output,{recursive:true})
const browser=await chromium.launch({headless:true}),results=[]
try{for(const scenario of ['unsaved','typing','external','target-switch']){
 const page=await browser.newPage({viewport:{width:1280,height:900}})
 await page.goto('http://127.0.0.1:9022/scripts/fixtures/v1113-pdf-notes-browser.html')
 await page.locator('.page-shell canvas').first().waitFor()
 await page.getByRole('tab',{name:/批注 240/}).click()
 await page.locator('.annotation-card').first().click()
 await page.evaluate(()=>{window.pdfNotesAudit.store.activeTabId='note'})
 await page.evaluate(()=>{window.pdfNotesAudit.delay=500})
 await page.getByRole('button',{name:'插入到 笔记.md',exact:true}).click()
 if(scenario==='typing')await page.evaluate(()=>{window.pdfNotesAudit.store.tabs[0].content+='\n生成期间继续输入'})
 if(scenario==='external')await page.evaluate(()=>{window.pdfNotesAudit.disk='外部程序的新内容'})
 if(scenario==='target-switch')await page.evaluate(()=>{window.pdfNotesAudit.store.activeTabId=null})
 await page.getByTestId('draft-target').waitFor({state:'attached'})
 const observed=await page.evaluate(()=>({disk:window.pdfNotesAudit.disk,draft:window.pdfNotesAudit.store.tabs[0].content,writes:window.pdfNotesAudit.calls.filter(c=>c.command==='write_markdown_file')}))
 assert.equal(observed.writes.length,1,'Baseline repro must actually observe the old disk write')
 results.push({scenario,...observed});await page.screenshot({path:output+'/'+scenario+'.png'});await page.close()
}fs.writeFileSync(output+'/results.json',JSON.stringify({scope:'Actual original PdfView + Pinia, simulated IPC; confirms UI calls a disk-write command, not a native-disk test',findings:results},null,2)+'\n');console.log(JSON.stringify(results))}finally{await browser.close()}
