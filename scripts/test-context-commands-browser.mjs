import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY||'docs/evidence/v1136-commands-browser'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[],checks=[],surfaces=[]
page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000)
try{
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9136')+'/scripts/fixtures/v1136-commands-browser.html')
 const open=async()=>{await page.getByRole('button',{name:'命令',exact:true}).click();await page.getByRole('button',{name:'操作',exact:true}).click()}
 for(const style of ['minimal','glass','neo','airy','sharp','soft']){
  await page.evaluate(s=>{window.commandAudit.style=s;document.body.dataset.style=s},style);await open();await page.getByRole('textbox',{name:'搜索资料或命令'}).fill('附件');await page.getByText('管理附件…',{exact:true}).waitFor();surfaces.push(await page.locator('.command-palette-container').evaluate(e=>({radius:getComputedStyle(e).borderRadius,color:getComputedStyle(e).color})));await page.screenshot({path:output+'/'+style+'.png'});await page.keyboard.press('Escape')
 }
 assert.ok(new Set(surfaces.map(s=>s.radius)).size>=3);
 checks.push('six styles retain readable Chinese operation results and ordinary transitions')
 await open();await page.getByRole('textbox',{name:'搜索资料或命令'}).fill('图片');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.commandAudit.calls===1);assert.equal(await page.evaluate(()=>window.commandAudit.draft),'未保存的正文');checks.push('Chinese alias and keyboard Enter execute the original registered action without saving')
 await open();await page.getByRole('textbox',{name:'搜索资料或命令'}).fill('附件');await page.evaluate(()=>window.commandAudit.path='b.md');await page.keyboard.press('Enter');await page.getByRole('alert').filter({hasText:'文件已切换'}).waitFor();assert.equal(await page.evaluate(()=>window.commandAudit.calls),1);await page.keyboard.press('Escape');checks.push('stale document result remains a local recoverable palette error')
 await open();await page.getByRole('textbox',{name:'搜索资料或命令'}).fill('附件');await page.evaluate(()=>window.commandAudit.ready=false);await page.keyboard.press('Enter');await page.getByRole('alert').filter({hasText:'暂不可用'}).waitFor();await page.keyboard.press('Escape');checks.push('operation availability is checked again immediately before execution')
 await page.evaluate(()=>window.commandAudit.ready=true);await page.getByRole('button',{name:'命令',exact:true}).click();await page.getByRole('textbox',{name:'搜索资料或命令'}).fill('>附件');await page.getByText('管理附件…',{exact:true}).waitFor();await page.keyboard.press('Escape');checks.push('legacy greater-than prefix still works')
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/report.json',JSON.stringify({status:'passed',evidenceLevel:'browser-controlled-callbacks',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length,styles:6}))
}finally{await browser.close()}
