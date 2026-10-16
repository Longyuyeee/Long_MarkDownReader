// Local headless contract for the CDP input helper only. Native IPC is a
// simulated fixture here; this report never closes the real Wry user stage.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_SEARCH_UI_OUTPUT;assert.ok(output)
await fs.mkdir(output,{recursive:false})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1000,height:700}})
const session=await page.context().newCDPSession(page),errors=[],checks=[]
page.on('pageerror',error=>errors.push(error.message))
const ui=nativeUserInput({send:(method,args)=>session.send(method,args),evaluate:expression=>page.evaluate(expression)},{timeoutMs:15000})
try{
  await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9018')+'/scripts/fixtures/v118-search-pages-browser.html')
  await ui.clickText('.app-navigation a','资料库')
  await ui.fill('.search-area input','预算')
  await ui.waitFor('document.querySelectorAll(".knowledge-search-results .search-file-card").length===40','actual Vue cards')
  await ui.click('.search-area input');await ui.tabTo('.knowledge-search-results select[aria-label="搜索结果排序"]')
  await ui.key('Home','Home',36);await ui.key('ArrowDown','ArrowDown',40)
  await ui.waitFor('document.querySelector(".knowledge-search-results select")?.value==="modified"&&document.querySelector(".knowledge-search-results .search-file-title")?.textContent.includes("预算记录-240")','CDP keyboard sort reaches actual select')
  checks.push('CDP click/fill/Tab/arrow keys reach the actual native HTML sort control')
  await ui.click('.search-file-title')
  await ui.waitFor('document.querySelector(".vditor-wysiwyg")?.textContent.includes("项目预算记录 240")','real editor bootstrap')
  await ui.fill('.vditor-wysiwyg [contenteditable="true"]','我正在写，先别切换资料库。')
  await ui.waitFor('window.workflowAudit.store.tabs.some(t=>t.isDirty&&t.content.includes("先别切换"))','dirty editor from CDP input')
  await page.evaluate(()=>{window.workflowAudit.pageScenario='cross'})
  await ui.key('p','KeyP',80,2)
  await ui.waitFor('!!document.querySelector(".command-palette-container")','command palette')
  await ui.click('.palette-scope');await ui.clickText('.n-base-select-option','全部资料库')
  await ui.fill('.command-palette-container input[aria-label="搜索资料或命令"]','跨库笔记')
  await ui.waitFor('document.querySelectorAll(".command-palette-container .search-file-card").length===1','other library result')
  await ui.click('.command-palette-container .search-file-title')
  await ui.waitFor('document.querySelector(".command-palette-container [role=alert]")?.textContent.includes("未保存")','real Vue guard')
  checks.push('CDP keyboard editing, Ctrl+P and exact dropdown labels keep cross-library draft guard reachable')
  assert.deepEqual(errors,[])
  await page.screenshot({path:output+'/helper-ui.png'})
  await fs.writeFile(output+'/report.json',JSON.stringify({scope:'headless CDP input-helper contract with actual Vue and simulated IPC; not native Wry acceptance',checks,errors},null,2)+'\n')
  console.log(JSON.stringify({checks:checks.length,errors:errors.length}))
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});await fs.writeFile(output+'/failure.json',JSON.stringify({error:String(error),checks,errors},null,2)+'\n');throw error}
finally{await browser.close()}
