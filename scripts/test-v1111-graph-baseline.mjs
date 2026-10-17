// Actual Vue/Canvas/Worker, simulated IPC. Before/after measurements are distinct from installed acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_V1111_URL||'http://127.0.0.1:9021',output=process.env.LONGEDIT_V1111_OUTPUT||'docs/evidence/v1111-baseline'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],results=[]
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
const state=()=>page.evaluate(()=>({stats:document.querySelector('.graph-stats')?.textContent,pose:document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraPose,selected:document.querySelector('[data-testid="graph-selected-node"]')?.textContent,phases:structuredClone(window.__m3c2Profiler.phases)}))
try{
 for(const [count,kind] of [[180,'connected'],[540,'orphans'],[1200,'connected']]){
  await page.goto(base+`/scripts/fixtures/v1111-graph-browser.html?count=${count}&kind=${kind}`);await page.getByTestId('graph-canvas').waitFor();await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true'&&document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraPose);await page.waitForTimeout(250)
  const search=page.getByPlaceholder('搜索节点');await search.fill(' · 17');await search.press('Enter');await page.getByTestId('graph-selected-node').waitFor();await search.fill('');await page.waitForTimeout(500)
  await page.screenshot({path:output+`/${count}-${kind}.png`});const before=await state()
  await page.evaluate(()=>window.graphAudit.refresh());await page.waitForTimeout(700);const after=await state()
  await page.evaluate(()=>{window.graphAudit.failNext=true;return window.graphAudit.refresh()});await page.waitForTimeout(150);const failed=await state()
  results.push({count,kind,before,after,failed,refreshChangedPose:before.pose!==after.pose,failedKeptResults:failed.stats?.includes(`${count} / ${count}`)})
 }
 await page.goto(base+'/scripts/fixtures/v1111-graph-browser.html?count=180&proposal=1');await page.getByTestId('graph-canvas').waitFor();await page.waitForTimeout(700);await page.screenshot({path:output+'/proposal.png'})
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({scope:'actual Vue/Canvas/Worker; simulated IPC; generated isolated graph',motion:'normal',viewport:{width:1280,height:900},results,errors},null,2)+'\n')
 console.log(JSON.stringify({results:results.map(({count,kind,refreshChangedPose,failedKeptResults})=>({count,kind,refreshChangedPose,failedKeptResults})),errors},null,2))
}finally{await browser.close()}
