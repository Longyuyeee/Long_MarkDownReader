// Actual Vue and production wheel navigation; simulated fixture IPC, not native acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022',output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1119-toolbar-browser'
await fs.mkdir(output);const browser=await chromium.launch(),checks=[],errors=[]
try{
 const page=await browser.newPage({viewport:{width:555,height:800},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(String(e)))
 await page.goto(base+'/scripts/fixtures/v1119-organizing-browser.html?mode=canvas&runtime=1');await page.locator('.canvas-node textarea').first().waitFor()
 const cdp=await page.context().newCDPSession(page),send=(method,args)=>cdp.send(method,args),evaluate=expression=>page.evaluate(expression),ui=nativeUserInput({send,evaluate})
 const source=await fs.readFile('scripts/lib/installed-v1-1-19-workflow.mjs','utf8'),start=source.indexOf('const canvasTool=async'),end=source.indexOf('\n const save=',start);assert.ok(start>0&&end>start)
 const tool=new Function('assert','q','send','evaluate','ui',source.slice(start,end)+';return canvasTool')(assert,JSON.stringify,send,evaluate,ui)
 await page.evaluate(()=>{const file=organizingAudit.files['C:/ui/A.canvas'],model=JSON.parse(file.content);model.nodes=[{id:'g',type:'group',label:'资料分组',x:-30,y:-50,width:320,height:270},model.nodes[0],{id:'f',type:'file',file:'B.opml',x:420,y:0,width:260,height:160}];file.content=JSON.stringify(model);file.signature+='-group-fixture'})
 await tool('[title="重新读取，未保存时先确认"],[data-app-tooltip="重新读取，未保存时先确认"]')
 await ui.fill('.canvas-node textarea','窄窗草稿');assert.equal(await page.locator('.save-state').innerText(),'有未保存修改')
 assert.equal(await page.locator('[title="重新读取，未保存时先确认"]').count(),0);assert.equal(await page.locator('[data-app-tooltip="重新读取，未保存时先确认"]').count(),1)
 await tool('[title="重新读取，未保存时先确认"],[data-app-tooltip="重新读取，未保存时先确认"]');await ui.clickText('.n-dialog button','取消');await ui.waitFor('!document.querySelector(".n-dialog")','cancel dialog faded');assert.equal(await page.locator('.canvas-node textarea').first().inputValue(),'窄窗草稿');checks.push('actual-narrow-toolbar-wheel-reload-cancel-keeps-draft-with-tooltip-adoption')
 await tool('.canvas-toolbar button','适应内容');await tool('[title="撤销 Ctrl+Z"],[data-app-tooltip="撤销 Ctrl+Z"]');assert.equal(await page.locator('.canvas-node textarea').first().inputValue(),'A');checks.push('actual-wheel-in-both-directions-reaches-fit-and-undo-with-tooltip-adoption')
 const point=await evaluate(`(()=>{const e=document.querySelector('.node-group'),r=e.getBoundingClientRect(),label=e.querySelector('input').getBoundingClientRect(),x=(r.left+label.left)/2,y=(r.top+label.top)/2,hit=document.elementFromPoint(x,y);return {x,y,background:hit?.closest('.node-group')===e&&!hit.closest('input,textarea,button')}})()`);assert.equal(point.background,true)
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+70,y:point.y+45,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+70,y:point.y+45,button:'left',clickCount:1})
 const moved=await evaluate(`Array.from(document.querySelectorAll('.node-group,.node-text'),e=>({group:e.classList.contains('node-group'),x:parseFloat(e.style.left),y:parseFloat(e.style.top)}))`),g=moved.find(n=>n.group),a=moved.find(n=>!n.group);assert.ok(Math.hypot(a.x,a.y)>3);assert.equal(g.x+30,a.x);assert.equal(g.y+50,a.y);checks.push('actual-zoomed-out-group-background-drag-moves-contained-card')
 await page.screenshot({path:output+'/narrow-toolbar.png'});assert.deepEqual(errors,[]);await fs.writeFile(output+'/report.json',JSON.stringify({nativeBridgeMocked:true,desktopInputUsed:false,reducedMotion:'no-preference',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks,errors}))
}catch(error){await fs.writeFile(output+'/failure.txt',String(error.stack||error));throw error}finally{await browser.close()}
