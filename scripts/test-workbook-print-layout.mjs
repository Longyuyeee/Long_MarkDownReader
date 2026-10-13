import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-workbook-print-layout'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try {
 const page=await browser.newPage({viewport:{width:480,height:400}})
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html')
 for(const [name,cls] of [['页面设置','page-layout'],['打印选项','print-options'],['页眉页脚','header-footer']]) {
  await page.getByRole('button',{name,exact:true}).click()
  const modal=page.locator(`.${cls}-modal`)
  await modal.locator('input,select,textarea').first().click()
  if(cls==='page-layout') {
   await modal.locator('select').nth(2).selectOption('fit')
   await modal.locator('.page-layout-panel fieldset input').last().fill('0.4')
  }
  if(cls==='print-options') {await modal.getByLabel('指定首页页码').check();await modal.getByLabel('首页页码',{exact:true}).fill('3')}
  if(cls==='header-footer') {
   await modal.getByLabel('首页不同').check()
   await modal.getByRole('button',{name:'首页',exact:true}).click()
   await modal.locator('textarea').first().fill('项目交付清单')
   await modal.locator('textarea').last().fill('内部资料')
  }
  const apply=await modal.getByRole('button',{name:'应用',exact:true}).boundingBox()
  assert.ok(apply.y>=0 && apply.y+apply.height<=400,'Apply visible in short window')
  assert.ok(await modal.locator('.page-settings-save-notice').count()===1)
  await page.screenshot({path:output+`/${cls}-short.png`,animations:'disabled'})
  await modal.getByRole('button',{name:'取消',exact:true}).click()
  await modal.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(()=>Boolean(window.workbookAudit.pendingPageSetting)),false)
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Three settings dialogs at 480x400','Fit-page fields','First-page number','First-page header editing','Apply/cancel remain within viewport','Cancel does not begin native fixture write'],errors,scope:'Actual WorkbookView; native read mocked; no real print or native save acceptance',releaseCandidate:false},null,2)+'\n')
 console.log('Workbook print dialog layout checks passed')
} finally {await browser.close()}
