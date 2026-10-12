import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-inline-document-tabs';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}})
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/library-shell-browser.html')
 await page.locator('.vditor-wysiwyg').getByText('让记录更顺手',{exact:true}).waitFor()
 const ids=await page.evaluate(()=>window.shellAudit.store.tabs.map(t=>t.id))
 const tabs=page.getByRole('tablist',{name:'打开的文档'})
 await tabs.getByRole('tab',{name:'会议记录.md',exact:true}).click()
 await page.waitForFunction(()=>window.shellAudit.store.activeTabId.endsWith('/会议记录.md'))
 await tabs.getByRole('tab',{name:'项目方案.md',exact:true}).click()
 await page.waitForFunction(()=>window.shellAudit.store.activeTabId.endsWith('/项目方案.md'))
 assert.deepEqual(await page.evaluate(()=>window.shellAudit.store.tabs.map(t=>t.id)),ids)
 await page.evaluate(()=>window.shellAudit.store.addTab({...window.shellAudit.store.tabs[1]}))
 assert.deepEqual(await page.evaluate(()=>window.shellAudit.store.tabs.map(t=>t.id)),ids)
 await page.evaluate(()=>{const a=window.shellAudit;for(let i=0;i<12;i++){const path=`C:/shell-fixture/文档${i}.md`;a.disk.set(path,`# 文档${i}`);a.store.addTab({id:path,path,title:`文档${i}.md`,content:`# 文档${i}`,isDirty:false})}})
 assert.deepEqual((await page.evaluate(()=>window.shellAudit.store.tabs.map(t=>t.id))).slice(0,2),ids)
 for(const width of [1280,600,320]){
  await page.setViewportSize({width,height:800})
  await page.waitForTimeout(350)
  assert.equal(await page.locator('.editor-main > .tabs-bar').count(),0)
  assert.equal(await page.locator('.library-shell-toolbar .workspace-tabs').count(),1)
  assert.ok(await page.locator('.library-shell-toolbar').evaluate(el=>el.getBoundingClientRect().height<60))
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.equal(await page.getByRole('button',{name:'快速笔记',exact:true}).isVisible(),true)
  assert.equal(await page.getByRole('button',{name:'命令',exact:true}).isVisible(),true)
  await page.screenshot({path:`${output}/${width}.png`,animations:'disabled'})
 }
 assert.ok(await tabs.evaluate(el=>el.scrollWidth>el.clientWidth))
 await page.getByRole('button',{name:'向左浏览标签',exact:true}).click()
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Switch and reopen preserve order','New tabs append','One top row at 1280/600/320','Many tabs scroll; quick note and commands remain accessible'],errors,scope:'Actual Vue/store with mocked IPC'},null,2)+'\n')
 console.log('Inline document tab checks passed')
}finally{await browser.close()}
