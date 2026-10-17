import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_V1111_UI_OUTPUT||'docs/evidence/v1111-formal-ui',base=process.env.LONGEDIT_V1111_URL||'http://127.0.0.1:9021'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),checks=[],errors=[],styles=[]
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
const canvas=page.getByTestId('graph-canvas'),pose=()=>canvas.getAttribute('data-camera-pose')
const readLabels=()=>canvas.evaluate(el=>JSON.parse(el.dataset.labelDiagnostics||'[]'))
const open=async(count=180)=>{await page.goto(base+`/scripts/fixtures/v1111-graph-browser.html?count=${count}`);await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true');await page.waitForTimeout(300)}
const check=async(name,fn)=>{await fn();checks.push(name)}
try{
 await open(1200)
 await check('dense search focuses an actual node, retains long active name and resolves label collisions',async()=>{
  const input=page.getByPlaceholder('搜索节点');await input.fill(' · 17');await input.press('Enter');await page.getByTestId('graph-selected-node').waitFor();await input.fill('');await page.waitForTimeout(500)
  assert.equal(await canvas.getAttribute('data-community-summary-count'),'0')
  const labels=await readLabels();assert.ok(labels.some(l=>l.id==='n17'&&l.text.length>10));assert.ok(labels.length<=36)
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];assert.equal(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,false)}
  await page.screenshot({path:output+'/dense-selected.png'})
 })
 await check('refresh button, non-blocking progress and pending user pan stay usable',async()=>{
  await page.evaluate(()=>{window.graphAudit.deferNext=true});await page.getByTestId('graph-refresh').click();await page.getByTestId('graph-refresh-status').waitFor()
  assert.equal(await page.locator('.graph-loading').count(),0);assert.equal(await page.getByTestId('graph-refresh').isDisabled(),true)
  const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.2);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+box.width*.5+55,box.y+box.height*.2+30,{steps:6});await page.mouse.up({button:'middle'});await page.waitForTimeout(100)
  const before=await pose();await page.evaluate(()=>window.graphAudit.resolve(0));await page.waitForTimeout(300);assert.equal(await pose(),before)
 })
 await check('failure shows retained results and a real retry action',async()=>{
  await page.evaluate(()=>{window.graphAudit.failNext=true});const before=await pose();await page.getByTestId('graph-refresh').click();await page.getByTestId('graph-refresh-error').waitFor();assert.equal(await pose(),before)
  assert.match(await page.locator('.graph-stats').innerText(),/1200\s*\/\s*1200/);await page.screenshot({path:output+'/refresh-error.png'})
  await page.getByTestId('graph-refresh-error').getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-testid="graph-refresh-error"]'));assert.equal(await pose(),before)
 })
 await check('local neighbor exploration refreshes in place and returns to its previous camera',async()=>{
  const before=JSON.parse(await pose());await page.getByRole('button',{name:'聚焦直接邻居',exact:true}).click();await page.getByTestId('graph-neighbor-focus').waitFor();await page.waitForTimeout(250)
  await page.getByTestId('graph-refresh').click();await page.waitForTimeout(250);await page.screenshot({path:output+'/local-neighbors.png'})
  await page.getByTestId('graph-neighbor-focus-return').click();await page.waitForTimeout(550);const after=JSON.parse(await pose());assert.ok(Math.abs(after.x-before.x)<.01&&Math.abs(after.y-before.y)<.01&&Math.abs(after.zoom-before.zoom)<.001)
 })
 for(const style of ['soft','neo','glass','airy','minimal','sharp']){
  await page.evaluate(style=>{window.graphAudit.store.visualStyle=style},style)
  for(const theme of ['white','dark']){
   await page.evaluate(theme=>{window.graphAudit.store.theme=theme},theme);await page.waitForTimeout(80);await page.screenshot({path:output+`/${style}-${theme}.png`});styles.push({style,theme})
  }
 }
 checks.push('six actual style attributes and light/dark themes rendered with ordinary motion')
 for(const [width,height] of [[760,620],[480,800],[480,620]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(160)
  assert.ok(await page.getByPlaceholder('搜索节点').isVisible());await page.getByTestId('graph-refresh').scrollIntoViewIfNeeded();assert.ok(await page.getByTestId('graph-refresh').isVisible())
  await page.evaluate(()=>{window.graphAudit.failNext=true});await page.getByTestId('graph-refresh').click();await page.getByTestId('graph-refresh-error').getByRole('button',{name:'重试',exact:true}).click();await page.waitForTimeout(150)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
  assert.equal(await page.getByRole('button',{name:'关闭节点详情'}).evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true)
  await page.screenshot({path:output+`/narrow-${width}-${height}.png`})
 }
 checks.push('short/narrow search, refresh, retry remain reachable without page overflow')
 await page.setViewportSize({width:1280,height:900});await open()
 await check('ordinary background drag preserves selection; a genuine blank click clears it',async()=>{
  const input=page.getByPlaceholder('搜索节点');await input.fill(' · 17');await input.press('Enter');await input.fill('');await page.waitForTimeout(500)
  const box=await canvas.boundingBox();await page.mouse.move(box.x+12,box.y+12);await page.mouse.down();await page.mouse.move(box.x+82,box.y+42,{steps:6});await page.mouse.up();await page.waitForTimeout(100);assert.equal(await page.getByTestId('graph-selected-node').count(),1)
  await page.mouse.click(box.x+12,box.y+12);await page.waitForTimeout(100);assert.equal(await page.getByTestId('graph-selected-node').count(),0)
 })
 await check('single node click selects without navigation, double click opens its real managed route',async()=>{
  const input=page.getByPlaceholder('搜索节点');await input.fill(' · 17');await input.press('Enter');await input.fill('');await page.waitForTimeout(500)
  const data=await canvas.evaluate(el=>({pose:JSON.parse(el.dataset.cameraPose),focus:JSON.parse(el.dataset.cameraFocusDiagnostics),rect:{x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y}}))
  const x=data.rect.x+data.pose.x+data.focus.point.x*data.pose.zoom,y=data.rect.y+data.pose.y+data.focus.point.y*data.pose.zoom
  await page.mouse.click(x,y);assert.equal(await page.evaluate(()=>window.graphAudit.router.currentRoute.value.name),'Graph')
  await page.mouse.dblclick(x,y);await page.waitForFunction(()=>window.graphAudit.router.currentRoute.value.name==='LibraryMode');assert.match(await page.evaluate(()=>window.graphAudit.router.currentRoute.value.query.path),/资料17\.md$/)
 })
 await open()
 await check('initial failure is distinct from a valid empty graph and can retry',async()=>{
  await page.evaluate(()=>{window.graphAudit.failNext=true;window.graphAudit.switchRoot('C:/graph-b')});await page.getByTestId('graph-initial-error').waitFor();assert.equal(await page.locator('.empty-graph-hint').count(),0);await page.screenshot({path:output+'/initial-error.png'});await page.getByTestId('graph-initial-error').getByRole('button',{name:'重新读取',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-testid="graph-initial-error"]'));assert.match(await page.locator('.graph-stats').innerText(),/180\s*\/\s*180/)
 })
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/results.json',JSON.stringify({scope:'production GraphView; generated isolated data and simulated IPC, not native/installed',checks,styles,errors},null,2)+'\n');console.log(JSON.stringify({checks,styles:styles.length,errors},null,2))
}catch(error){await page.screenshot({path:output+'/failure.png'});await fs.writeFile(output+'/failure.json',JSON.stringify({checks,styles,errors,error:error.stack},null,2)+'\n');throw error}finally{await browser.close()}
