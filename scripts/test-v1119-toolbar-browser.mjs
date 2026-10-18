// Actual Vue and production wheel navigation; simulated fixture IPC, not native acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022',output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1119-toolbar-browser'
await fs.mkdir(output);const browser=await chromium.launch(),checks=[],errors=[]
try{
 const page=await browser.newPage({viewport:{width:555,height:800},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(String(e)))
 await page.goto(base+'/scripts/fixtures/v1119-organizing-browser.html?mode=canvas');await page.locator('.canvas-node textarea').first().waitFor()
 const cdp=await page.context().newCDPSession(page),send=(method,args)=>cdp.send(method,args),evaluate=expression=>page.evaluate(expression),ui=nativeUserInput({send,evaluate})
 const source=await fs.readFile('scripts/lib/installed-v1-1-19-workflow.mjs','utf8'),start=source.indexOf('const canvasTool=async'),end=source.indexOf('\n const save=',start);assert.ok(start>0&&end>start)
 const tool=new Function('assert','q','send','evaluate','ui',source.slice(start,end)+';return canvasTool')(assert,JSON.stringify,send,evaluate,ui)
 await ui.fill('.canvas-node textarea','窄窗草稿');assert.equal(await page.locator('.save-state').innerText(),'有未保存修改')
 await tool('[title="重新读取，未保存时先确认"]');await ui.clickText('.n-dialog button','取消');await ui.waitFor('!document.querySelector(".n-dialog")','cancel dialog faded');assert.equal(await page.locator('.canvas-node textarea').first().inputValue(),'窄窗草稿');checks.push('actual-narrow-toolbar-wheel-reload-cancel-keeps-draft')
 await tool('.canvas-toolbar button','适应内容');await tool('[title="撤销 Ctrl+Z"]');assert.equal(await page.locator('.canvas-node textarea').first().inputValue(),'A');checks.push('actual-wheel-in-both-directions-reaches-fit-and-undo')
 await page.screenshot({path:output+'/narrow-toolbar.png'});assert.deepEqual(errors,[]);await fs.writeFile(output+'/report.json',JSON.stringify({nativeBridgeMocked:true,desktopInputUsed:false,reducedMotion:'no-preference',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks,errors}))
}catch(error){await fs.writeFile(output+'/failure.txt',String(error.stack||error));throw error}finally{await browser.close()}
