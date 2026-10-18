// Real page gestures; fixture IPC only. Not installed/native file evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022',output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1119-gestures'
await fs.mkdir(output);const browser=await chromium.launch(),checks=[],errors=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(String(e)))
 await page.goto(base+'/scripts/fixtures/v1119-organizing-browser.html?mode=canvas');await page.locator('.canvas-node textarea').first().waitFor()
 await page.evaluate(()=>{const file=organizingAudit.files['C:/ui/A.canvas'],canvas=JSON.parse(file.content);canvas.nodes.unshift({id:'g',type:'group',label:'资料分组',x:-30,y:-50,width:320,height:270});file.content=JSON.stringify(canvas)})
 await page.getByTitle('重新读取，未保存时先确认',{exact:true}).click();await page.locator('.node-group').waitFor()
 const position=()=>page.locator('.node-group,.node-text').evaluateAll(nodes=>nodes.map(e=>({group:e.classList.contains('node-group'),x:parseFloat(e.style.left),y:parseFloat(e.style.top)}))),before=await position(),box=await page.locator('.node-group').boundingBox(),point={x:box.x+12,y:box.y+12}
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+1,point.y+1);await page.mouse.up();assert.equal(await page.locator('.save-state').innerText(),'已保存');checks.push('one-css-pixel-jitter-does-not-dirty')
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+70,point.y+45,{steps:4});await page.mouse.up();const after=await position(),dx=after.find(n=>n.group).x-before.find(n=>n.group).x,dy=after.find(n=>n.group).y-before.find(n=>n.group).y;assert.ok(Math.hypot(dx,dy)>3);const textBefore=before.find(n=>!n.group),textAfter=after.find(n=>!n.group);assert.equal(textAfter.x-textBefore.x,dx);assert.equal(textAfter.y-textBefore.y,dy);checks.push('contained-card-moves-with-group')
 await page.getByTitle('撤销 Ctrl+Z',{exact:true}).click();assert.deepEqual(await position(),before);await page.getByTitle('重做 Ctrl+Shift+Z',{exact:true}).click();assert.deepEqual(await position(),after);checks.push('group-undo-redo-restores-all-coordinates')
 await page.locator('.canvas-toolbar button.primary').click();await page.waitForTimeout(120);await page.getByTitle('适应内容',{exact:true}).count().then(async count=>{if(count)await page.getByTitle('适应内容',{exact:true}).click();else await page.getByRole('button',{name:'适应内容',exact:true}).click()})
 await page.setViewportSize({width:760,height:640});await page.waitForTimeout(150);assert.equal(await page.locator('.node-text').first().evaluate(e=>{const r=e.getBoundingClientRect(),v=e.closest('.canvas-viewport').getBoundingClientRect();return r.right>v.left&&r.left<v.right&&r.bottom>v.top&&r.top<v.bottom}),true);checks.push('canvas-resize-keeps-content-in-view');await page.screenshot({path:output+'/canvas-group-narrow.png'})
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/report.json',JSON.stringify({nativeBridgeMocked:true,desktopInputUsed:false,reducedMotion:'no-preference',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks,errors}))
}finally{await browser.close()}
