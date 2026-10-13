import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-document-name-rename';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1100,height:800}})
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/library-shell-browser.html')
 await page.locator('.vditor-wysiwyg').getByText('让记录更顺手',{exact:true}).waitFor()
 const title=page.getByRole('button',{name:'重命名当前文档',exact:true})
 await title.click()
 const dialog=page.getByRole('dialog'),input=page.locator('#library-rename-input input')
 await page.screenshot({path:output+'/01-dialog.png',animations:'disabled'})
 await dialog.getByRole('button',{name:'取消',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.shellAudit.calls.filter(c=>c.command==='rename_item').length),0)
 await page.evaluate(()=>{const t=window.shellAudit.store.tabs[0];t.content='# 未保存的草稿';t.isDirty=true})
 await title.click();await input.fill('会议记录.md')
 await dialog.getByRole('button',{name:'更新名称',exact:true}).click()
 await page.getByText('同名文件已存在',{exact:true}).waitFor()
 assert.equal(await dialog.isVisible(),true)
 await input.fill('新项目名称.md')
 await dialog.getByRole('button',{name:'更新名称',exact:true}).click()
 await page.waitForFunction(()=>window.shellAudit.store.activeTabId.endsWith('/新项目名称.md'))
 assert.match(await title.innerText(),/新项目名称.md/)
 const tab=await page.evaluate(()=>window.shellAudit.store.tabs.find(t=>t.id===window.shellAudit.store.activeTabId))
 assert.equal(tab.content,'# 未保存的草稿');assert.equal(tab.isDirty,true)
 await page.screenshot({path:output+'/02-renamed.png',animations:'disabled'})
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Click name opens original rename dialog','Cancel does not rename','Name collision retains dialog','Rename updates active path/name and preserves dirty content'],errors,scope:'Actual Vue/store; simulated rename IPC, not native filesystem acceptance'},null,2)+'\n')
 console.log('Document name rename checks passed')
}finally{await browser.close()}
