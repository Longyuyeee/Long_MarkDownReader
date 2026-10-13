import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-sidebar-compact-actions';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1000,height:740}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/library-shell-browser.html')
 await page.locator('.knowledge-index-strip small').getByText('2对象·0关系',{exact:true}).waitFor()
 await page.locator('.vditor-wysiwyg').getByText('让记录更顺手',{exact:true}).waitFor()
 for(const width of [260,240,320]){
  await page.locator('.sidebar').evaluate((el,width)=>el.style.width=width+'px',width)
  await page.waitForFunction(width=>Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width-width)<1,width)
  const boxes=await page.locator('.toolbar-area').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,rects:[...el.children].map(c=>{const r=c.getBoundingClientRect();return {y:r.y+r.height/2}})}))
  assert.equal(boxes.overflow,false,`Toolbar must not overflow at ${width}`)
  assert.ok(Math.max(...boxes.rects.map(r=>r.y))-Math.min(...boxes.rects.map(r=>r.y))<2)
  assert.ok(await page.locator('.sidebar-header').evaluate(el=>el.clientHeight<45))
  await page.screenshot({path:`${output}/${width}.png`,animations:'disabled'})
 }
 await page.getByTitle('搜索与关联选项',{exact:true}).click()
 await page.getByText('重新准备搜索与关联',{exact:true}).waitFor()
 await page.keyboard.press('Escape')
 await page.locator('.inbox-shortcut').click()
 assert.equal(await page.locator('.inbox-shortcut').getAttribute('aria-expanded'),'true')
 await page.locator('.inbox-shortcut').click()
 await page.locator('.knowledge-index-strip').waitFor()
 const before=await page.evaluate(()=>window.shellAudit.calls.filter(c=>c.command==='scan_directory').length)
 await page.getByTitle('刷新列表',{exact:true}).click()
 await page.waitForFunction(n=>window.shellAudit.calls.filter(c=>c.command==='scan_directory').length>n,before)
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['One compact row at 240/260/320px','Original index menu reachable','Inbox toggle retained','Refresh still scans library'],errors,scope:'Actual LibraryMode, mocked native IPC'},null,2)+'\n')
 console.log('Compact sidebar checks passed')
}finally{await browser.close()}
