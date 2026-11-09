import { readTextImportPreview, dismissTextImportTask } from './mobile-text-import-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/text-import-browser-${Date.now()}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'text-import-tasks', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
const content = '\ufeff# 导入😀\r\n第一行\r尾行\n![图](images/a.png)\r\n', sourceKey = JSON.stringify(['local','原笔记.md'])
let page
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
const imports = async () => Object.values((await data()).fileImports || {})
const open = async () => { await page.getByRole('button', { name: '添加资料', exact: true }).tap(); await page.getByRole('button', { name: '导入文本文件', exact: true }).tap(); await page.getByRole('dialog', { name: '文件导入', exact: true }).waitFor() }
const close = () => dismissTextImportTask(page)
async function stage(name='旅行.md', buffer=Buffer.from(content)) { const parent = page.getByRole('button', {name:'返回导入记录',exact:true}); if (await parent.isVisible()) await parent.tap(); await page.getByLabel('选择导入文件', { exact: true }).setInputFiles({ name, mimeType: 'text/plain', buffer }); await page.waitForFunction(() => !document.querySelector('.file-import-panel [role=status]')?.textContent?.includes('正在')) }
const commit = () => page.getByRole('button', { name: '存入手机资料库并打开', exact: true }).tap()
try {
  const context = await browser.newContext({ viewport: { width:360, height:800 }, isMobile:true, hasTouch:true, colorScheme:'dark' })
  await context.addInitScript(({ sourceKey }) => {
    if (window !== window.top) return
    if (!localStorage.getItem('longedit-mobile-preview-v1')) localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version:1, documents:{ [sourceKey]:{ rootId:'local',relativePath:'原笔记.md',content:'原文\r\n',signature:'old',modified:1 } }, drafts:{ [sourceKey]:{ rootId:'local',relativePath:'原笔记.md',content:'尚未保存的草稿😀\r\n',expectedSignature:'old',revision:4,updated:1 } } }))
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key,value) { if (key === 'longedit-mobile-preview-v1') { const records=Object.values(JSON.parse(value).fileImports||{}); if (window.__rejectStage || (window.__rejectReceipt && records.some(record=>record.status==='imported' && record.id===window.__rejectReceipt))) throw new DOMException('模拟导入空间不足','QuotaExceededError') } return setItem.call(this,key,value) }
  }, { sourceKey })
  page = await context.newPage(); page.on('pageerror',error=>report.errors.push(String(error))); page.on('request',request=> { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  const original = await data(); await open(); await stage()
  await page.getByRole('button', { name:'存入手机资料库并打开', exact:true }).waitFor()
  assert.equal((await imports()).length,1); let first=(await imports())[0]
  assert.equal(first.content,content); assert.equal(first.bytes,Buffer.byteLength(content)); assert.deepEqual((await data()).documents,original.documents)
  assert.equal(await readTextImportPreview(page), content.replace(/\r\n|\r/g,'\n'))
  assert.equal(await page.locator('.sheet-heading .mobile-help-trigger').isVisible(),true); await page.screenshot({path:path.join(output,'360-ready-dark.png')})
  report.checks.push('Selecting a real UTF-8 file retains complete BOM, mixed breaks, Chinese, emoji and attachment syntax in a private pending record; creating a note requires an explicit action')
  await close(); await page.reload(); await open(); await page.locator(`[data-file-import-id="${first.id}"]`).tap(); await commit(); await page.locator('.reader-header h1').waitFor()
  first=(await imports()).find(record=>record.id===first.id); assert.equal(first.status,'imported'); assert.equal(first.content,null)
  const localKey=JSON.stringify(['local',first.localPath]); assert.equal((await data()).documents[localKey].content,content); assert.deepEqual((await data()).drafts,original.drafts)
  report.checks.push('A pending import survives reload, creates a verified independent note, and leaves the existing source and its unsaved draft unchanged')
  await page.getByRole('button',{name:'返回资料库',exact:true}).tap(); await open(); await stage(); await commit(); await page.locator('.reader-header h1').waitFor()
  assert.equal(Object.keys((await data()).documents).length,3); assert.equal(new Set((await imports()).map(record=>record.localPath)).size,2)
  report.checks.push('Two files with the same display name create distinct local notes with full content')
  await page.getByRole('button',{name:'返回资料库',exact:true}).tap(); await open(); await page.locator(`[data-file-import-id="${first.id}"]`).tap()
  await page.evaluate(({localKey})=>{const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1'));d.documents[localKey].content='后来编辑的内容';d.documents[localKey].signature='changed';localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(d))},{localKey})
  await page.getByRole('button',{name:'打开已导入笔记',exact:true}).tap(); await page.locator('.reader-header h1').waitFor(); assert.equal((await data()).documents[localKey].content,'后来编辑的内容')
  report.checks.push('Reopening a completed receipt reads the latest note and cannot overwrite later edits with the old import')
  await page.getByRole('button',{name:'返回资料库',exact:true}).tap(); await open(); await stage('重试.txt',Buffer.from('重试完整文字\r\n'))
  const retry=(await imports()).find(record=>record.status==='ready'); await page.evaluate(id=>{window.__rejectReceipt=id},retry.id); await commit(); await page.getByRole('alert').getByText(/存储空间不足/).waitFor()
  let retryRecord=(await imports()).find(record=>record.id===retry.id); assert.equal(retryRecord.status,'ready'); assert.equal(retryRecord.content,'重试完整文字\r\n'); const count=Object.keys((await data()).documents).length
  await page.evaluate(()=>{window.__rejectReceipt=false}); await commit(); await page.locator('.reader-header h1').waitFor(); assert.equal(Object.keys((await data()).documents).length,count)
  report.checks.push('If the note was written but receipt persistence fails, complete pending text and the fixed target survive; retry confirms the same note without duplicating it')
  await page.getByRole('button',{name:'返回资料库',exact:true}).tap(); await open(); const beforeInvalid=Object.keys((await data()).documents).length
  for (const [name,buffer,pattern] of [['损坏.txt',Buffer.from([0xff,0xfe,65,0]),/UTF-8/],['超限.txt',Buffer.alloc(4*1024*1024+1,65),/4 MiB/],['错误.pdf',Buffer.from('text'),/Markdown/]]) { await stage(name,buffer); await page.getByRole('alert').getByText(pattern).waitFor(); assert.equal(await page.getByRole('button',{name:'存入手机资料库并打开',exact:true}).count(),0) }
  assert.equal(Object.keys((await data()).documents).length,beforeInvalid)
  report.checks.push('Invalid encoding, actual byte overflow and unsupported extensions leave clear failed records and never create a partial note')
  await page.getByRole('button',{name:'移除记录',exact:true}).tap(); await page.getByRole('button',{name:'保留记录',exact:true}).tap(); const beforeRemove=(await imports()).length
  await page.getByRole('button',{name:'移除记录',exact:true}).tap(); await page.getByRole('button',{name:'确认移除记录',exact:true}).tap(); await page.getByText(/已移除导入记录/).waitFor(); assert.equal((await imports()).length,beforeRemove-1); assert.equal(Object.keys((await data()).documents).length,beforeInvalid)
  report.checks.push('Removing a record requires confirmation; cancelling keeps it, and confirming preserves all notes and original files')
  await page.evaluate(()=>{window.__rejectStage=true}); await stage('空间.md'); await page.getByRole('alert').getByText(/存储空间不足/).waitFor(); await page.evaluate(()=>{window.__rejectStage=false}); assert.equal(Object.keys((await data()).documents).length,beforeInvalid)
  await stage('冲突.md',Buffer.from('受保护的导入文字')); const conflict=(await imports()).find(record=>record.name==='冲突.md')
  await page.evaluate(({id})=>{const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')),p=`冲突-导入-${id}.md`;d.documents[JSON.stringify(['local',p])]={rootId:'local',relativePath:p,content:'其他内容',signature:'other',modified:1};localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(d))},{id:conflict.id})
  await commit(); await page.getByRole('alert').getByText(/不会覆盖/).waitFor(); assert.equal((await imports()).find(record=>record.id===conflict.id).content,'受保护的导入文字')
  report.checks.push('Failed initial staging creates no note; a changed retry target is refused and complete import text remains recoverable')
  await page.evaluate(()=>{document.documentElement.style.fontSize='32px'}); await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'),'utf8'))
  report.accessibility=await page.evaluate(async()=>{const result=await axe.run(document,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {violations:result.violations.map(({id})=>id)}})
  assert.deepEqual(report.accessibility.violations,[]); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]')),true)}
  await page.screenshot({path:path.join(output,'360-conflict-200-dark.png'),fullPage:true}); report.checks.push('At 360px and 200% text in dark mode, import and retry controls have no checked accessibility violations or horizontal page overflow, and modal focus remains contained')
  await page.evaluate(()=>{document.documentElement.style.fontSize='16px'}); await close()
  const injected=await page.evaluate(async()=>{
    const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')), interrupted=crypto.randomUUID(), corrupt=crypto.randomUUID()
    d.fileImports[interrupted]={id:interrupted,name:'中断.md',created:Date.now()+1,bytes:0,status:'preparing',content:null,digest:null,error:'',readable:true,localPath:null}
    d.fileImports[corrupt]={id:corrupt,name:'损坏记录.md',created:Date.now()+2,bytes:3,status:'ready',content:'bad',digest:'wrong',error:'',readable:true,localPath:null}
    localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(d));return {interrupted,corrupt}
  })
  await open();await page.locator(`[data-file-import-id="${injected.interrupted}"]`).tap();await page.getByRole('alert').getByText(/上次导入未完成/).waitFor();assert.equal(await page.getByRole('button',{name:'存入手机资料库并打开',exact:true}).count(),0)
  await page.getByRole('button',{name:'返回导入记录',exact:true}).tap();await page.locator(`[data-file-import-id="${injected.corrupt}"]`).tap();await page.getByRole('alert').getByText(/导入内容核对失败/).waitFor()
  await page.getByRole('button',{name:'移除记录',exact:true}).tap();await page.getByRole('button',{name:'确认移除记录',exact:true}).tap();await page.getByText(/已移除导入记录/).waitFor();assert.equal((await imports()).some(record=>record.id===injected.corrupt),false)
  report.checks.push('Simulated interruption metadata never claims full text; a corrupt content digest blocks commit while still allowing explicit removal of only the damaged record')
  await stage('长文.txt',Buffer.from(('中文😀\r\n').repeat(18000)+'唯一尾行'));await page.getByRole('button',{name:/^查看完整文字/}).tap();await page.getByRole('search',{name:'导入内容查找',exact:true}).waitFor()
  await page.getByPlaceholder('在此版本中查找文字').fill('唯一尾行');await page.getByText('1 / 1',{exact:true}).waitFor();assert.ok(await page.locator('.file-import-panel *').count()<1500);assert.ok((await imports()).some(record=>record.content?.endsWith('唯一尾行')))
  report.checks.push('A long imported source uses bounded fragments and searches the complete retained text through its final line')
  await page.getByRole('button',{name:'返回导入核对',exact:true}).first().tap();await page.getByRole('button',{name:'返回导入记录',exact:true}).tap()
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1'));for(let i=0;i<12;i++){const id=crypto.randomUUID();d.fileImports[id]={id,name:`等待${i}.md`,created:Date.now()+i,status:'preparing',bytes:0,content:null,digest:null,error:'',readable:true,localPath:null}}localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(d))})
  const capped=(await imports()).length;await stage('容量.md');await page.getByRole('alert').getByText(/已达当前上限/).waitFor();assert.equal((await imports()).length,capped)
  report.checks.push('The pending-file capacity guard refuses another intake without creating a phantom record or deleting earlier pending text')
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.passed=true
} catch(error){report.failure=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{})}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({output,checks:report.checks,passed:report.passed,failure:report.failure},null,2))}
