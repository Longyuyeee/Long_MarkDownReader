import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {writingImageFixture} from './lib/writing-delivery-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_WRITING_BOUNDARY_EVIDENCE||'docs/evidence/v1114-writing-boundaries';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1100,height:820}}),report={evidenceLevel:'real-LibraryMode-Vditor-simulated-IPC-not-installed',checks:[]}
const png='data:image/png;base64,'+writingImageFixture().toString('base64')
const open=async()=>{await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByText('导出 HTML',{exact:true}).click();await page.locator('.writing-delivery-dialog').waitFor()}
try{
 await page.goto('http://127.0.0.1:9022/scripts/fixtures/library-shell-browser.html');await page.locator('#vditor-lib [contenteditable=true]').first().waitFor()
 await page.locator('.inline-mode').click();await page.getByText('源码编辑',{exact:true}).click();await page.locator('#vditor-lib .vditor-sv').click();await page.keyboard.press('Control+a');await page.keyboard.insertText('# 图片交付\n\n![共享图](共享%20图片.png)\n\n![新图](.assets/fixture-image.png)\n')
 await page.evaluate(data=>shellAudit.deliveryResources={images:['共享%20图片.png','.assets/fixture-image.png'].map(source=>({source,dataUri:data})),warnings:[]},png)
 for(const[mode,label]of [['sv','源码编辑'],['wysiwyg','所见即所得'],['ir','即时渲染 IR']]){
  if(mode!=='sv'){await page.locator('.inline-mode').click();await page.getByText(label,{exact:true}).click();await page.waitForFunction(mode=>shellAudit.store.editorMode===mode,mode)}
  await open();await page.waitForFunction(()=>{const f=document.querySelector('.writing-delivery-dialog iframe');return f?.contentDocument?.images.length===2&&[...f.contentDocument.images].every(i=>i.complete&&i.naturalWidth===240)})
  assert.equal(await page.frameLocator('.writing-delivery-dialog iframe').locator('[srcset]').count(),0)
  await page.screenshot({path:`${output}/local-images-${mode}.png`});await page.locator('.writing-delivery-dialog').getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.writing-delivery-dialog').waitFor({state:'hidden'});report.checks.push('Both real Vditor local image destinations survive portable export in '+mode)
 }
 await page.evaluate(()=>shellAudit.failDelivery=true);await open();const modal=page.locator('.writing-delivery-dialog');await modal.getByRole('alert').filter({hasText:'图片缺失'}).waitFor()
 await modal.getByRole('button',{name:'Markdown 仅正文…',exact:true}).click();await modal.getByRole('status').filter({hasText:'已导出'}).waitFor()
 assert.equal(await modal.getByRole('button',{name:'重新准备',exact:true}).count(),1,'body-only Markdown must not erase the independent HTML resource error/retry action')
 await page.evaluate(()=>shellAudit.failDelivery=false);await modal.getByRole('button',{name:'重新准备',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.writing-delivery-dialog iframe')?.contentDocument?.images.length===2)
 report.checks.push('Body-only Markdown success cannot erase failed HTML preparation or its retry action');report.status='passed'
}catch(error){report.status='failed';report.failure=String(error.stack||error);await page.screenshot({path:output+'/failure.png'});throw error}
finally{await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
