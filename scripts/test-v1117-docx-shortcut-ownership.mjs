// Real DOCX component and trusted keyboard, with an earlier shell-style bubbling save listener.
// Simulated IPC; proves shortcut ownership, not native installation.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY
assert.ok(output);await fs.mkdir(output);const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:900}});let status='failed',shellSaveRequests
try{
 await page.addInitScript(()=>{window.shellSaveRequests=0;window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')window.shellSaveRequests++})})
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022')+'/scripts/fixtures/v1117-docx-browser.html');await page.locator('.docx-page').waitFor();await page.getByTitle('打开 DOCX 页面编辑').click();await page.locator('.docx-editor textarea').fill('只让当前DOCX处理保存快捷键');await page.keyboard.press('Control+s');await page.getByRole('dialog').waitFor();shellSaveRequests=await page.evaluate(()=>window.shellSaveRequests);assert.equal(shellSaveRequests,0,'DOCX save must not also reach the LibraryMode text-save shortcut');assert.equal(await page.evaluate(()=>docxAudit.writes.length),0);await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.locator('.draft-list article').count(),1);status='passed'
}finally{await page.screenshot({path:output+'/shortcut-ownership.png'});await fs.writeFile(output+'/results.json',JSON.stringify({status,shellSaveRequests,nativeBridgeMocked:true,desktopInputUsed:false},null,2)+'\n');await browser.close()}
