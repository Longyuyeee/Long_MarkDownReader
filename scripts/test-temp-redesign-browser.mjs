import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-temp-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:480,height:800}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/temp-redesign-browser.html')
 await page.locator('.vditor-wysiwyg').getByText('这是独立文件，不应自动写回。',{exact:true}).waitFor()
 await page.screenshot({path:output+(process.env.BEFORE?'/00-before.png':'/01-narrow.png'),animations:'disabled'})
 if(!process.env.BEFORE){
  assert.ok(await page.locator('.save-boundary').isVisible())
  await page.getByRole('button',{name:'大纲',exact:true}).click()
  await page.locator('.temp-sidebar').waitFor()
  await page.getByRole('button',{name:'大纲',exact:true}).click()
  assert.equal(await page.locator('.temp-sidebar').count(),0)
  assert.ok(await page.getByRole('button',{name:'保存',exact:true}).isVisible())
  assert.ok(await page.getByRole('button',{name:'存入知识库',exact:true}).isVisible())
  assert.deepEqual(errors,[])
  assert.equal(await page.evaluate(()=>window.tempAudit.calls.filter(c=>c.command.startsWith('write_')).length),0)
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Actual external Markdown editor','Narrow save notice and actions','Outline hide/show'],scope:'Production TempMode with native read mocked; no write/import acceptance',errors},null,2)+'\n')
  console.log('External Markdown layout checks passed')
 }
}finally{await browser.close()}
