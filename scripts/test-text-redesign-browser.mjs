import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-text-redesign'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[],checks=[]
try{
 for(const html of [false,true]){
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/text-redesign-browser.html'+(html?'?html':''))
  await page.locator('.cm-editor').waitFor()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText(html?'\n<p>用户新增内容</p>':'\n用户新增内容')
  await page.getByText(/未保存/,{exact:false}).first().waitFor()
  await page.getByTitle('撤销',{exact:true}).click()
  await page.getByTitle('重做',{exact:true}).click()
  assert.ok((await page.locator('.cm-content').innerText()).includes('用户新增内容'))
  await page.getByTitle('查找与替换',{exact:true}).click()
  await page.locator('.cm-search').waitFor()
  await page.locator('.cm-search input').first().fill('用户')
  await page.keyboard.press('Escape')
  await page.screenshot({path:output+`/01-${html?'html':'text'}-wide.png`})
  await page.evaluate(()=>document.querySelector('#app').style.width='480px')
  const bar=page.getByRole('region',{name:'文本保存策略'})
  // Native section has an accessible region name; every label remains visible.
  for(const name of ['读取','保存','BOM','换行'])assert.ok(await bar.locator('label').filter({hasText:name}).first().isVisible())
  assert.ok(await page.locator('.document-title strong').isVisible())
  await page.screenshot({path:output+`/02-${html?'html':'text'}-480.png`})
  if(html){
   await page.getByRole('button',{name:'安全预览',exact:true}).click()
   await page.frameLocator('iframe').getByText('用户新增内容',{exact:true}).waitFor()
   assert.equal(await page.locator('iframe').getAttribute('sandbox'),'')
   assert.ok(await page.getByText('脚本、内联事件、嵌入页面、表单提交和外部资源已隔离。',{exact:true}).isVisible())
   await page.screenshot({path:output+'/03-html-preview.png'})
   await page.getByRole('button',{name:'源码',exact:true}).click()
   assert.ok((await page.locator('.cm-content').innerText()).includes('用户新增内容'))
  }
  assert.equal(await page.evaluate(()=>window.textAudit.calls.filter(c=>c.command.startsWith('write_')).length),0)
  checks.push(html?'HTML source/preview preserves draft; sandbox and narrow security notice retained':'Text input, undo/redo, find and narrow encoding controls retained')
  await page.close()
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks,errors,scope:'Actual TextEditorView and CodeMirror; native read mocked, no native write tested',releaseCandidate:false},null,2)+'\n')
 console.log(checks.join('\n'))
}finally{await browser.close()}
