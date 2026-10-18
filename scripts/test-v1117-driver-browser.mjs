// Exercise the exact installed-driver helpers on the production view + tooltip policy.
// Native bridge is simulated; this never replaces actual installer acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY
assert.ok(output);await fs.mkdir(output);const source=await fs.readFile('scripts/lib/installed-v1-1-17-workflow.mjs','utf8'),browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:900}}),cdp=await page.context().newCDPSession(page),errors=[];page.on('pageerror',error=>errors.push(error.message));let status='failed'
try{
 const evaluate=expression=>page.evaluate(expression),ui=nativeUserInput({send:(method,params)=>cdp.send(method,params),evaluate}),body='document.querySelector(".docx-editor textarea")',draftCount='document.querySelectorAll(".draft-list article").length',navigate=async()=>{await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022')+'/scripts/fixtures/v1117-docx-browser.html?tooltips=1')},dialogButton=text=>ui.clickText('.n-dialog button',text)
 const context={evaluate,ui,body,draftCount,navigate,dialogButton,q:JSON.stringify},extract=name=>vm.runInNewContext('('+source.match(new RegExp('const '+name+'=(async [^\\r\\n]+)'))[1]+')',context)
 await extract('open')('C:/ui/项目计划.docx');assert.equal(await page.locator('[aria-label="打开 DOCX 页面编辑"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.docx-toolbar [title]').count(),0)
 await ui.fill('.docx-editor textarea','用同一套公开控件脚本直接保存');await extract('save')(false);assert.equal(await page.locator('.draft-list article').count(),0);assert.equal(await page.evaluate(()=>docxAudit.writes.length),1)
 await ui.fill('.docx-editor textarea','同一套可信快捷键也能保存');await extract('save')(true);assert.equal(await page.locator('.draft-list article').count(),0);assert.equal(await page.evaluate(()=>docxAudit.writes.length),2);assert.deepEqual(errors,[]);status='passed'
}finally{await page.screenshot({path:output+'/exact-driver-with-tooltip-policy.png'});await fs.writeFile(output+'/results.json',JSON.stringify({status,errors,nativeBridgeMocked:true,desktopInputUsed:false,scope:'Exact native-driver open and save helpers with production tooltip adoption and trusted CDP input; not installer proof'},null,2)+'\n');await browser.close()}
