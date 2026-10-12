import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-drawio-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:480,height:800}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/drawio-redesign-browser.html')
 await page.locator('.cell').first().waitFor()
 await page.screenshot({path:output+(process.env.BEFORE?'/00-before.png':'/01-narrow.png'),animations:'disabled'})
 if(!process.env.BEFORE){
  await page.locator('.pages-pane > button').nth(1).click()
  assert.equal(await page.locator('.canvas-toolbar strong').innerText(),'交付')
  await page.locator('.cell').first().click()
  const label=page.locator('.properties textarea')
  await label.fill('待审核');assert.equal(await label.inputValue(),'待审核')
  await page.getByRole('button',{name:'应用修改',exact:true}).scrollIntoViewIfNeeded()
  await page.screenshot({path:output+'/02-properties.png',animations:'disabled'})
  await page.setViewportSize({width:1280,height:800})
  await page.screenshot({path:output+'/03-wide.png',animations:'disabled'})
  assert.deepEqual(errors,[])
  assert.equal(await page.evaluate(()=>window.drawioAudit.calls.filter(c=>c.command.startsWith('write_')||c.command==='transform_drawio_cell_source').length),0)
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Long filename narrow toolbar','Page switching','Node selection','Property input and apply entry reachable'],scope:'Production DrawioEditorView; native read/analysis mocked; no transform/save acceptance',errors},null,2)+'\n')
  console.log('Drawio layout checks passed')
 }
}finally{await browser.close()}
