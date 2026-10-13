import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-mindmap-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try {
 const page=await browser.newPage({viewport:{width:480,height:800}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/mindmap-redesign-browser.html')
 await page.locator('.map-node').first().click()
 const note=page.getByPlaceholder('补充描述、上下文或行动说明')
 await note.fill('用户补充的行动说明');await note.press('Tab')
 assert.ok(await page.getByTitle('保存',{exact:true}).isEnabled())
 await page.getByTitle('撤销',{exact:true}).click()
 assert.equal(await note.inputValue(),'用户备注')
 await page.getByTitle('重做',{exact:true}).click()
 assert.equal(await note.inputValue(),'用户补充的行动说明')
 await page.screenshot({path:output+'/01-map-narrow.png',animations:'disabled'})
 await page.getByRole('button',{name:'树形大纲',exact:true}).click()
 await page.locator('.outline-row').first().waitFor()
 assert.ok(await note.isVisible())
 await page.screenshot({path:output+'/02-outline-narrow.png',animations:'disabled'})
 await page.setViewportSize({width:1280,height:800})
 await page.getByRole('button',{name:'思维导图',exact:true}).click()
 await page.screenshot({path:output+'/03-wide.png',animations:'disabled'})
 assert.deepEqual(errors,[])
 assert.equal(await page.evaluate(()=>window.mindmapAudit.calls.filter(c=>c.command.startsWith('write_')).length),0)
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Narrow note editing','Undo redo','Outline/map switching','Wide page'],scope:'Actual MindMapView; native read mocked, no native writes or drag acceptance',errors},null,2)+'\n')
 console.log('Mindmap layout checks passed')
}finally{await browser.close()}
