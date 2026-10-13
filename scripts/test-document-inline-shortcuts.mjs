import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-document-inline-shortcuts';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1400,height:850}})
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/library-shell-browser.html')
 await page.getByTitle('切换编辑模式',{exact:true}).waitFor()
 await page.locator('.vditor-wysiwyg').getByText('让记录更顺手',{exact:true}).waitFor()
 await page.getByTitle('调整正文宽度',{exact:true}).click()
 await page.getByText('宽栏 全宽',{exact:true}).click()
 await page.locator('.editor-width-wide').waitFor()
 await page.getByTitle('导出文档',{exact:true}).click()
 await page.getByText('导出 PDF',{exact:true}).waitFor()
 await page.keyboard.press('Escape')
 await page.getByTitle('查看历史与差异',{exact:true}).click()
 await page.locator('#panel-history').waitFor()
 await page.locator('#tab-files').click()
 await page.getByTitle('切换编辑模式',{exact:true}).click()
 await page.getByText('源码编辑',{exact:true}).click()
 await page.waitForFunction(()=>window.shellAudit.store.editorMode==='sv')
 await page.getByTitle('切换编辑模式',{exact:true}).waitFor()
 assert.equal(await page.locator('.document-shortcut-host').count(),1)
 assert.ok(await page.locator('.vditor-sv').innerText().then(t=>t.includes('让记录更顺手')))
 await page.screenshot({path:output+'/01-wide.png',animations:'disabled'})
 await page.getByTitle('切换编辑模式',{exact:true}).click()
 await page.getByText('所见即所得',{exact:true}).click()
 await page.locator('.vditor-wysiwyg').getByText('让记录更顺手',{exact:true}).waitFor()
 await page.screenshot({path:output+'/02-editing.png',animations:'disabled'})
 await page.setViewportSize({width:480,height:850})
  for (const title of ['切换编辑模式','调整正文宽度','导出文档','查看历史与差异']) {
    assert.equal(await page.getByTitle(title,{exact:true}).isVisible(),true,'Frequent shortcuts remain visible in narrow windows: '+title)
  }
 await page.getByTestId('library-document-menu').click()
 await page.locator('.document-menu-content').waitFor()
 assert.equal(await page.locator('.document-menu-content').getByTitle('导出',{exact:true}).isVisible(),true)
 await page.screenshot({path:output+'/03-narrow.png',animations:'disabled'})
 assert.deepEqual(errors,[])
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Width shortcut','Export options','History navigation','Mode rebuild keeps content and single shortcut host','Narrow shortcuts wrap and document menu remains reachable'],errors,scope:'Actual Vue/Vditor, mocked IPC, no native export/write acceptance'},null,2)+'\n')
 console.log('Document inline shortcut checks passed')
}finally{await browser.close()}
