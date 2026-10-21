import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY||'docs/evidence/v1136-palette-shortcut-browser'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:950}}),checks=[],errors=[]
page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(String(e)))
try{
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9136')+'/scripts/fixtures/file-management-browser.html',{waitUntil:'domcontentloaded',timeout:60000})
 await page.getByRole('link',{name:'资料库',exact:true}).click();await page.locator('[data-drop-path="C:/workflow-fixture/项目方案.md"]').click()
 await page.locator('.inline-mode:not(:disabled)').waitFor()
 for(const mode of ['ir','sv','wysiwyg']){
  await page.locator('.inline-mode').click();await page.getByText({sv:'源码编辑',ir:'即时渲染 IR',wysiwyg:'所见即所得'}[mode],{exact:true}).click()
  await page.evaluate(()=>{window.paletteShortcutClicks=[];if(!window.paletteShortcutProbe){window.paletteShortcutProbe=true;document.addEventListener('click',e=>window.paletteShortcutClicks.push({trusted:e.isTrusted,type:e.target.closest('[data-type]')?.dataset.type}),true)}})
  const input=page.locator('#vditor-lib .vditor-'+mode+' [contenteditable=true]:visible, #vditor-lib .vditor-'+mode+'[contenteditable=true]:visible').first();await input.waitFor();await page.locator('.inline-mode:not(:disabled)').waitFor();await input.click();await page.evaluate(()=>window.paletteShortcutClicks=[])
  const before=await page.evaluate(()=>({content:window.workflowAudit.store.tabs.find(t=>t.id===window.workflowAudit.store.activeTabId)?.content,disk:window.workflowAudit.disk.get('C:/workflow-fixture/项目方案.md')}))
  await page.keyboard.press('Control+p');await page.locator('.command-palette-container').waitFor()
  assert.deepEqual(await page.evaluate(()=>window.paletteShortcutClicks.filter(e=>!e.trusted)),[],mode+' must not click editor preview')
  await page.keyboard.press('Escape');await page.locator('.command-palette-container').waitFor({state:'hidden'})
  const after=await page.evaluate(()=>({content:window.workflowAudit.store.tabs.find(t=>t.id===window.workflowAudit.store.activeTabId)?.content,disk:window.workflowAudit.disk.get('C:/workflow-fixture/项目方案.md')}));assert.deepEqual(after,before);checks.push(mode+' opens only the application palette and preserves content')
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/returned-editor.png'});await fs.writeFile(output+'/report.json',JSON.stringify({status:'passed',evidenceLevel:'browser-production-App-and-Vditor-with-controlled-IPC',checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length}))
}finally{await browser.close()}
