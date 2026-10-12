import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-capabilities-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/capabilities-redesign-browser.html')
 const search=page.getByPlaceholder('搜索格式或扩展名')
 await search.fill('PDF');await page.locator('.matrix-row').first().waitFor()
 await page.screenshot({path:output+(process.env.BEFORE?'/00-before.png':'/01-narrow.png'),animations:'disabled'})
 if(!process.env.BEFORE){
  await page.locator('.matrix-row summary').first().click()
  await page.getByText('源文件策略',{exact:true}).waitFor()
  assert.ok(await page.locator('.save-mode').first().isVisible())
  await page.screenshot({path:output+'/02-detail.png',animations:'disabled'})
  await search.fill('不存在的格式xyz')
  assert.equal(await page.locator('.matrix-row').count(),0)
  await search.fill('');assert.ok(await page.locator('.matrix-row').count()>30)
  assert.deepEqual(errors,[])
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Narrow content container','Search and empty results','Format detail','Save boundary visible'],scope:'Actual capability registry; native default-app read intentionally fails; no registration mutations',errors},null,2)+'\n')
  console.log('Capabilities page checks passed')
 }
}finally{await browser.close()}
