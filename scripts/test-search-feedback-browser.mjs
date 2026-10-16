import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { searchFeedbackContract } from './lib/search-feedback-contract.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_FEEDBACK_OUTPUT||'docs/evidence/v118-native-ipc/feedback-browser'
await fs.mkdir(output,{recursive:false})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[]
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000)
const palette=page.getByRole('dialog',{name:'命令与资料'}),input=()=>palette.getByRole('textbox',{name:'搜索资料或命令'})
const open=async()=>{await page.keyboard.press('Control+p');await palette.waitFor()}
try{
  await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9018')+'/scripts/fixtures/v118-search-pages-browser.html')
  await open();await input().fill('预算');await palette.locator('.search-file-card').first().waitFor()
  const feedback=searchFeedbackContract(await palette.locator('.search-page-status').count()>0,'.command-palette-container')
  assert.equal(feedback.error,'.command-palette-container .search-page-error')
  await input().fill('"未结束');await palette.getByRole('alert').filter({hasText:'缺少结束双引号'}).waitFor()
  assert.equal(await palette.locator('.search-page-line').count(),0,'syntax error does not expose the page status header controls')
  assert.equal(await page.evaluate(feedback.emptyExpression),false)
  await page.evaluate(()=>{window.workflowAudit.pageScenario='empty'})
  await input().fill('没有这个项目');await page.waitForFunction(feedback.emptyExpression)
  checks.push('same contract selected from a valid page detects invalid phrase then actual completed empty despite hidden syntax-error page status')
  await page.keyboard.press('Escape');await page.evaluate(()=>{window.workflowAudit.pageScenario='allFailed'})
  await open();await input().fill('预算');await palette.getByText(/所有资料库都未能完成搜索/).waitFor()
  assert.equal(await page.evaluate(feedback.emptyExpression),false)
  await page.keyboard.press('Escape');await page.evaluate(()=>{window.workflowAudit.pageScenario='offline'})
  await open();await input().fill('预算');await palette.getByText(/结果尚未查全/).waitFor()
  assert.equal(await page.evaluate(feedback.emptyExpression),false)
  checks.push('actual aggregate failure and partial results do not satisfy the genuine-empty predicate')
  await page.keyboard.press('Escape');await page.evaluate(()=>{window.workflowAudit.pageScenario='large';window.workflowAudit.pageFault='unavailable'})
  await open();await input().fill('预算');await page.locator(feedback.error).waitFor()
  assert.match(await page.locator(feedback.error).textContent(),new RegExp(feedback.incompleteText))
  await page.locator(feedback.error).getByRole('button',{name:'重试',exact:true}).focus();await page.keyboard.press('Enter')
  await palette.locator('.search-file-card').first().waitFor();assert.equal(await input().inputValue(),'预算')
  checks.push('real paged error selector supports keyboard retry with the query preserved')
  assert.deepEqual(errors,[]);await page.screenshot({path:output+'/recovered.png'})
  await fs.writeFile(output+'/report.json',JSON.stringify({scope:'actual Vue pages with isolated simulated IPC, not native or installed proof',checks,errors},null,2)+'\n')
  console.log(JSON.stringify({checks:checks.length,errors:errors.length}))
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});await fs.writeFile(output+'/failure.json',JSON.stringify({error:String(error),errors,checks},null,2)+'\n');throw error}
finally{await browser.close()}
