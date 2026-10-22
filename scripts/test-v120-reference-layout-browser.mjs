import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=resolve(process.env.FULL_WINDOW_OUTPUT||'.release-secrets/v120-reference-layout')
await mkdir(output,{recursive:true})
const cases=[['library','library-shell','page'],['text','text-redesign','embedded'],['json','json-redesign','embedded'],['yaml','yaml-redesign','embedded'],['xml','xml-redesign','embedded'],['toml','toml-redesign','embedded'],['log','log-redesign','embedded'],['drawio','drawio-redesign','embedded'],['docx','docx-redesign','embedded'],['odt','odt-redesign','embedded'],['odf','odf-redesign','embedded'],['pptx','pptx-redesign','embedded'],['canvas','canvas-redesign','embedded'],['pdf','pdf-redesign','embedded'],['table','table-redesign','embedded'],['workbook','workbook-save','embedded'],['diagram','diagram-redesign','embedded'],['mindmap','mindmap-redesign','embedded'],['media','media-redesign','embedded']]
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',')
const browser=await chromium.launch({headless:true,channel:process.env.LONGEDIT_BROWSER_CHANNEL||undefined,args:['--no-proxy-server']})
const results=[],standalone=[]
try {
 for(const [id,fixture,surface] of cases.filter(([id])=>!only||only.includes(id))) {
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/scripts/fixtures/vditor/**',route=>route.continue({url:route.request().url().replace('/scripts/fixtures/vditor/','/vditor/')}))
  await page.goto(`http://127.0.0.1:15941/scripts/fixtures/full-window-review-browser.html?fixture=${fixture}&surface=${surface}`,{waitUntil:'domcontentloaded',timeout:90000})
  await page.waitForFunction(()=>window.fullWindowAudit?.ready)
  if(!await page.locator('.library-mode').count()) {
   assert.equal(id,'odt','Expected format must retain its library shell')
   await page.locator('.odt-stage').waitFor()
   assert.deepEqual(errors,[])
   standalone.push({id,reason:'standalone reader has no reference panel; full-window layout is covered separately'})
   console.log(id+': standalone reader, reference panel not applicable')
   await writeFile(resolve(output,'report.json'),JSON.stringify({checks:results.length,results,standalone},null,2))
   await page.close();continue
  }
  await page.getByTestId('library-document-menu').waitFor()
  for(const [width,height] of [[1920,1080],[1000,700],[800,600],[640,480]]) for(const style of ['soft','neo','glass','airy','minimal','sharp']) for(const reference of [false,true]) {
   await page.setViewportSize({width,height})
   await page.evaluate(style=>{const store=window.fullWindowAudit.store;store.visualStyle=style;store.theme=style==='neo'?'dark':'white'},style)
   const toggle=page.getByTestId('library-reference-toggle')
   if((await toggle.getAttribute('aria-expanded')==='true')!==reference)await toggle.click()
   await page.waitForTimeout(220)
   const controls=await page.locator('.document-primary-actions button').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {name:e.getAttribute('data-testid'),width:r.width,reachable:r.width>0&&r.height>0&&r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&!!hit&&e.contains(hit)}}))
   assert.ok(controls.length>=4,`${id} primary actions exist`)
   assert.deepEqual(controls.filter(c=>!c.reachable),[],`${id}/${width}/${style}/reference=${reference}: all primary actions reachable`)
   await page.getByTestId('library-document-menu').click()
   await page.locator('.document-menu-content').waitFor()
   await page.getByTestId('library-document-menu').click()
   await page.locator('.document-menu-content').waitFor({state:'hidden'})
   if(style==='minimal'&&reference&&(width===1000||width===640))await page.screenshot({path:resolve(output,`${id}-${width}-reference.png`)})
   results.push({id,width,height,style,reference,controls})
  }
  assert.deepEqual(errors,[],`${id}: no renderer exceptions`)
  console.log(id+': 48 combinations passed')
  await writeFile(resolve(output,'report.json'),JSON.stringify({checks:results.length,results,standalone},null,2))
  await page.close()
 }
} finally {await browser.close()}
