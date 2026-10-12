import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-odt-redesign'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}})
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/odt-redesign-browser.html')
 await page.locator('.odt-page').waitFor()
 await page.locator('.package-summary summary').click()
 await page.getByText('可信包验证通过',{exact:true}).waitFor()
 await page.screenshot({path:output+'/01-wide.png'})
 for(const width of [736,480]){
  await page.setViewportSize({width,height:900})
  await page.getByRole('button',{name:'目录与详情',exact:true}).click()
  await page.getByRole('navigation',{name:'ODT 文档目录'}).getByRole('button').last().click()
  assert.equal(await page.locator('.odt-outline').isVisible(),false)
  await page.getByRole('button',{name:'目录与详情',exact:true}).click()
  await page.screenshot({path:output+`/02-directory-${width}.png`})
  await page.getByRole('button',{name:'关闭目录与详情'}).click()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 }
 await page.getByLabel('搜索 ODT 正文').fill('文档')
 await page.getByLabel('搜索 ODT 正文').press('Enter')
 assert.equal(await page.getByTestId('e1b-odt-search-count').innerText(),'1/1')
 await page.evaluate(()=>window.odtAudit.fail=true)
 await page.getByTitle('重新读取').click()
 await page.getByRole('alert').waitFor()
 await page.evaluate(()=>window.odtAudit.fail=false)
 await page.getByRole('button',{name:'重试',exact:true}).click()
 await page.locator('.odt-page').waitFor()
 await page.getByText('OpenDocument Text · 只读',{exact:true}).waitFor()
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Wide package details','736/480px directory navigation, close and no overflow','Keyboard search','Read failure and retry','Read-only label retained'],errors,scope:'Real OdtReaderView with mocked native read report; not native ODT parsing acceptance'},null,2)+'\n')
 console.log('ODT UI: five checks passed')
}finally{await browser.close()}
