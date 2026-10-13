import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-odf-redesign'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 for(const format of ['ods','odp']){
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/odf-redesign-browser.html?format='+format)
  await page.locator('.odf-workspace footer').waitFor()
  const save=page.getByRole('button',{name:format==='ods'?'另存 ODS 副本':'可靠另存 ODP 副本',exact:true})
  assert.equal(await save.isDisabled(),true)
  if(format==='ods'){
   await page.locator('td').first().dblclick()
   await page.getByTestId('m1cb-ods-cell-editor').fill('完成用户场景验收')
  }else{
   await page.locator('.odp-target-list button').first().click()
   await page.getByTestId('m5-3-odp-text-editor').fill('改进阅读和记录体验')
  }
  assert.equal(await save.isEnabled(),true)
  assert.equal(await page.getByTestId(format==='ods'?'m1cb-ods-cell-editor':'m5-3-odp-text-editor').inputValue(),format==='ods'?'完成用户场景验收':'改进阅读和记录体验')
  await page.screenshot({path:output+`/01-${format}-wide.png`})
  await page.evaluate(()=>document.querySelector('#app').style.width='480px')
  await page.getByText('另存副本',{exact:true}).waitFor()
  assert.ok(await page.locator('footer > span').isVisible())
  assert.ok(await page.locator('.toolbar').evaluate(el=>el.scrollWidth>=el.clientWidth))
  if(format==='odp')assert.equal(await page.locator('.odp-layout aside').evaluate(el=>getComputedStyle(el).display),'flex')
  await page.screenshot({path:output+`/02-${format}-container-480.png`})
  assert.equal(await save.isEnabled(),true)
  // The original drafts remain in place; no mock save-success is used.
  assert.equal(await page.evaluate(()=>window.odfAudit.calls.filter(c=>/^save_od[sp]_/.test(c.command)).length),0)
  await page.close()
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['ODS value draft enables copy-save','ODP text draft enables copy-save','480px content container preserves draft and status','ODP navigation responds to container width','No native write invoked'],errors,scope:'Actual OdfContentReaderView, mocked native reports; native copy output not tested'},null,2)+'\n')
 console.log('ODS/ODP UI: five checks passed')
}finally{await browser.close()}
