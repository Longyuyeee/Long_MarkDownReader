import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=resolve(process.env.FULL_WINDOW_OUTPUT||'.release-secrets/v120-workbook-toolbar')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,channel:process.env.LONGEDIT_BROWSER_CHANNEL||undefined,args:['--no-proxy-server']})
const results=[]
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/scripts/fixtures/vditor/**',route=>route.continue({url:route.request().url().replace('/scripts/fixtures/vditor/','/vditor/')}))
 await page.goto('http://127.0.0.1:15941/scripts/fixtures/full-window-review-browser.html?fixture=workbook-save&surface=embedded&v1116=1',{waitUntil:'domcontentloaded',timeout:90000})
 await page.waitForFunction(()=>window.fullWindowAudit?.ready)
 await page.locator('.tool-panel-trigger').waitFor()
 for(const [width,height] of [[1920,1080],[1280,820],[800,600],[640,480]]) for(const style of ['soft','neo','glass','airy','minimal','sharp']) for(const reference of [false,true]) {
  await page.setViewportSize({width,height})
  await page.evaluate(style=>{const store=window.fullWindowAudit.store;store.visualStyle=style;store.theme=style==='neo'?'dark':'white'},style)
  const toggle=page.getByTestId('library-reference-toggle')
  if((await toggle.getAttribute('aria-expanded')==='true')!==reference)await toggle.click()
  await page.waitForTimeout(250)
  assert.ok(await page.locator('.workbook-actions').evaluate(e=>e.getBoundingClientRect().width>=80),'toolbar actions have usable width')
  await page.locator('.tool-panel-trigger').click()
  await page.locator('.n-dropdown-option-body__label').filter({hasText:/^单元格格式$/}).click()
  await page.locator('.format-toolbar').waitFor()
  await page.locator('.tool-panel-trigger').click()
  await page.getByText('收起工具面板',{exact:true}).click()
  const save=page.locator('.workbook-actions .primary')
  await save.scrollIntoViewIfNeeded()
  assert.ok(await save.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.left>=0&&r.right<=innerWidth&&hit&&e.contains(hit)}),'save action remains reachable')
  if(reference&&(width===1280||width===640))await page.screenshot({path:resolve(output,`${style}-${width}-reference.png`)})
  results.push({width,height,style,reference,tools:true,save:true})
 }
 assert.deepEqual(errors,[])
 await writeFile(resolve(output,'report.json'),JSON.stringify({checks:results.length,results,errors},null,2))
 console.log(JSON.stringify({checks:results.length,errors:errors.length}))
} finally {await browser.close()}
