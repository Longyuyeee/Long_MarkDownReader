import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-pdf-panel-drafts';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:900,height:700}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/pdf-redesign-browser.html')
 await page.locator('.page-shell canvas').first().waitFor()
 await page.getByRole('navigation',{name:'PDF 工具分组'}).getByRole('button',{name:'文档工具',exact:true}).click()
 const tools=page.locator('.toolbar-actions')
 const metadata=()=>tools.getByTitle('编辑 PDF 标题、作者、主题和关键词并可靠另存',{exact:true}).click()
 const watermark=()=>tools.getByTitle('为全部页面添加文字水印并可靠另存',{exact:true}).click()
 await metadata();await page.getByText(/测试场景：属性读取失败，请重试/).waitFor()
 await page.getByLabel('PDF 文档标题',{exact:true}).fill('用户正在编辑的标题')
 await watermark();await page.getByLabel('PDF 水印文字',{exact:true}).fill('内部评审')
 await page.evaluate(()=>window.pdfAudit.metadataRecovery=true)
 await metadata()
 await page.getByText('当前 PDF 不能安全编辑属性',{exact:true}).waitFor()
 assert.equal(await page.getByLabel('PDF 文档标题',{exact:true}).inputValue(),'用户正在编辑的标题','Reopening after read failure must not discard an existing draft')
 await page.screenshot({path:output+'/01-metadata-draft.png',animations:'disabled'})
 await watermark();assert.equal(await page.getByLabel('PDF 水印文字',{exact:true}).inputValue(),'内部评审')
 await page.setViewportSize({width:480,height:700})
 await page.getByRole('button',{name:'生成并验证水印副本',exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:output+'/02-watermark-narrow.png',animations:'disabled'})
 assert.deepEqual(errors,[])
 assert.equal(await page.evaluate(()=>window.pdfAudit.calls.filter(c=>c.command.startsWith('save_pdf')).length),0)
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Metadata failure draft retained after retry','Watermark draft retained across panels','Narrow preview action reachable'],scope:'Real PDF.js and panels; metadata IPC simulated, no PDF output acceptance',errors},null,2)+'\n')
 console.log('PDF panel drafts checks passed')
}finally{await browser.close()}
