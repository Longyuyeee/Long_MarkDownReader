// Actual production components and trusted browser input; generated data / simulated IPC only.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_V1111_HEALTH_OUTPUT||'docs/evidence/v1111-health-handoff-before',base=process.env.LONGEDIT_V1111_URL||'http://127.0.0.1:9021'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),checks=[],errors=[]
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000)
const selected=()=>page.getByTestId('graph-selected-node'),topic=()=>page.getByTestId('knowledge-network-topic'),canvas=()=>page.getByTestId('graph-canvas')
try{
 await page.goto(base+'/scripts/fixtures/v1111-graph-browser.html?count=180&health=1&deferInitial=1');await topic().waitFor()
 assert.equal(await page.getByTestId('graph-refresh').isDisabled(),true)
 await topic().click();await page.screenshot({path:output+'/clicked-during-load.png'})
 await page.evaluate(()=>window.graphAudit.resolve(0));await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true')
 await selected().waitFor();assert.equal(await selected().getAttribute('data-node-id'),'n17');assert.equal(await page.evaluate(()=>window.graphAudit.router.currentRoute.value.query.root),'n17')
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="graph-canvas"]').dataset.cameraFocusDiagnostics||'{}').nodeId==='n17')
 await page.screenshot({path:output+'/focused-after-load.png'});checks.push('trusted topic click during initial load is applied to the loaded node and camera')
 await page.getByRole('button',{name:'关闭知识图谱治理',exact:true}).click();await page.locator('.health-panel').waitFor({state:'hidden'});await page.screenshot({path:output+'/focused-inspector.png'})
 await selected().getByRole('button',{name:'关闭节点详情'}).click();await page.getByTestId('graph-tools-entry').click();await page.locator('.graph-tools-health').click();await topic().click();assert.equal(await selected().getAttribute('data-node-id'),'n17');checks.push('ready graph topic selection still works')
 await page.getByRole('button',{name:'关闭知识图谱治理',exact:true}).click()
 // A route root is an entry instruction, not an instruction to reset every later refresh.
 await page.getByPlaceholder('搜索节点').fill(' · 18');await page.getByPlaceholder('搜索节点').press('Enter');await page.getByPlaceholder('搜索节点').fill('');await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionState!=='running');await page.waitForTimeout(100)
 const before=await canvas().getAttribute('data-camera-pose');await page.getByTestId('graph-refresh').click();await page.waitForFunction(()=>!document.querySelector('[data-testid="graph-refresh"]').disabled);assert.equal(await selected().getAttribute('data-node-id'),'n18');assert.equal(await canvas().getAttribute('data-camera-pose'),before);checks.push('later user selection and camera are not reset to old route root on refresh')
 await page.goto(base+'/scripts/fixtures/v1111-graph-browser.html?count=180&health=1&deferInitial=1');await topic().waitFor();await topic().click()
 await page.evaluate(()=>{const b=window.graphAudit.graphs.get('C:/graph-b');for(const n of b.nodes)n.id='b'+n.id;for(const e of b.edges){e.source='b'+e.source;e.target='b'+e.target}window.graphAudit.switchRoot('C:/graph-b')})
 await page.waitForFunction(()=>!document.querySelector('[data-testid="graph-refresh"]').disabled);await page.evaluate(()=>window.graphAudit.resolve(0));await page.waitForTimeout(250);assert.equal(await selected().count(),0);checks.push('pending old-library topic and late graph do not select a node in another library')
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/results.json',JSON.stringify({scope:'production GraphView and GraphHealthPanel; generated data, simulated IPC, no installed acceptance',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks,errors},null,2))
}catch(error){await page.screenshot({path:output+'/failure.png'});await fs.writeFile(output+'/failure.json',JSON.stringify({checks,errors,error:error.stack},null,2)+'\n');throw error}finally{await browser.close()}
