import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-canvas-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:800,height:420}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/canvas-redesign-browser.html')
 await page.locator('.canvas-node').first().waitFor()
 await page.locator('.canvas-edge text').first().click()
 await page.locator('.edge-inspector').waitFor()
 await page.screenshot({path:output+(process.env.BEFORE?'/00-before.png':'/01-short.png'),animations:'disabled'})
 if(process.env.BEFORE)process.exitCode=0
 else{
  const panel=await page.locator('.edge-inspector').boundingBox(),viewport=await page.locator('.canvas-viewport').boundingBox()
  assert.ok(panel.y+panel.height<=viewport.y+viewport.height,'Inspector must fit the canvas')
  const label=page.getByPlaceholder('例如：支持、依赖于…')
  await label.fill('需要确认');await label.press('Tab')
  await page.getByTitle('撤销 Ctrl+Z',{exact:true}).click()
  await page.locator('.canvas-edge text').first().click()
  assert.equal(await label.inputValue(),'下一步')
  await page.getByTitle('重做 Ctrl+Shift+Z',{exact:true}).click()
  await page.locator('.canvas-edge text').first().click()
  assert.equal(await label.inputValue(),'需要确认')
  await page.locator('.edge-inspector input[type=color]').scrollIntoViewIfNeeded()
  await page.screenshot({path:output+'/02-scroll.png',animations:'disabled'})
  await page.setViewportSize({width:480,height:800})
  await page.screenshot({path:output+'/03-narrow.png',animations:'disabled'})
  assert.deepEqual(errors,[])
  assert.equal(await page.evaluate(()=>window.canvasAudit.calls.filter(c=>c.command.startsWith('write_')).length),0)
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Short inspector bounds','Relation editing and undo/redo','Scroll to color control','Narrow viewport'],scope:'Production CanvasView; native IPC mocked; no native save acceptance',errors},null,2)+'\n')
  console.log('Canvas layout checks passed')
 }
}finally{await browser.close()}
