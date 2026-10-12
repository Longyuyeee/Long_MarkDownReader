import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-graph-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:480,height:800}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/graph-redesign-browser.html')
 await page.locator('.graph-container canvas').first().waitFor()
 await page.screenshot({path:output+(process.env.BEFORE?'/00-before.png':'/01-narrow.png'),animations:'disabled'})
 if(!process.env.BEFORE){
  const search=page.getByPlaceholder('搜索节点')
  await search.fill('项目任务3');await search.press('Enter')
  await page.locator('.node-details').waitFor()
  assert.match(await page.locator('.node-details').innerText(),/项目任务3/)
  await page.screenshot({path:output+'/02-search.png',animations:'disabled'})
  await page.getByTestId('graph-tools-entry').click()
  await page.getByTestId('graph-tools-menu').waitFor()
  assert.ok(await page.getByTestId('graph-export-svg').isVisible())
  await page.screenshot({path:output+'/03-tools.png',animations:'disabled'})
  assert.deepEqual(errors,[])
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Narrow search and Enter selection','Node details','Tools/export entries'],scope:'Production GraphView, 12-node fixture; no export/native writes or large graph performance acceptance',errors},null,2)+'\n')
  console.log('Graph layout checks passed')
 }
}finally{await browser.close()}
