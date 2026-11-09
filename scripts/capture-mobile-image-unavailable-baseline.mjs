import assert from 'node:assert/strict'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { openMobileDocumentAction } from './mobile-document-navigation.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const out=process.env.LONGEDIT_IMAGE_BASELINE_OUTPUT||'docs/evidence/mobile-image-unavailable-2026-10-28/before'
try{await access(out);throw Error('Baseline already exists')}catch(e){if(e.code!=='ENOENT')throw e}await mkdir(out,{recursive:true})
const key='longedit-mobile-preview-v1',noteKey=JSON.stringify(['local','行程笔记.md']),id='00000000-0000-4000-8000-000000000601',pendingId='00000000-0000-4000-8000-000000000602'
const original='# 行程笔记\r\n原始内容。\r\n',draft='# 行程笔记\n保留未保存的路线安排😀\n![路线图](attachments/route.png)\n'
const record={id,rootId:'local',notePath:'行程笔记.md',name:'路线示意.png',status:'ready',imagePath:'attachments/route.png',width:320,height:200,bytes:5234,created:1793152800000,error:'',attempts:1}
const seed={version:1,documents:{[noteKey]:{rootId:'local',relativePath:'行程笔记.md',content:original,signature:'original',modified:1}},drafts:{},images:{},imageImports:{[id]:record,[pendingId]:{...record,id:pendingId,name:'未完成图片.png',status:'unconfirmed',created:1793152799000,error:'图片恢复数据不可读，请重新选择原图'}}}
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),report={baseHead:'d4b0180df',nativeAndroidTest:false,observed:{},screens:[]}
const button=name=>page.getByRole('button',{name,exact:true}),back=()=>page.evaluate(()=>window.__longeditMobileBack())
async function capture(name){await page.screenshot({path:out+'/'+name+'.png'});report.screens.push({name,viewport:page.viewportSize(),header:await page.locator('.sheet-heading').boundingBox(),retry:await button('重新读取图片').boundingBox()})}
try{
 await page.addInitScript(({key,seed})=>{localStorage.setItem(key,JSON.stringify(seed))},{key,seed});await page.goto('http://127.0.0.1:9012/mobile.html');await page.locator('.file-row').filter({hasText:'行程笔记.md'}).tap();await button('编辑').tap();await page.getByRole('textbox',{name:'笔记正文',exact:true}).fill(draft);await page.getByText('草稿已保护',{exact:true}).waitFor();await openMobileDocumentAction(page,'图片与附件');await page.getByLabel('图片说明',{exact:true}).fill('周末路线');await button('导入记录').tap();await page.locator(`[data-image-id="${id}"]`).tap();await page.getByRole('alert').waitFor();await capture('missing')
 report.observed.chooseAlternativeInDetail=await button('重新选择图片').isVisible();report.observed.insertionDisabled=await button('插入光标处').isDisabled();const before=await page.evaluate(key=>localStorage.getItem(key),key);await button('重新读取图片').tap();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before)
 await page.setViewportSize({width:320,height:346});await page.evaluate(()=>document.documentElement.style.fontSize='32px');await button('重新读取图片').scrollIntoViewIfNeeded();await capture('short-missing');report.observed.headerOffscreen=(await page.locator('.sheet-heading').boundingBox()).y<0
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='16px');await back();await page.locator(`[data-image-id="${pendingId}"]`).tap();await page.getByRole('alert').first().waitFor();await capture('missing-recovery');report.observed.writeRetryWithoutReadableImage=await button('重试导入').isVisible()
 const current=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(current.documents[noteKey].content,original);assert.equal(current.drafts[noteKey].content,draft.replace(/\n/g,'\r\n'));assert.equal(Object.keys(current.imageImports).length,2)
 const css=await page.locator('link[rel=stylesheet]').getAttribute('href');await writeFile(out+'/app.css',await(await page.request.get(new URL(css,page.url()).href)).body());await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{await browser.close()}
