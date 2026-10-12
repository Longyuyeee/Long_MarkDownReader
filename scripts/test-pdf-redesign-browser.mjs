import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
const require=createRequire(import.meta.url)
const { chromium }=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-pdf-redesign'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true})
const checks=[],errors=[]
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}})
 page.setDefaultTimeout(12000)
 page.on('pageerror',error=>errors.push(error.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/pdf-redesign-browser.html')
 await page.locator('.page-shell canvas').first().waitFor()
 await page.getByText('Public record: Account audit remains readable.',{exact:true}).waitFor()
 const tools=page.locator('.toolbar-actions'), nav=page.getByRole('navigation',{name:'PDF 工具分组'})
 await page.getByLabel('跳转到 PDF 页码').fill('2')
 await page.getByLabel('跳转到 PDF 页码').press('Enter')
 assert.equal(await page.getByLabel('跳转到 PDF 页码').inputValue(),'2')
 await page.getByRole('button',{name:'上一页',exact:true}).click()
 assert.equal(await page.getByLabel('跳转到 PDF 页码').inputValue(),'1')
 await tools.getByTitle('放大',{exact:true}).click()
 assert.equal(await tools.locator('.scale-label').innerText(),'110%')
 await tools.getByTitle('恢复 100%',{exact:true}).click()
 await tools.getByTitle('适合宽度',{exact:true}).click()
 assert.equal(await tools.getByTitle('适合宽度',{exact:true}).getAttribute('aria-pressed'),'true')
 await page.getByLabel('搜索 PDF 正文').fill('Public')
 await page.waitForFunction(()=>/[1-9]\d*\s*\/\s*[1-9]\d*/.test(document.querySelector('.pdf-search small')?.textContent||''))
 assert.ok(!/0\s*\/\s*0/.test(await page.locator('.pdf-search small').innerText()))
 await tools.getByTitle('下一个命中',{exact:true}).click()
 await tools.getByTitle('清除搜索',{exact:true}).click()
 checks.push('Real two-page PDF.js rendering, page navigation, zoom/reset/fit and text search')
 await page.screenshot({path:output+'/01-reading.png'})
 await nav.getByRole('button',{name:'批注',exact:true}).click()
 await tools.getByTitle('在页面拖出矩形区域').click()
 assert.equal(await tools.getByTitle('在页面拖出矩形区域').getAttribute('aria-pressed'),'true')
 await tools.getByTitle('在页面拖出矩形区域').click()
 await tools.getByTitle('为当前页添加评论').click()
 await page.getByRole('dialog').getByRole('textbox').fill('需要补充这页的说明。')
 await page.getByRole('dialog').getByRole('button',{name:'添加页评论',exact:true}).click()
 await page.locator('.annotation-editor textarea').waitFor()
 assert.equal(await page.locator('.annotation-card').count(),1)
 checks.push('Annotation group retains area mode and creates editable page comments')
 await nav.getByRole('button',{name:'页面',exact:true}).click()
 await tools.getByTitle('非破坏式页面整理预览').click()
 await page.locator('.page-plan-list').waitFor()
 assert.equal(await page.locator('.page-plan-list article').count(),2)
 checks.push('Page organizer still exposes both source pages')
 await nav.getByRole('button',{name:'文档工具',exact:true}).click()
 for(const [title,selector]of [
  ['检查并填写 PDF 表单副本','.form-inspector'],
  ['编辑 PDF 标题、作者、主题和关键词并可靠另存','.pdf-sidebar.metadata-open'],
  ['永久移除敏感区域并另存图片型副本','.redaction-panel'],
  ['为全部页面添加文字水印并可靠另存','.pdf-sidebar.watermark-open'],
  ['离线识别扫描页','.ocr-panel'],
 ]) {
  await tools.getByTitle(title,{exact:true}).click();await page.locator(selector).waitFor()
  if(selector==='.pdf-sidebar.metadata-open')await page.getByText(/测试场景：属性读取失败，请重试/).waitFor()
 }
 checks.push('All five document tools open their original panels; metadata failure stays visible')
 await page.screenshot({path:output+'/02-document-tools.png'})
 for(const width of [736,480]) {
  await page.setViewportSize({width,height:900})
  await nav.getByRole('button',{name:'阅读',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.toolbar-actions').scrollLeft===0)
  await page.getByTitle('缩略图与目录',{exact:true}).click()
  await tools.getByTitle('适合宽度',{exact:true}).click()
  await tools.getByTitle('恢复 100%',{exact:true}).click()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await nav.getByRole('button',{name:'文档工具',exact:true}).click()
  await tools.getByTitle('离线识别扫描页',{exact:true}).click()
  assert.ok(await tools.getByTitle('离线识别扫描页',{exact:true}).isVisible())
  await page.screenshot({path:output+`/03-narrow-${width}.png`})
 }
 checks.push('736px and 480px: reading tools and last document action remain operable without root overflow')
 await page.setViewportSize({width:1280,height:900})
 await page.evaluate(()=>{document.body.dataset.theme='dark'})
 await page.screenshot({path:output+'/04-dark.png'})
 await page.evaluate(()=>window.pdfAudit.router.push('/pdf?path=C:/pdf-fixture/Paper.pdf&external=1'))
 await page.getByText(/外部文件 · 只读/).waitFor()
 assert.equal(await nav.count(),0)
 assert.equal(await tools.getByTitle('为当前页添加评论').count(),0)
 assert.equal(await page.locator('.sidebar-switch').getByRole('tab').count(),2)
 checks.push('External PDF remains read-only with only thumbnail/outline tabs')
 assert.deepEqual(errors,[])
 const sourceSha256=createHash('sha256').update(await fs.readFile('src/views/PdfView.vue')).digest('hex')
 await fs.writeFile(output+'/results.json',JSON.stringify({sourceSha256,checks,errors,scope:'Actual PdfView + PDF.js; Tauri IPC mocked; not native write/export acceptance',releaseCandidate:false},null,2)+'\n')
 console.log(checks.join('\n'))
}finally{await browser.close()}
