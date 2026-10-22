import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chooseInstalledMarkdownMode } from './lib/installed-markdown-mode.mjs'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({headless:true,channel:process.env.LONGEDIT_BROWSER_CHANNEL||undefined,args:['--no-proxy-server']})
try {
  for(const [width,height,reference] of [[1280,820,false],[1280,820,true],[640,480,false]]) {
    const page=await browser.newPage({viewport:{width,height}})
    await page.route('**/scripts/fixtures/vditor/**',route=>route.continue({url:route.request().url().replace('/scripts/fixtures/vditor/','/vditor/')}))
    await page.goto('http://127.0.0.1:15941/scripts/fixtures/full-window-review-browser.html?fixture=library-shell&surface=page',{waitUntil:'domcontentloaded',timeout:90000})
    await page.waitForFunction(()=>window.fullWindowAudit?.ready)
    await page.locator('#vditor-lib [contenteditable=true]:visible').first().waitFor()
    if(reference){await page.getByTestId('library-reference-toggle').click();await page.locator('#library-reference').waitFor()}
    const session=await page.context().newCDPSession(page)
    const controls={send:(method,args)=>session.send(method,args),evaluate:expression=>page.evaluate(expression)}
    for(const mode of ['sv','wysiwyg','ir']) {
      await chooseInstalledMarkdownMode(controls,mode)
      await page.waitForFunction(mode=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app').editorMode===mode,mode)
      assert.equal(await page.locator('.document-menu-content:visible').count(),0)
    }
    console.log(JSON.stringify({width,height,reference,modes:3,status:'passed'}))
    await page.close()
  }
} finally { await browser.close() }


