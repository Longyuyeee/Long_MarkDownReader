import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-workbook-linked-layout'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try {
 const page=await browser.newPage({viewport:{width:480,height:400}})
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html?linkedLayout')
 await page.getByTitle('更多工作簿操作').click()
 await page.getByText('透视表与数据连接 (3)',{exact:true}).click()
 const modal=page.locator('.linked-data-modal')
 await modal.waitFor()
 const bounds=await modal.boundingBox()
 assert.ok(bounds.width<=448 && bounds.height<=368)
 await page.screenshot({path:output+'/01-short.png',animations:'disabled'})
 await modal.getByText('交付汇总',{exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:output+'/02-pivot.png',animations:'disabled'})
 await modal.getByText('交付数据来源',{exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:output+'/03-connections.png',animations:'disabled'})
 await modal.getByRole('button',{name:'定位工作表',exact:true}).click()
 await page.getByText('第二张表的客户清单',{exact:true}).waitFor()
 await modal.waitFor({state:'hidden'})
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Short modal dimensions','Pivot and connection sections scroll into view','Navigate linked worksheet'],errors,scope:'Actual WorkbookView with mocked linked-data summaries; no external access, rebuild or native write acceptance',releaseCandidate:false},null,2)+'\n')
 console.log('Linked-data layout checks passed')
} finally {await browser.close()}
