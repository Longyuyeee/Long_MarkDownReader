import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_V1113_NOTICE_OUTPUT||'docs/evidence/v1113-notice-ui';fs.mkdirSync(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),checks=[],errors=[],geometry=[]
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000)
try{
 for(const [name,id,sha,text]of [['legacy','annotation-0','', '旧引用没有内容摘要'],['deleted','missing','a'.repeat(64),'批注不存在或已被删除']]){
  await page.goto('http://127.0.0.1:9022/scripts/fixtures/v1113-pdf-notes-browser.html')
  await page.getByRole('tab',{name:/批注 240/}).waitFor()
  await page.evaluate(({id,sha})=>pdfNotesAudit.router.push('/pdf?path=C:/pdf-fixture/Paper.pdf&page=1&annotation='+id+(sha?'&sourceDigest='+sha:'')),{id,sha})
  const notice=page.locator('.annotation-alert').filter({hasText:text});await notice.waitFor({state:'attached'})
  const bounds=await notice.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.annotation-panel').getBoundingClientRect();return {top:r.top,bottom:r.bottom,parentTop:p.top,parentBottom:p.bottom,visible:r.top>=p.top&&r.bottom<=p.bottom}})
  geometry.push({name,...bounds});await page.screenshot({path:output+'/'+name+'.png'})
  assert.equal(bounds.visible,true,'Reference warning must actually be in the viewport, not merely somewhere in the DOM')
  checks.push(name+' source notice is visible above the long annotation list')
 }
 await page.goto('http://127.0.0.1:9022/scripts/fixtures/v1113-pdf-notes-browser.html');await page.getByRole('tab',{name:/批注 240/}).waitFor()
 await page.evaluate(()=>{pdfNotesAudit.annotationError='批注记录损坏，不能写回';return pdfNotesAudit.router.push('/pdf?path=C:/pdf-fixture/Paper.pdf&sourceDigest='+'a'.repeat(64))})
 await page.getByRole('alert').filter({hasText:'批注记录损坏'}).waitFor();assert.equal(await page.getByText('选择正文后添加高亮，或启用“区域批注”框选页面。',{exact:true}).count(),0)
 assert.ok(await page.locator('.page-shell canvas').count()>0);await page.screenshot({path:output+'/damaged-sidecar.png'});checks.push('damaged sidecar remains a visible read-only error, not a false empty-annotation hint')
 assert.deepEqual(errors,[]);fs.writeFileSync(output+'/results.json',JSON.stringify({status:'passed',checks,geometry,errors,nativeBridgeMocked:true,scope:'actual PdfView at 240 annotations; simulated IPC, not native proof'},null,2)+'\n')
}catch(error){fs.writeFileSync(output+'/results.json',JSON.stringify({status:'failed',checks,geometry,errors,nativeBridgeMocked:true,failure:String(error.stack||error)},null,2)+'\n');throw error}finally{await browser.close()}
