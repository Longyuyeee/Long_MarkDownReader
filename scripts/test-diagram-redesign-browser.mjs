import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-diagram-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:480,height:800}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/diagram-redesign-browser.html')
 await page.locator('.preview-panel svg').waitFor()
 await page.screenshot({path:output+(process.env.BEFORE?'/00-before.png':'/01-narrow.png'),animations:'disabled'})
 if(!process.env.BEFORE){
  assert.ok(await page.locator('.studio-actions label').nth(1).isVisible())
  await page.getByTitle('放大',{exact:true}).click()
  assert.equal(await page.locator('.zoom-value').innerText(),'110%')
  await page.getByRole('button',{name:'刷新预览',exact:true}).click()
  await page.locator('.structure-list button').first().click()
  assert.ok(await page.locator('.property-form input').isVisible())
  await page.getByRole('button',{name:'结构',exact:true}).click()
  await page.getByRole('textbox',{name:'Mermaid 源码',exact:true}).fill('flowchart LR\n A[用户确认] --> B[检查文档]')
  assert.match(await page.getByRole('textbox',{name:'Mermaid 源码',exact:true}).inputValue(),/用户确认/)
  await page.getByTitle('撤销',{exact:true}).click()
  assert.match(await page.getByRole('textbox',{name:'Mermaid 源码',exact:true}).inputValue(),/开始/)
  await page.getByTitle('重做',{exact:true}).click()
  assert.match(await page.getByRole('textbox',{name:'Mermaid 源码',exact:true}).inputValue(),/用户确认/)
  await page.getByRole('button',{name:'导出',exact:true}).click()
  await page.locator('.export-panel select').first().selectOption('png')
  await page.setViewportSize({width:800,height:420})
  await page.locator('.export-confirm').scrollIntoViewIfNeeded()
  const panel=await page.locator('.export-panel').boundingBox()
  assert.ok(panel.y>=0&&panel.y+panel.height<=420,'Export panel fits short window')
  await page.screenshot({path:output+'/02-short-export.png',animations:'disabled'})
  await page.getByRole('dialog',{name:'导出图表'}).getByTitle('关闭',{exact:true}).click()
  await page.setViewportSize({width:1280,height:800})
  await page.screenshot({path:output+'/03-wide.png',animations:'disabled'})
  assert.deepEqual(errors,[])
  assert.equal(await page.evaluate(()=>window.diagramAudit.calls.filter(c=>c.command.startsWith('write_')).length),0)
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Narrow full tools','Zoom','Structure field reachable','Source edit undo redo','Short export settings'],scope:'Production DiagramStudio and Mermaid render; native read/analysis mocked; no structure mutation or export/save output acceptance',errors},null,2)+'\n')
  console.log('Diagram layout checks passed')
 }
}finally{await browser.close()}
