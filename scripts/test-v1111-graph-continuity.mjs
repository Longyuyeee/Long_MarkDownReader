// Real production component and real input; graph data/IPC are explicitly simulated.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_V1111_CONTINUITY_OUTPUT||'docs/evidence/v1111-continuity',base=process.env.LONGEDIT_V1111_URL||'http://127.0.0.1:9021'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[]
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(18000)
const pose=()=>page.getByTestId('graph-canvas').getAttribute('data-camera-pose')
const open=async()=>{await page.goto(base+'/scripts/fixtures/v1111-graph-browser.html?count=180');await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true'&&document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraPose);await page.waitForTimeout(300)}
const select=async()=>{const input=page.getByPlaceholder('搜索节点');await input.fill(' · 17');await input.press('Enter');await page.getByTestId('graph-selected-node').waitFor();await input.fill('');await page.waitForTimeout(450)}
const check=async(name,fn)=>{await fn();checks.push(name)}
try{
 await open();await select()
 await check('same-library success preserves camera, selected identity and changed native metadata',async()=>{
  const before=await pose();await page.evaluate(()=>{window.graphAudit.graphs.get('C:/graph-a').nodes[17].title='更新后的阅读摘录 · 17';return window.graphAudit.refresh()});await page.waitForTimeout(500)
  assert.equal(await pose(),before);assert.match(await page.getByTestId('graph-selected-node').innerText(),/更新后的阅读摘录/)
 })
 await check('failed refresh is not empty and does not move the selected view',async()=>{
  const before=await pose();await page.evaluate(()=>{window.graphAudit.failNext=true;return window.graphAudit.refresh()});await page.waitForTimeout(300)
  assert.match(await page.locator('.graph-stats').innerText(),/180\s*\/\s*180/);assert.equal(await pose(),before);assert.match(await page.getByTestId('graph-selected-node').innerText(),/更新后的阅读摘录/)
  await page.screenshot({path:output+'/failed-retained.png'})
 })
 await check('same-root late success cannot overwrite a newer success or clear its pending state',async()=>{
  await page.evaluate(()=>{window.graphAudit.deferNext=true;return window.graphAudit.refresh()});await page.waitForFunction(()=>window.graphAudit.pending.length===1)
  await page.evaluate(()=>{window.graphAudit.graphs.get('C:/graph-a').nodes[17].title='最新请求 · 17';return window.graphAudit.refresh()});await page.waitForTimeout(200)
  await page.evaluate(()=>{window.graphAudit.graphs.get('C:/graph-a').nodes[17].title='迟到旧请求 · 17';window.graphAudit.resolve(0)});await page.waitForTimeout(200)
  assert.match(await page.getByTestId('graph-selected-node').innerText(),/最新请求/)
 })
 await check('late previous-root response cannot reintroduce old data or selection in another library',async()=>{
  await page.evaluate(()=>{window.graphAudit.deferNext=true;return window.graphAudit.refresh()});await page.waitForFunction(()=>window.graphAudit.pending.length===2)
  await page.evaluate(()=>window.graphAudit.switchRoot('C:/graph-b'));await page.waitForTimeout(400);assert.equal(await page.getByTestId('graph-selected-node').count(),0)
  await select();assert.match(await page.getByTestId('graph-selected-node').innerText(),/另一资料库/)
  await page.evaluate(()=>window.graphAudit.resolve(1));await page.waitForTimeout(250);assert.match(await page.getByTestId('graph-selected-node').innerText(),/C:\/graph-b/)
  await page.screenshot({path:output+'/cross-library.png'})
 })
 await check('late error cannot erase a successful newer graph',async()=>{
  await page.evaluate(()=>{window.graphAudit.deferNext=true;return window.graphAudit.refresh()});await page.waitForFunction(()=>window.graphAudit.pending.length===3)
  await page.evaluate(()=>window.graphAudit.refresh());await page.waitForTimeout(200);const before=await pose()
  await page.evaluate(()=>window.graphAudit.resolve(2,true));await page.waitForTimeout(200);assert.equal(await pose(),before);assert.match(await page.locator('.graph-stats').innerText(),/180\s*\/\s*180/)
 })
 await check('mindmap refresh retains its dragged view, current root and mode',async()=>{
  await page.getByRole('button',{name:'思维导图',exact:true}).click();await page.waitForTimeout(300)
  const canvas=page.getByTestId('graph-canvas'),box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+box.width*.7+64,box.y+box.height*.7+36,{steps:5});await page.mouse.up({button:'middle'});await page.waitForTimeout(120)
  const before=await pose();await page.evaluate(()=>window.graphAudit.refresh());await page.waitForTimeout(300);assert.equal(await pose(),before);assert.match(await page.locator('.mindmap-root').innerText(),/17/)
 })
 await check('removed selected node does not keep a stale details object',async()=>{
  await page.evaluate(()=>{const a=window.graphAudit.graphs.get('C:/graph-b');a.nodes=a.nodes.filter(n=>n.id!=='n17');a.edges=a.edges.filter(e=>e.source!=='n17'&&e.target!=='n17');return window.graphAudit.refresh()});await page.waitForTimeout(350)
  assert.equal(await page.getByTestId('graph-selected-node').count(),0);assert.match(await page.locator('.graph-stats').innerText(),/\/\s*179 节点/)
 })
 await check('unmounted response is discarded without global errors',async()=>{
  await page.evaluate(()=>{window.graphAudit.deferNext=true;return window.graphAudit.refresh()});await page.waitForFunction(()=>window.graphAudit.pending.length===4)
  await page.evaluate(()=>{window.graphAudit.unmount();window.graphAudit.resolve(3)});await page.waitForTimeout(200);assert.equal(await page.getByTestId('graph-container').count(),0)
 })
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({scope:'production Vue/Canvas/Worker + simulated IPC; not installed acceptance',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks,errors},null,2))
}catch(e){await page.screenshot({path:output+'/failure.png'});await fs.writeFile(output+'/failure.json',JSON.stringify({checks,errors,message:e.stack},null,2)+'\n');throw e}finally{await browser.close()}
