import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-media-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:480,height:800}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/media-redesign-browser.html')
 await page.getByTestId('image-edit-toggle').click()
 await page.getByTestId('image-save-copy').waitFor()
 await page.screenshot({path:output+(process.env.BEFORE?'/00-before.png':'/01-narrow.png'),animations:'disabled'})
 if(!process.env.BEFORE){
  assert.ok(await page.locator('.media-status > span').isVisible(),'Source safety notice retained')
  await page.getByTitle('水平翻转',{exact:true}).click()
  assert.match(await page.getByTitle('水平翻转',{exact:true}).getAttribute('class'),/active/)
  await page.locator('#image-output-format').selectOption('jpg')
  await page.getByTestId('image-save-copy').scrollIntoViewIfNeeded()
  assert.ok(await page.getByTestId('image-save-copy').isEnabled())
  await page.screenshot({path:output+'/02-copy-settings.png',animations:'disabled'})
  await page.getByRole('button',{name:'重置',exact:true}).click()
  assert.doesNotMatch(await page.getByTitle('水平翻转',{exact:true}).getAttribute('class')||'',/active/)
  await page.getByTitle('关闭编辑面板',{exact:true}).click()
  assert.equal(await page.getByTestId('image-editor-panel').count(),0)
  assert.deepEqual(errors,[])
  assert.equal(await page.evaluate(()=>window.mediaAudit.calls.filter(c=>c.command.startsWith('save_image')).length),0)
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Image loads','Source safety notice','Flip and reset','Copy format/quality settings','Close editor'],scope:'Production image view with public icon asset; native inspect mocked; no copy-save/video acceptance',errors},null,2)+'\n')
  console.log('Media layout checks passed')
 }
}finally{await browser.close()}
