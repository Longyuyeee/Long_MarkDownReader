// Fixed graph, device, viewport and ordinary real wheel/pan input. IPC is simulated.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_V1111_PERF_OUTPUT||'docs/evidence/v1111-performance-before',base=process.env.LONGEDIT_V1111_URL||'http://127.0.0.1:9021'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1.25}),errors=[],results=[]
page.on('pageerror',e=>errors.push(e.message))
try{
 for(const count of [180,1200]){
  await page.goto(base+`/scripts/fixtures/v1111-graph-browser.html?count=${count}`);await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true');await page.waitForTimeout(400)
  await page.evaluate(()=>{window.__m3c2Profiler.phases={};window.__m3c2Profiler.workerPhases={}})
  const rect=await page.getByTestId('graph-canvas').boundingBox();await page.mouse.move(rect.x+rect.width*.55,rect.y+rect.height*.55)
  for(let i=0;i<30;i++){await page.mouse.wheel(0,i<15?-18:18);await page.waitForTimeout(20)}
  await page.mouse.down({button:'middle'});for(let i=0;i<30;i++){await page.mouse.move(rect.x+rect.width*.55+Math.sin(i/5)*120,rect.y+rect.height*.55+Math.cos(i/5)*60);await page.waitForTimeout(20)}await page.mouse.up({button:'middle'});await page.waitForTimeout(600)
  const sample=await page.evaluate(()=>({phases:structuredClone(window.__m3c2Profiler.phases),workerPhases:structuredClone(window.__m3c2Profiler.workerPhases),pose:document.querySelector('[data-testid="graph-canvas"]').dataset.cameraPose,motion:window.graphAudit.store.motionSpeed,stats:document.querySelector('.graph-stats').textContent}))
  const idleStart=await page.evaluate(()=>window.__m3c2Profiler.phases['canvas-draw']?.count||0);await page.waitForTimeout(600);const idleEnd=await page.evaluate(()=>window.__m3c2Profiler.phases['canvas-draw']?.count||0)
  assert.equal(sample.motion,'normal');assert.equal(idleStart,idleEnd);assert.match(sample.stats,new RegExp(`${count} / ${count}`))
  const values=[...(sample.phases['canvas-draw']?.samples||[])].sort((a,b)=>a-b);assert.ok(values.length>=30)
  results.push({count,...sample,drawSamples:values.length,drawMedianMs:values[Math.floor(values.length*.5)],drawP95Ms:values[Math.floor(values.length*.95)],idleAdditionalDraws:idleEnd-idleStart})
 }
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/results.json',JSON.stringify({scope:'same machine headless Chromium, generated graph, production Vue/Canvas/Worker, simulated IPC; no native acceptance claim',viewport:{width:1280,height:900,dpr:1.25},results,errors},null,2)+'\n');console.log(JSON.stringify(results.map(({count,drawSamples,drawMedianMs,drawP95Ms,idleAdditionalDraws})=>({count,drawSamples,drawMedianMs,drawP95Ms,idleAdditionalDraws})),null,2))
}finally{await browser.close()}
