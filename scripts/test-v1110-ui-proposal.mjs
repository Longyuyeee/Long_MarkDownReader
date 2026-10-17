import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const root=process.env.LONGEDIT_V1110_URL||'http://127.0.0.1:9020',output='docs/evidence/v1110-ui-proposal'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1180,height:850}}),errors=[],checks=[]
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(root+'/docs/design/v1110-tags-collections.html')
 await page.screenshot({path:output+'/collections-wide.png',fullPage:true})
 await page.locator('#more').click();assert.match(await page.locator('#count').textContent(),/80 \/ 244/);checks.push('continuation count is files, not mixed hit count')
 await page.locator('[data-mode="refresh"]').click();await page.screenshot({path:output+'/refresh-wide.png',fullPage:true});assert.equal(await page.locator('.file').count(),3);await page.locator('#retry').click();assert.equal(await page.locator('#state').isVisible(),false);checks.push('refresh recovery retains current cards')
 await page.locator('[data-mode="tags"]').click();await page.locator('#manage').click();await page.screenshot({path:output+'/tags-wide.png',fullPage:true});assert.equal(await page.locator('.dialog input[type=checkbox]:disabled').count(),1);await page.locator('#apply').click();assert.equal(await page.locator('#result').isVisible(),true);checks.push('explicit batch preview, dirty exclusion and item outcome stay in one optional dialog')
 for(const width of [360,1180]){await page.setViewportSize({width,height:width===360?720:850});await page.emulateMedia({colorScheme:width===360?'light':'dark'});await page.screenshot({path:output+'/tags-'+width+(width===360?'-light':'-dark')+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/report.json',JSON.stringify({scope:'design proposal only, not production or native acceptance',checks,errors},null,2)+'\n')
 console.log(JSON.stringify({checks:checks.length,errors:errors.length}))
}finally{await browser.close()}
