// Real production graph/input, simulated graph IPC; not installed evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createServer} from 'vite'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1137-graph-overlap-development'
await fs.mkdir(output,{recursive:true})
const server=await createServer({server:{host:'127.0.0.1',port:9138,strictPort:true}})
let browser
try{
 await server.listen();browser=await chromium.launch({args:['--no-proxy-server']})
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
 page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(20000)
 await page.goto('http://127.0.0.1:9138/scripts/fixtures/v1111-graph-browser.html?count=180&overlap=1',{waitUntil:'domcontentloaded',timeout:90000})
 await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true',{},{timeout:90000})
 const input=page.getByPlaceholder('搜索节点')
 await input.fill('C:/graph-a/资料17.md');await input.press('Enter')
 await page.getByTestId('graph-selected-node').waitFor();await input.fill('')
 await page.waitForFunction(()=>document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionState==='completed')
 const point=await page.getByTestId('graph-canvas').evaluate(canvas=>{const r=canvas.getBoundingClientRect(),pose=JSON.parse(canvas.dataset.cameraPose),focus=JSON.parse(canvas.dataset.cameraFocusDiagnostics);return{x:r.x+pose.x+focus.point.x*pose.zoom,y:r.y+pose.y+focus.point.y*pose.zoom}})
 await page.mouse.click(point.x,point.y)
 assert.equal(await page.getByTestId('graph-selected-node').getAttribute('data-node-id'),'n17')
 assert.equal(await page.evaluate(()=>window.graphAudit.router.currentRoute.value.name),'Graph')
 await page.screenshot({path:output+'/selected-nearest.png'})
 await page.mouse.dblclick(point.x,point.y)
 await page.waitForFunction(()=>window.graphAudit.router.currentRoute.value.name==='LibraryMode')
 assert.equal(await page.evaluate(()=>window.graphAudit.router.currentRoute.value.query.path),'C:/graph-a/资料17.md')
 assert.deepEqual(errors,[])
 const result={status:'passed',nativeBridgeMocked:true,motion:'normal',checks:['Overlapping target selects the nearest actual node instead of the earlier file','Single click stays in the graph','Double click opens the intended managed file'],errors}
 await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
}finally{await browser?.close();await server.close()}
