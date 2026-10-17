// Actual LibraryMode + locked Vditor. IPC is explicitly simulated: this checks
// the observer against the submitted save payload, never native disk behavior.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {observeReadingNoteSource} from './lib/pdf-reading-dom.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1113-save-observation',sha=s=>crypto.createHash('sha256').update(s).digest('hex')
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],report={evidenceLevel:'actual-LibraryMode-Vditor-simulated-IPC-not-native-disk',nativeBridgeMocked:true,desktopInputUsed:false,status:'running',checks:[]}
page.on('pageerror',e=>errors.push(e.message))
try{
 const old=JSON.parse(await fs.readFile('docs/evidence/v1113-obsolete-a/installed-v1113-workflow.json','utf8'))
 await page.goto('http://127.0.0.1:9022/scripts/fixtures/library-shell-browser.html')
 await page.waitForFunction(()=>document.querySelector('#vditor-lib [contenteditable=true]'))
 await page.locator('.inline-mode').click();await page.getByText('源码编辑',{exact:true}).click()
 await page.waitForFunction(()=>shellAudit.store.editorMode==='sv'&&document.querySelector('#vditor-lib .vditor-sv')?.getClientRects().length)
 const raw=await page.evaluate(async snapshot=>{
  const {readingNoteMarkdown}=await import('/src/utils/pdfReadingNote.ts'),s=shellAudit.store,t=s.tabs[0]
  t.content='# 我正在写方案\n\n这段还没有保存，整理 PDF 时不能代存或丢失。\n\n\n'+readingNoteMarkdown(snapshot,'page',true);t.isDirty=true
  s.activeTabId=s.tabs[1].id;return {path:t.id,content:t.content}
 },old.snapshot)
 assert.equal(sha(raw.content),old.draftBeforeSaveSha256,'reproduce exact original appended model hash')
 await page.waitForFunction(()=>document.querySelector('#vditor-lib .vditor-sv')?.textContent.includes('会议记录'))
 await page.evaluate(id=>shellAudit.store.activeTabId=id,raw.path)
 await page.waitForFunction(()=>document.querySelector('#vditor-lib .vditor-sv')?.textContent.includes('annotation=reading-14'))
 const observed=await page.evaluate(observeReadingNoteSource)
 assert.ok(observed.markdown.startsWith('# 我正在写方案\n\n这段还没有保存，整理 PDF 时不能代存或丢失。\n\n'))
 for(const item of old.snapshot.items)assert.ok(observed.markdown.includes(item.uri))
 await page.locator('[data-testid=library-explicit-save]').click()
 await page.waitForFunction(()=>shellAudit.calls.some(c=>c.command==='write_text_document'))
 const payload=await page.evaluate(()=>shellAudit.calls.find(c=>c.command==='write_text_document').args.content)
 assert.equal(observed.markdown,payload,'read actual source DOM exactly as locked Vditor getMarkdown; no tab-model substitute')
 const nativeExpected=payload.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n+$/,'')+'\n'
 assert.equal(sha(nativeExpected),old.explicitSavedSha256,'the original disk hash is reproduced by the existing LF/final-newline policy')
 report.modelHash=sha(raw.content);report.submittedHash=sha(payload);report.nativeExpectedHash=sha(nativeExpected);report.originalFailedDiskHash=old.explicitSavedSha256;report.observed=observed
 report.checks.push('Exact old failed model and saved-byte hashes reproduced without changing product code','Actual rendered source equals actual save payload; original words and both source URIs retained')
 await page.screenshot({path:output+'/source-before-save.png'})
 assert.deepEqual(errors,[]);report.status='passed';console.log(report.checks.join('\n'))
}catch(e){report.status='failed';report.failure=String(e.stack||e);await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw e}
finally{report.errors=errors;await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
