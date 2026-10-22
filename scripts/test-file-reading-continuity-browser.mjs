import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY||'docs/evidence/v121-file-reading-development/browser'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({channel:process.env.LONGEDIT_BROWSER_CHANNEL||undefined,headless:true}),page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[],checks=[]
page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message))
const root='C:/workflow-fixture',old=root+'/阅读资料/长文.md',next=root+'/Inbox/阅读资料/长文.md'
try{
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:15941')+'/scripts/fixtures/file-reading-continuity-browser.html',{waitUntil:'domcontentloaded',timeout:90000});await page.getByRole('link',{name:'资料库',exact:true}).click()
 await page.locator(`[data-drop-path="${root}/阅读资料"]`).dblclick();await page.locator(`[data-drop-path="${old}"]`).click()
 const editor=page.locator('.editor-main .vditor-wysiwyg > .vditor-reset');await editor.getByText('段落 0：继续原来的阅读与整理。',{exact:true}).waitFor()
 await editor.hover();await page.mouse.wheel(0,1800);await page.waitForFunction(()=>document.querySelector('.editor-main .vditor-wysiwyg > .vditor-reset')?.scrollTop>1200)
 const before=await editor.evaluate(e=>e.scrollTop)
 await page.evaluate(({old})=>{const a=window.workflowAudit,root=a.store.libraryPath,key='longedit.work-sessions.v1:'+encodeURIComponent(root.toLowerCase());localStorage.setItem(key,JSON.stringify([{version:1,id:'reading',name:'阅读现场',libraryRoot:root,tabs:[{id:old,path:old,title:'长文.md',isDirty:false}],activeTabId:old,savedAt:1,views:{[old]:{scrollTop:1600,scrollLeft:0}}}]))},{old})
 await page.locator(`[data-drop-path="${root}/阅读资料"]`).click({button:'right'});await page.getByText('移动到…',{exact:true}).click()
 const modal=page.locator('.file-operation-dialog').filter({has:page.getByRole('textbox',{name:'目标文件夹',exact:true})});await modal.getByRole('textbox',{name:'目标文件夹',exact:true}).fill('Inbox');await modal.getByRole('button',{name:'移动',exact:true}).click();await modal.waitFor({state:'hidden'})
 await page.waitForFunction(next=>window.workflowAudit.store.activeTabId===next&&!document.body.inert,next);await page.waitForFunction(before=>Math.abs(document.querySelector('.editor-main .vditor-wysiwyg > .vditor-reset').scrollTop-before)<5,before)
 checks.push({id:'actual-context-folder-move-resumes-active-scroll',before,after:await editor.evaluate(e=>e.scrollTop)})
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('longedit.work-sessions.v1:'+encodeURIComponent(window.workflowAudit.store.libraryPath.toLowerCase())))[0]);assert.equal(saved.tabs[0].path,next);assert.equal(saved.views[next].scrollTop,1600);checks.push({id:'named-scene-followed-real-receipt'})
 await editor.click();await page.keyboard.press('Control+End');await page.keyboard.insertText('尚未保存的正文');await page.waitForFunction(()=>window.workflowAudit.store.tabs.some(t=>t.isDirty))
 const contentBefore=await page.evaluate(next=>window.workflowAudit.disk.get(next),next);await page.locator(`[data-drop-path="${next}"]`).click({button:'right'});await page.getByText('移动到…',{exact:true}).click();await modal.getByRole('textbox',{name:'目标文件夹',exact:true}).fill('.');await modal.getByRole('button',{name:'移动',exact:true}).click();await modal.waitFor({state:'hidden'})
 await page.waitForFunction(()=>window.workflowAudit.store.tabs.some(t=>t.path==='C:/workflow-fixture/长文.md'&&t.isDirty&&t.content.includes('尚未保存的正文'))&&!document.body.inert)
 assert.equal(await page.evaluate(()=>window.workflowAudit.disk.get('C:/workflow-fixture/长文.md')),contentBefore);assert.match(await editor.innerText(),/尚未保存的正文/);checks.push({id:'dirty-markdown-follows-without-implicit-save'})
 await page.screenshot({path:output+'/continued-reading.png'});assert.deepEqual(errors,[]);await fs.writeFile(output+'/results.json',JSON.stringify({scope:'Actual App/Vue context menus and browser input; native file events and disk simulated. Native installer checked separately.',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks:checks.length,errors:errors.length}))
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error}finally{await browser.close()}
