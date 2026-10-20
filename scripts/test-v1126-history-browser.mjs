import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1126-structured-history-development/browser',base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9036'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({args:['--no-proxy-server']}),checks=[],errors=[];let page
try{
 for(const mode of ['json','yaml','xml','toml']){
  page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(base+'/scripts/fixtures/v1120-structured-browser.html?mode='+mode);const input=page.locator('.cm-content[contenteditable="true"]');await input.waitFor()
  const write=async text=>{await input.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(text)}
  const open=async()=>{await page.getByRole('button',{name:'文档操作',exact:true}).click();await page.getByText('历史与差异…',{exact:true}).click();await page.locator('.history-version-button').first().waitFor()}
  const compare=async()=>{await open();await page.locator('.history-version-button').first().click();await page.locator('.history-diff-dialog').waitFor()}
  const original=await page.evaluate(()=>window.structuredAudit.sources[window.structuredAudit.mode]),draft=original.replace('原稿','我的草稿')
  await write(draft);await compare();await page.locator('.history-diff-dialog').getByRole('button',{name:'取消',exact:true}).click();await page.locator('.text-history-dialog').getByRole('button',{name:'关闭',exact:true}).click();assert.equal(await page.evaluate(()=>window.structuredAudit.sourceText()),draft)
  await compare();await page.locator('.history-diff-dialog').getByRole('button',{name:'替换编辑区…',exact:true}).click();await page.locator('.n-dialog').getByRole('button',{name:'保护草稿并替换',exact:true}).click()
  await page.waitForFunction(()=>!document.querySelector('.history-diff-dialog'));assert.equal(await page.evaluate(()=>window.structuredAudit.sourceText()),original.replace('原稿','初稿'))
  assert.equal(await page.evaluate(()=>window.structuredAudit.files['C:/ui/A.'+window.structuredAudit.mode].content),original)
  await input.click();await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>window.structuredAudit.sourceText()),draft)
  checks.push(mode+' compare/cancel/full restore only to owned draft and one undo')
  // A delayed restore must never overwrite input made after comparison.
  await compare();await page.evaluate(()=>window.structuredAudit.holdHistoryRestore=true)
  await page.locator('.history-diff-dialog').getByRole('button',{name:'替换编辑区…',exact:true}).click();await page.locator('.n-dialog').getByRole('button',{name:'保护草稿并替换',exact:true}).click()
  await page.waitForFunction(()=>window.structuredAudit.pending.some(p=>p.kind==='holdHistoryRestore'))
  const newer=draft.replace('我的草稿','后续输入');await page.evaluate(text=>window.structuredAudit.replaceSource(text),newer)
  await page.evaluate(()=>window.structuredAudit.release('holdHistoryRestore'));await page.locator('.history-diff-dialog [role="alert"]').waitFor();assert.equal(await page.evaluate(()=>window.structuredAudit.sourceText()),newer)
  await page.locator('.history-diff-dialog').getByRole('button',{name:'取消',exact:true}).click();await page.locator('.text-history-dialog').getByRole('button',{name:'关闭',exact:true}).click()
  checks.push(mode+' late restore preserves subsequent input')
  await page.locator('header').first().getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-saving]')?.dataset.saving==='false'&&document.querySelector('[data-dirty]')?.dataset.dirty==='false')
  assert.equal(await page.evaluate(()=>window.structuredAudit.histories['C:/ui/A.'+window.structuredAudit.mode][0][1]),newer)
  assert.ok(await page.evaluate(()=>window.structuredAudit.histories['C:/ui/A.'+window.structuredAudit.mode].some(e=>e[1]===window.structuredAudit.sources[window.structuredAudit.mode])))
  await compare();await page.screenshot({path:output+'/'+mode+'.png'});await page.close();checks.push(mode+' explicit save retains before and after snapshots')
 }
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/result.json',JSON.stringify({status:'passed',nativeBridgeMocked:true,desktopInputUsed:false,checks,errors},null,2));console.log('Structured history browser checks passed: '+checks.length)
}catch(error){if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});await fs.writeFile(output+'/failure.json',JSON.stringify({failure:String(error.stack||error),checks,errors},null,2));throw error}finally{await browser.close()}
