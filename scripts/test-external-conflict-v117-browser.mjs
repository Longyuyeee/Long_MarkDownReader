import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output=(process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY || 'docs/evidence/v117-save-history-development')+'/external'
const baseUrl=process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9000'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}), checks=[],errors=[]
try{
  for(const text of [false,true]){
    const page=await browser.newPage({viewport:{width:1100,height:800}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
    await page.goto(new URL('/scripts/fixtures/external-conflict-v117-browser.html'+(text?'?text=1':''),baseUrl).href)
    const editor=page.locator(text?'.cm-content':'.vditor-wysiwyg pre').first();await editor.waitFor();await page.waitForFunction(()=>document.body.textContent.includes('original external'))
    await editor.click();await page.keyboard.press('Control+End');await page.keyboard.type('\nunsaved external draft')
    await page.evaluate(()=>{window.externalAudit.disk='external latest disk\n'})
    await page.getByRole('button',{name:'保存',exact:true}).click()
    const modal=page.locator('.text-conflict-dialog');await modal.waitFor()
    assert.match(await modal.innerText(),/同目录副本/)
    await page.evaluate(()=>{window.externalAudit.failProtection=true})
    await modal.getByRole('button',{name:'使用磁盘版本',exact:true}).click();await modal.getByRole('alert').filter({hasText:'草稿保护写入失败'}).waitFor()
    assert.match(await editor.innerText(),/unsaved external draft/)
    await page.evaluate(()=>{window.externalAudit.failProtection=false})
    await modal.getByRole('button',{name:'使用磁盘版本',exact:true}).click();await modal.waitFor({state:'hidden'})
    await page.waitForFunction(()=>document.querySelector('.cm-content,.vditor-wysiwyg').textContent.includes('external latest disk'))
    assert.match(await page.evaluate(()=>window.externalAudit.copies[0].content),/unsaved external draft/)
    assert.equal(await page.evaluate(()=>window.externalAudit.disk),'external latest disk\n')
    assert.ok(await page.evaluate(()=>window.externalAudit.calls.filter(c=>c.command==='write_external_text_document').every(c=>!!c.args.expectedSignature)))
    await page.screenshot({path:`${output}/${text?'text':'markdown'}-protected.png`})
    checks.push((text?'TXT':'Markdown')+' external conflict uses signature checks; failed protection retains draft; explicit reload keeps a discoverable copy and never overwrites original disk')
    await page.close()
  }
  assert.deepEqual(errors,[]);await fs.writeFile(output+'/report.json',JSON.stringify({scope:'Actual external Vue editors with simulated IPC; native copy/protection tested separately',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks:checks.length,errors:errors.length}))
}catch(error){await browser.contexts()[0]?.pages()[0]?.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error}finally{await browser.close()}
