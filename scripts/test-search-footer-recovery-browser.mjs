// Actual Vue with isolated simulated IPC. Real native proof is separate.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_SEARCH_UI_OUTPUT;assert.ok(output)
await fs.mkdir(output,{recursive:false})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1000,height:700}})
const errors=[],checks=[],layouts=[],observations=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000)
const actionability=button=>button.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})
try{
  await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9018')+'/scripts/fixtures/v118-search-pages-browser.html')
  await page.getByRole('link',{name:'资料库',exact:true}).click()
  for(const channel of ['library','palette']){
    const scope=page.locator(channel==='library'?'.knowledge-search-results':'.command-palette-container')
    if(channel==='palette'){await page.keyboard.press('Control+p');await scope.waitFor()}
    const input=channel==='library'?page.getByPlaceholder('搜索文件与正文'):scope.getByRole('textbox',{name:'搜索资料或命令'})
    await input.fill('预算');await page.waitForFunction(selector=>document.querySelectorAll(selector+' .search-file-card').length===40,channel==='library'?'.knowledge-search-results':'.command-palette-container')
    await page.evaluate(()=>{window.workflowAudit.pageFault='busy'})
    await scope.getByRole('button',{name:'加载更多文件',exact:true}).click()
    await scope.locator('.search-page-error').waitFor()
    // Do not scroll to a recovery control before checking it: the actual bug
    // is whether the user can see a next action at the existing page bottom.
    assert.equal(await scope.locator('.search-page-retry').count(),1,'footer must offer recovery where the user requested more files')
    assert.equal(await actionability(scope.locator('.search-page-retry')),true,'footer retry must be in the viewport without an extra scroll')
    assert.equal(await scope.locator('.search-file-card').count(),40)
    await page.screenshot({path:output+'/'+channel+'-visible-retry.png'})
    const failedCursor=await page.evaluate(()=>window.workflowAudit.pageCalls.at(-1).request.cursor)
    for(const style of ['soft','neo','glass','airy','minimal','sharp'])for(const width of channel==='library'?[1000,1280]:[480,1000]){
      await page.setViewportSize({width,height:700})
      await page.evaluate(style=>{const s=window.workflowAudit.store;s.visualStyle=style;s.theme=style==='glass'?'dark':'white';document.documentElement.dataset.style=style},style)
      await scope.locator('.search-page-retry').scrollIntoViewIfNeeded()
      assert.equal(await actionability(scope.locator('.search-page-retry')),true)
      assert.equal(await scope.locator('.search-page-actions').evaluate(e=>e.scrollWidth>e.clientWidth+1),false)
      layouts.push({channel,style,width})
    }
    await scope.locator('.search-page-retry').click()
    await page.waitForFunction(selector=>document.querySelectorAll(selector+' .search-file-card').length===80,channel==='library'?'.knowledge-search-results':'.command-palette-container')
    assert.equal(await page.evaluate(()=>window.workflowAudit.pageCalls.at(-1).request.cursor),failedCursor,'busy recovery retries the same issued cursor')
    assert.equal(await scope.locator('.search-page-retry').count(),0)
    checks.push(channel+': original footer position has an actionable retry, keeps 40 cards, then appends the same cursor to 80')
    await page.setViewportSize({width:1000,height:700})
    await page.evaluate(()=>{window.workflowAudit.pageFault='expired'})
    await scope.getByRole('button',{name:'加载更多文件',exact:true}).click();await scope.locator('.search-page-error').waitFor()
    assert.equal(await scope.locator('.search-page-retry').textContent(),'重新搜索')
    assert.equal(await actionability(scope.locator('.search-page-retry')),true)
    await page.screenshot({path:output+'/'+channel+'-visible-restart.png'})
    const callsBeforeRestart=await page.evaluate(()=>window.workflowAudit.pageCalls.length)
    await scope.locator('.search-page-retry').click()
    await page.waitForFunction(selector=>document.querySelectorAll(selector+' .search-file-card').length===80&&!document.querySelector(selector+' [aria-busy="true"]'),channel==='library'?'.knowledge-search-results':'.command-palette-container')
    const restartCalls=await page.evaluate(index=>window.workflowAudit.pageCalls.slice(index),callsBeforeRestart)
    assert.equal(restartCalls.length,2);assert.equal(restartCalls[0].request.cursor,null)
    assert.notEqual(restartCalls[1].request.cursor,failedCursor,'expired recovery must not reuse the old session')
    observations.push({channel,failedCursor,loadedAfterRetry:80,restartCalls,loadedAfterRestart:80,retryVisibleWithoutRecoveryScroll:true,restartVisibleWithoutRecoveryScroll:true})
    checks.push(channel+': footer expiration action starts an explicit fresh search and restores 80-file depth')
    if(channel==='palette')await page.keyboard.press('Escape')
  }
  assert.deepEqual(errors,[])
  await fs.writeFile(output+'/report.json',JSON.stringify({scope:'actual Vue footer recovery with simulated IPC, not Wry/installer acceptance',checks,layouts,observations,errors},null,2)+'\n')
  console.log(JSON.stringify({checks:checks.length,layouts:layouts.length,errors:errors.length}))
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});const observation=await page.evaluate(()=>({calls:window.workflowAudit.pageCalls,closes:window.workflowAudit.pageCloses,errors:[...document.querySelectorAll('.search-page-error')].map(e=>e.textContent),counts:[...document.querySelectorAll('.knowledge-search-results,.command-palette-container')].map(e=>e.querySelectorAll('.search-file-card').length)})).catch(()=>null);await fs.writeFile(output+'/failure.json',JSON.stringify({error:String(error),checks,layouts,errors,observation},null,2)+'\n');throw error}
finally{await browser.close()}
