import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-xml-redesign'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try {
 for(const svg of [false,true]) {
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/xml-redesign-browser.html'+(svg?'?svg':''))
  await page.locator('.outline button').first().waitFor()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('\n<!-- 用户备注 -->')
  const draft=await page.locator('.cm-content').innerText()
  assert.ok(await page.getByRole('button',{name:'保存',exact:true}).isEnabled())
  await page.getByTitle('查找',{exact:true}).click()
  await page.locator('.cm-search').waitFor()
  await page.keyboard.press('Escape')
  if(svg) {
   await page.waitForFunction(()=>document.querySelector('.svg-preview img')?.naturalWidth>0)
   assert.ok(await page.getByText('仅渲染安全白名单子集，不加载外部资源',{exact:true}).isVisible())
  }
  await page.screenshot({path:output+`/01-${svg?'svg':'xml'}-wide.png`,animations:'disabled'})
  for(const narrowWindow of [false,true]) {
   if(narrowWindow) {
    await page.setViewportSize({width:480,height:900})
    await page.locator('.inspector').waitFor({state:'hidden'})
   } else await page.evaluate(()=>document.querySelector('#app').style.width='480px')
   const toggle=page.getByRole('button',{name:'元素与问题',exact:true})
   if(await toggle.getAttribute('aria-pressed')==='false')await toggle.click()
   const source=await page.locator('.source').boundingBox(),inspector=await page.locator('.inspector').boundingBox()
   assert.ok(source.width>450 && source.height>200)
   assert.ok(inspector.y>=source.y+source.height-1)
   assert.ok((await page.locator('.workspace-tabs').boundingBox()).height<=35)
   await page.getByTitle('折叠全部',{exact:true}).click()
   await page.getByTitle('展开全部',{exact:true}).click()
   await page.getByPlaceholder('筛选元素、路径或属性').fill(svg?'rect':'title')
   assert.equal(await page.locator('.outline button').count(),1)
   await page.locator('.outline button').click()
   assert.ok(await page.locator('.cm-content').isVisible())
   assert.equal(await page.locator('.cm-content').innerText(),draft)
   await page.screenshot({path:output+`/02-${svg?'svg':'xml'}-${narrowWindow?'window':'container'}.png`,animations:'disabled'})
   await toggle.click()
   assert.equal(await page.locator('.inspector').isVisible(),false)
   assert.equal(await page.locator('.cm-content').innerText(),draft)
   await toggle.click()
  }
  assert.equal(await page.evaluate(()=>window.xmlAudit.calls.filter(c=>c.command.startsWith('write_')).length),0)
  await page.close()
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['XML and SVG draft/search/folding','Container and viewport 480px source retained','Element filtering and source navigation','Inspector toggle preserves draft','SVG sanitized fixture preview displayed'],errors,scope:'Actual XmlEditorView and CodeMirror; native read/analysis and sanitized SVG response mocked; no native save or sanitization acceptance',releaseCandidate:false},null,2)+'\n')
 console.log('XML/SVG page checks passed')
} finally {await browser.close()}
