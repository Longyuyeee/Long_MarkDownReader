// Actual LibraryMode/Vditor; native IPC is simulated, not an installed-file proof.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1114-delivery-before'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:850}})
const report={evidenceLevel:'actual-LibraryMode-Vditor-simulated-IPC',checks:[]}
try{
 await page.goto('http://127.0.0.1:9022/scripts/fixtures/library-shell-browser.html')
 await page.locator('#vditor-lib [contenteditable=true]').first().waitFor()
 await page.getByRole('button',{name:'导出',exact:true}).click()
 await page.getByText('导出 PDF',{exact:true}).click()
 await page.getByText('PDF 导出失败',{exact:true}).waitFor()
 report.checks.push('Clicking the real PDF export entry fails immediately; no print dialog is requested')
 await page.screenshot({path:output+'/pdf-failure.png'})
 await page.getByText('PDF 导出失败',{exact:true}).waitFor({state:'hidden'})
 await page.getByRole('button',{name:'导出',exact:true}).click()
 await page.getByText('导出 Markdown',{exact:true}).click()
 await page.waitForFunction(()=>shellAudit.calls.some(c=>c.command==='export_markdown_file'))
 // Fixture throws for unsupported IPC, representing a genuine rejection, not null cancellation.
 await page.waitForTimeout(100)
 assert.equal(await page.locator('.n-message--error').count(),0)
 report.checks.push('The rejected Markdown IPC adds no error feedback; it is swallowed as cancellation')
 report.calls=await page.evaluate(()=>shellAudit.calls.filter(c=>c.command.startsWith('export_')))
 report.status='reproduced'
}finally{await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
