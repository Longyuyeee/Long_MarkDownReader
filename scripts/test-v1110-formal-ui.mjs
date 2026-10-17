// Real Vue components with explicitly simulated IPC; NOT native/installed proof.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1110-formal-ui',url=process.env.LONGEDIT_V1110_URL||'http://127.0.0.1:9020'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),checks=[],errors=[]
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
try{
 await page.goto(url+'/scripts/fixtures/v1110-tags-browser.html');await page.getByRole('link',{name:'资料库',exact:true}).click();await page.locator('.vditor-wysiwyg .vditor-reset').waitFor();await page.locator('#tab-collections').click()
 const panel=page.getByRole('region',{name:'智能集合条件'})
 await panel.getByRole('button',{name:/分页项目.*整个资料库/}).click();await page.waitForFunction(()=>document.querySelectorAll('.collection-result').length===40)
 assert.match(await panel.innerText(),/40\s*\/\s*244 个文件/)
 while(await panel.getByRole('button',{name:'加载更多文件',exact:true}).count())await panel.getByRole('button',{name:'加载更多文件',exact:true}).click()
 assert.equal(await panel.locator('.collection-result').count(),244);checks.push('244 file groups load without a 200-hit cutoff')
 await page.evaluate(()=>window.workflowAudit.deferCollection=true);await panel.getByRole('button',{name:'刷新',exact:true}).click();await panel.locator('.result-waiting').waitFor();assert.equal(await panel.locator('.collection-result').count(),244)
 await page.evaluate(()=>window.workflowAudit.rejectCollection());await panel.locator('[role=alert]').waitFor();assert.equal(await panel.locator('.collection-result').count(),244);await page.screenshot({path:output+'/refresh-retained.png',fullPage:true})
 await panel.getByRole('button',{name:'重新查找',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.collection-result').length===244&&!document.querySelector('.result-waiting'));checks.push('refresh pending and failure retain all previously loaded files, then restore depth')
 await panel.getByRole('combobox',{name:'集合结果排序'}).selectOption('modified');await page.waitForFunction(()=>document.querySelector('.collection-result strong')?.textContent==='资料-243.md');checks.push('modified sort is a new server-side full-query order')
 await panel.getByRole('button',{name:'调整条件',exact:true}).click();await panel.getByRole('textbox',{name:'关键词（可不填）'}).fill('尚未提交的条件')
 await page.locator('#tab-files').click();await page.locator('#tab-collections').click();assert.equal(await panel.getByRole('textbox',{name:'关键词（可不填）'}).inputValue(),'尚未提交的条件');checks.push('unsubmitted collection conditions survive sidebar unmount')
 await page.locator('#tab-tags').click();const tags=page.getByRole('region',{name:'文内标签'});await tags.locator('.tag-item').filter({hasText:'项目'}).click();await page.waitForFunction(()=>document.querySelectorAll('.tag-note').length===40)
 await tags.getByRole('button',{name:'选择笔记整理标签',exact:true}).click();await tags.getByRole('checkbox',{name:'选择 资料-000.md',exact:true}).check();await tags.getByRole('checkbox',{name:'选择 资料-001.md',exact:true}).check()
 await page.evaluate(()=>window.workflowAudit.store.addTab({id:'C:/workflow-fixture/分页项目/资料-000.md',path:'C:/workflow-fixture/分页项目/资料-000.md',title:'资料-000.md',isDirty:true,content:'用户尚未保存的文字'}))
 await tags.getByRole('button',{name:'整理 2 份笔记',exact:true}).click();const modal=page.locator('.tag-edit-dialog');await modal.getByRole('textbox',{name:'新的标签名称'}).fill('客户项目');await modal.getByRole('button',{name:'预览影响',exact:true}).click()
 await modal.getByText('已排除',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.workflowAudit.disk.get('C:/workflow-fixture/分页项目/资料-001.md').includes('#客户项目')),false)
 await page.screenshot({path:output+'/tag-preview.png',fullPage:true});await modal.getByRole('button',{name:'确认修改 1 份文件',exact:true}).click();await modal.getByRole('button',{name:'关闭结果',exact:true}).waitFor()
 const disk=await page.evaluate(()=>({dirty:window.workflowAudit.disk.get('C:/workflow-fixture/分页项目/资料-000.md'),changed:window.workflowAudit.disk.get('C:/workflow-fixture/分页项目/资料-001.md'),history:window.workflowAudit.tagHistory,collection:window.workflowAudit.store.savedSearches[0]}))
 assert.ok(disk.dirty.includes('#项目'));assert.ok(disk.changed.includes('#客户项目'));assert.equal(disk.history.length,1);assert.equal(disk.collection.filters.tag,'项目');checks.push('explicit preview excludes a real dirty tab, writes only chosen eligible file and preserves collection meaning')
 for(const style of ['soft','neo','glass','airy','minimal','sharp']){
  await page.evaluate(style=>window.workflowAudit.store.updateConfig({visualStyle:style}),style);await page.screenshot({path:output+'/tags-'+style+'.png',fullPage:true})
  assert.equal(await modal.evaluate(element=>element.scrollWidth<=element.clientWidth+1),true)
 }
 await page.setViewportSize({width:760,height:620});await page.screenshot({path:output+'/tag-result-short.png',fullPage:true});assert.ok(await modal.getByRole('button',{name:'关闭结果',exact:true}).isVisible());checks.push('six styles and a short narrow window keep preview and result controls reachable')
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/report.json',JSON.stringify({scope:'formal Vue, simulated IPC, not native or installed acceptance',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks:checks.length,errors:errors.length}))
}catch(error){await page.screenshot({path:output+'/failure.png',fullPage:true});await fs.writeFile(output+'/failure.json',JSON.stringify({checks,errors,error:String(error)},null,2));throw error}finally{await browser.close()}
