// Exact installed-driver helpers against production Vue and tooltip policy; IPC remains simulated.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import {createRequire} from 'node:module'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
const{chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output=process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY||'docs/evidence/v1118-exact-driver-policy'
await fs.mkdir(output);const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1360,height:925}}),errors=[]
page.on('pageerror',e=>errors.push(e.message));let status='failed'
try{
 await page.goto((process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022')+'/scripts/fixtures/v1118-pptx-browser.html?tooltips');await page.locator('.slide-canvas').waitFor()
 const cdp=await page.context().newCDPSession(page),evaluate=expression=>page.evaluate(expression),ui=nativeUserInput({send:(m,p)=>cdp.send(m,p),evaluate},{timeoutMs:18000})
 const source=await fs.readFile('scripts/lib/installed-v1-1-18-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS),helpers={}
 const walk=node=>{if(ts.isVariableDeclaration(node)&&['open','select','stage','save','dialogGone','button'].includes(node.name.getText(tree)))helpers[node.name.getText(tree)]=node.initializer.getText(tree);ts.forEachChild(node,walk)};walk(tree)
 const navigate=async hash=>{await page.evaluate(value=>{void pptxAudit.router.replace('/pptx?'+value.split('?')[1])},hash);await page.locator('.slide-canvas').waitFor()}
 const run=new Function('ui','evaluate','navigate','body','count','q','path',`const button=${helpers.button},dialogGone=${helpers.dialogGone};return {open:${helpers.open},select:${helpers.select},stage:${helpers.stage},save:${helpers.save}}`)(ui,evaluate,navigate,'document.querySelector("[data-testid=c4b-text-value]")','document.querySelectorAll(".draft-labels li").length',JSON.stringify,path)
 await run.open('C:/ui/项目方案.pptx',true);await run.select(0);await run.stage('真实驱动点选与可信输入',1);await run.select(2);await run.stage('真实驱动填写备注',2);await run.save(true)
 assert.equal(await page.evaluate(()=>pptxAudit.writes.length),1);assert.equal(await page.evaluate(()=>pptxAudit.writes[0].args.operations.length),2)
 await run.open('C:/ui/项目方案.pptx');await run.select(0);await run.stage('普通保存按钮也是同一个原驱动',1);await run.save(false);assert.equal(await page.evaluate(()=>pptxAudit.writes.length),2)
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/saved-with-exact-driver.png'});status='passed';console.log('Original PPTX open/select/stage/save helpers passed trusted CDP input with the real tooltip policy; IPC simulated.')
}finally{await fs.writeFile(output+'/results.json',JSON.stringify({status,errors,nativeBridgeMocked:true,desktopInputUsed:false,helpers:['open','select','stage','save','button','dialogGone'],releaseCandidate:false},null,2)+'\n');if(status!=='passed')await page.screenshot({path:output+'/failure.png'});await browser.close()}
