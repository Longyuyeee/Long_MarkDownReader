import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output=process.env.LONGEDIT_SESSION_PRIVACY_OUTPUT || 'docs/evidence/v119-work-session-core/search-session-browser'
await fs.mkdir(output,{recursive:false})
const browser=await chromium.launch({headless:true}),errors=[],checks=[]
const page=await browser.newPage({viewport:{width:1280,height:900}})
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
const cards=()=>page.locator('.knowledge-search-results .search-file-card')
const searchKey=root=>`longedit.search.v1:${encodeURIComponent(root.toLowerCase())}`
try{
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9019')+'/scripts/fixtures/v118-search-pages-browser.html')
 const root=await page.evaluate(()=>window.workflowAudit.store.libraryPath)
 const key=searchKey(root),secret='PRIVATE SEARCH EXCERPT NEVER PERSIST'
 await page.evaluate(secret=>{window.workflowAudit.largeSearchFiles.find(file=>file.path.endsWith('预算记录-072.md')).matches[0].context=secret},secret)
 await page.getByRole('link',{name:'资料库',exact:true}).click()
 await page.getByPlaceholder('搜索文件与正文').fill('预算');await cards().first().waitFor()
 await page.getByRole('button',{name:'加载更多文件',exact:true}).click()
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-search-results .search-file-card').length===80)
 await page.getByRole('button',{name:'打开 预算记录-072.md',exact:true}).click()
 await page.waitForFunction(()=>window.workflowAudit.store.activeTabId.endsWith('预算记录-072.md'))
 await page.getByRole('link',{name:'工作台',exact:true}).click()
 const raw=await page.evaluate(key=>localStorage.getItem(key),key),saved=JSON.parse(raw)
 assert.ok(raw);assert.equal(raw.includes(secret),false);assert.equal(saved.selected,'');assert.equal(saved.selection.length,7)
 assert.ok(saved.selection[0].endsWith('预算记录-072.md'));assert.equal(saved.loadedFiles,80)
 checks.push('real LibraryMode open and leave save an eight-field match as a seven-field locator, retaining the 80-file depth without its private excerpt')
 await page.reload()
 await page.getByRole('link',{name:'资料库',exact:true}).click()
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-search-results .search-file-card').length===80)
 await page.locator('.search-file-card.is-search-selected').waitFor()
 assert.match(await page.locator('.search-file-card.is-search-selected').textContent(),/预算记录-072/)
 assert.equal(await page.getByPlaceholder('搜索文件与正文').inputValue(),'预算')
 assert.equal(await page.evaluate(key=>localStorage.getItem(key).includes('PRIVATE SEARCH EXCERPT'),key),false)
 await page.getByRole('button',{name:'返回刚才的搜索结果'}).click()
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='打开 预算记录-072.md')
 await page.screenshot({path:output+'/restarted-selected-result.png'})
 checks.push('reload rereads fresh results whose excerpt changed, restores the late selected file and depth, and only explicit return moves keyboard focus')
 // Seed a genuine pre-fix v1 record. Loading it must not erase or rewrite it.
 const legacy={query:'预算',types:[],scroll:350,loadedFiles:80,sort:'relevance',selected:JSON.stringify([saved.selection[0],...saved.selection.slice(1),secret])}
 await page.goto('about:blank');await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9019')+'/scripts/fixtures/v118-search-pages-browser.html')
 await page.evaluate(({key,legacy})=>localStorage.setItem(key,JSON.stringify(legacy)),{key,legacy})
 await page.reload();await page.getByRole('link',{name:'资料库',exact:true}).click()
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-search-results .search-file-card').length===80)
 await page.locator('.search-file-card.is-search-selected').waitFor()
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(legacy))
 assert.match(await page.locator('.search-file-card.is-search-selected').textContent(),/预算记录-072/)
 await page.getByRole('link',{name:'工作台',exact:true}).click()
 const bar=page.getByRole('region',{name:'工作现场',exact:true})
 await bar.getByRole('button',{name:'命名保存…'}).click();await bar.getByLabel('名称',{exact:true}).fill('跨机前的客户交付')
 await bar.getByRole('button',{name:'保存现场',exact:true}).click();await bar.getByRole('status').filter({hasText:'已记住'}).waitFor()
 const all=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('longedit.search.')||key.startsWith('longedit.work-sessions.')))
 assert.equal(JSON.stringify(all).includes(secret),false)
 assert.equal(all.some(([key,value])=>key.startsWith('longedit.work-sessions.')&&JSON.parse(value)[0].search.selection[0].endsWith('预算记录-072.md')),true)
 await page.screenshot({path:output+'/named-session.png'})
 checks.push('legacy v1 selected snippets are only sanitized in memory on read, then real user leave/name actions persist locator-only metadata without deleting the old named scenes')
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/report.json',JSON.stringify({scope:'Actual Vue App/LibraryMode/WorkspaceHome/WorkSessionBar with simulated native IPC; not installed/native acceptance',checks,errors},null,2)+'\n')
 console.log(JSON.stringify({checks:checks.length,errors:errors.length}))
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});await fs.writeFile(output+'/failure.json',JSON.stringify({message:String(error),checks,errors},null,2)+'\n');throw error}
finally{await browser.close()}
