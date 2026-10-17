// Real Vue/LibraryMode/Vditor with simulated IPC. Installed proof is separate.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1114-writing-ui';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}})
page.setDefaultTimeout(15000)
const errors=[],report={evidenceLevel:'actual-Vue-Vditor-simulated-IPC-not-native-disk',checks:[],layouts:[]};page.on('pageerror',e=>errors.push(e.message))
async function openExport(){await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByText('导出 PDF',{exact:true}).click();await page.locator('.writing-delivery-dialog iframe').waitFor();await page.waitForFunction(()=>document.querySelector('.writing-delivery-dialog iframe')?.contentDocument?.querySelector('main'))}
async function closeExport(){await page.locator('.writing-delivery-dialog').getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.writing-delivery-dialog').waitFor({state:'hidden'})}
try{
 await page.goto('http://127.0.0.1:9022/scripts/fixtures/library-shell-browser.html')
 await page.locator('#vditor-lib [contenteditable=true]').first().waitFor()
 const before=await page.evaluate(()=>[...shellAudit.disk])
 await page.locator('.inline-mode').click();await page.getByText('源码编辑',{exact:true}).click()
 await page.locator('#vditor-lib .vditor-sv').click();await page.keyboard.press('Control+End');await page.keyboard.type('\n\n这是我还没保存的交付方案。')
 await openExport()
 assert.ok(await page.frameLocator('.writing-delivery-dialog iframe').locator('body').innerText().then(s=>s.includes('这是我还没保存的交付方案。')))
 assert.deepEqual(await page.evaluate(()=>[...shellAudit.disk]),before)
 report.checks.push('Real PDF export now opens draft preview without calling nonexistent editor method or saving original')
 await page.evaluate(()=>shellAudit.failExport=true)
 await page.getByRole('button',{name:'独立 HTML…',exact:true}).click();await page.getByRole('alert').filter({hasText:'目录不可写'}).waitFor()
 assert.ok(await page.frameLocator('.writing-delivery-dialog iframe').locator('body').innerText().then(s=>s.includes('这是我还没保存的交付方案。')))
 await page.evaluate(()=>{shellAudit.failExport=false;shellAudit.cancelExport=true})
 await page.getByRole('button',{name:'Markdown 仅正文…',exact:true}).click();assert.equal(await page.locator('.writing-delivery-dialog [role=alert]').count(),0)
 await page.evaluate(()=>shellAudit.cancelExport=false)
 await page.getByRole('button',{name:'独立 HTML…',exact:true}).click();await page.getByRole('status').filter({hasText:'已导出'}).waitFor()
 const payload=await page.evaluate(()=>shellAudit.calls.filter(c=>c.command==='save_writing_delivery').at(-1).args)
 assert.ok(payload.content.includes('这是我还没保存的交付方案。'));assert.ok(payload.content.startsWith('<!doctype html>'))
 report.checks.push('Real failure remains visible; true null cancellation quiet; retry preserves snapshot and exports draft, not stale disk')
 for(const style of ['soft','neo','glass','airy','minimal','sharp'])for(const theme of ['white','dark']){
  await page.evaluate(({style,theme})=>{shellAudit.store.visualStyle=style;shellAudit.store.theme=theme},{style,theme});await page.waitForTimeout(200)
  await page.screenshot({path:`${output}/export-${style}-${theme}.png`});report.layouts.push({style,theme})
 }
 for(const size of [{width:760,height:620},{width:480,height:800},{width:360,height:620}]){
  await page.setViewportSize(size);await page.waitForTimeout(200)
  const box=await page.getByRole('button',{name:'打印 / PDF…',exact:true}).boundingBox();report.layouts.push({size,box,geometry:await page.locator('.writing-delivery-dialog').evaluate(e=>[e,...e.children].map(n=>({name:n.className,height:n.getBoundingClientRect().height,top:n.getBoundingClientRect().top,flex:getComputedStyle(n).flex,display:getComputedStyle(n).display,maxHeight:getComputedStyle(n).maxHeight}))) });assert.ok(box&&box.x>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height)
  const footer=await page.locator('.delivery-footnote').boundingBox();assert.ok(footer&&footer.y+footer.height<=size.height,'essential export limits remain in viewport')
  await page.screenshot({path:`${output}/export-${size.width}.png`});report.layouts.push(size)
 }
 await page.setViewportSize({width:1280,height:900});await closeExport()
 await page.getByText('更多格式',{exact:true}).click();await page.getByText('本地图片…',{exact:true}).click()
 await page.waitForFunction(()=>shellAudit.store.tabs.find(t=>t.id===shellAudit.store.activeTabId)?.content.includes('.assets/fixture-image.png'))
 assert.deepEqual(await page.evaluate(()=>[...shellAudit.disk]),before)
 report.checks.push('Actual local-image toolbar inserts relative reference into live draft without saving original (image picker IPC simulated)')
 await page.evaluate(()=>{shellAudit.store.noteTemplates=[{id:'custom-writing',name:'客户沟通',content:'# {{title}}\n作者：{{param:作者}}\n日期：{{date}}\n未知：{{keep}}'}]})
 await page.getByTestId('library-create-menu').click();await page.getByText('填写模板后新建…',{exact:true}).click()
 const modal=page.locator('.template-create-dialog');await modal.waitFor();await modal.locator('select').selectOption('custom-writing')
 await modal.getByLabel('文章标题',{exact:true}).fill('十月客户 沟通');await modal.getByLabel('模板参数 作者',{exact:true}).fill('小林 {{time}}')
 assert.match(await modal.getByLabel('新笔记填充预览').innerText(),/# 十月客户 沟通\n作者：小林 \{\{time\}\}/)
 await page.evaluate(()=>shellAudit.failCreate=true);await modal.getByRole('button',{name:'在此新建',exact:true}).click();await modal.getByRole('alert').filter({hasText:'目录正在移动'}).waitFor()
 assert.equal(await modal.getByLabel('模板参数 作者',{exact:true}).inputValue(),'小林 {{time}}')
 await page.screenshot({path:output+'/template-filled-failure.png'})
 for(const size of [{width:760,height:620},{width:480,height:800},{width:360,height:620}]){
  await page.setViewportSize(size);await page.waitForTimeout(200);const box=await modal.getByRole('button',{name:'在此新建',exact:true}).boundingBox();assert.ok(box&&box.y+box.height<=size.height)
  await page.screenshot({path:`${output}/template-${size.width}.png`})
 }
 await page.setViewportSize({width:1280,height:900})
 await page.evaluate(()=>shellAudit.failCreate=false);await modal.getByRole('button',{name:'在此新建',exact:true}).click();await modal.waitFor({state:'hidden'})
 await page.waitForFunction(()=>shellAudit.disk.has('C:/shell-fixture/十月客户 沟通.md'))
 const note=await page.evaluate(()=>shellAudit.disk.get('C:/shell-fixture/十月客户 沟通.md'))
 assert.match(note,/# 十月客户 沟通\n作者：小林 \{\{time\}\}/);assert.ok(note.includes('{{keep}}'))
 assert.deepEqual(await page.evaluate(()=>[...shellAudit.disk].slice(0,2)),before)
 report.checks.push('Optional template fill preserves quick-create path; title/target/parameters preview, failure retry, nonrecursive values and unknown variables work')
 assert.deepEqual(errors,[]);report.status='passed'
}catch(error){report.status='failed';report.failure=String(error.stack||error);await page.screenshot({path:output+'/failure.png'});throw error}
finally{report.errors=errors;await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
