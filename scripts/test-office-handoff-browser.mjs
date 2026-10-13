import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-office-handoff'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[],checks=[]
try{
 for(const legacy of [false,true]){
  const page=await browser.newPage({viewport:{width:900,height:700}})
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/office-handoff-browser.html'+(legacy?'?legacy':''))
  await page.locator('main').waitFor()
  await page.getByRole('button',{name:'使用系统默认应用打开',exact:true}).waitFor()
  assert.equal(await page.getByRole('radio',{name:/WPS Office/}).isDisabled(),true)
  await page.screenshot({path:output+`/01-${legacy?'legacy':'external'}.png`})
  await page.locator('details summary').click()
  assert.equal(await page.locator('.digest dd').innerText(),'a'.repeat(64))
  await page.locator('details summary').click()
  if(legacy){
   const target=page.getByLabel('新的 DOCX 目标')
   await target.fill('C:/ui/我的新副本.docx')
   await page.getByRole('button',{name:'生成副本',exact:true}).click()
   await page.getByRole('alert').getByText(/转换器不可用/).waitFor()
   assert.equal(await target.inputValue(),'C:/ui/我的新副本.docx')
   await page.evaluate(()=>window.officeAudit.blocked=true)
   await page.getByTitle('重新预检',{exact:true}).click()
   assert.equal(await page.getByRole('button',{name:'生成副本',exact:true}).isDisabled(),true)
   await page.getByText('测试场景：加密文件禁止转换',{exact:true}).waitFor()
  }else{
   await page.getByRole('button',{name:'使用系统默认应用打开',exact:true}).click()
   await page.getByText(/外部打开失败：测试场景/).waitFor()
  }
  await page.setViewportSize({width:480,height:640})
  await page.locator('main').evaluate(el=>el.scrollTop=0)
  await page.screenshot({path:output+`/02-${legacy?'legacy':'external'}-480.png`})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.evaluate(()=>window.officeAudit.fail=true)
  await page.getByTitle(legacy?'重新预检':'重新识别',{exact:true}).click()
  await page.getByRole('alert').getByText(/文件暂时不可读/).waitFor()
  await page.evaluate(()=>window.officeAudit.fail=false)
  await page.getByRole('button',{name:'重试',exact:true}).click()
  await page.locator('main').waitFor()
  checks.push(legacy?'Legacy: metadata, failed conversion retains target, blocked conversion, narrow layout and retry':'External: metadata, unavailable app disabled, failed handoff, narrow layout and retry')
  await page.close()
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks,errors,scope:'Actual Office views and ExternalApplicationPanel with mocked IPC; no desktop app launched or native conversion performed',releaseCandidate:false},null,2)+'\n')
 console.log(checks.join('\n'))
}finally{await browser.close()}
