// Real components reacting to a controlled native-notice fixture. Not installer proof.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),base=process.env.LONGEDIT_TEST_BASE_URL||'http://127.0.0.1:9022',output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1119-canonical-move'
await fs.mkdir(output);const browser=await chromium.launch(),report={nativeBridgeMocked:true,desktopInputUsed:false,reducedMotion:'no-preference',checks:[],errors:[]}
try{
 for(const mode of ['canvas','opml'])for(const dirty of [false,true]){
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'no-preference'});page.on('pageerror',e=>report.errors.push(String(e)))
  await page.goto(base+'/scripts/fixtures/v1119-organizing-browser.html?mode='+mode);const input=page.locator(mode==='canvas'?'.canvas-node textarea':'.inspector textarea').first();await input.waitFor();if(dirty)await input.fill('不能覆盖的草稿')
  await page.evaluate(async mode=>{const key='C:/ui/A.'+mode,file=organizingAudit.files[key];if(mode==='canvas'){const model=JSON.parse(file.content);model.nodes[0].text='整理后重新读取';file.content=JSON.stringify(model)}else file.document.roots[0].note='整理后重新读取';file.signature+='-moved';const pending=[];window.dispatchEvent(new CustomEvent('longedit:file-move-completed',{detail:{notice:{root:'\\\\?\\C:\\ui',oldPath:'\\\\?\\C:\\ui\\old.md',newPath:'\\\\?\\C:\\ui\\new.md',documents:['\\\\?\\C:\\ui\\A.'+mode]},pending}}));await Promise.all(pending)},mode)
  await page.waitForTimeout(120);const actual=await input.inputValue(),expected=dirty?'不能覆盖的草稿':'整理后重新读取';report.checks.push({mode,dirty,actual,expected,passed:actual===expected});await page.screenshot({path:output+'/'+mode+'-'+(dirty?'dirty':'clean')+'.png'});await page.close()
 }
 report.status=report.checks.every(c=>c.passed)&&!report.errors.length?'passed':'failed';await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert.equal(report.status,'passed')
}finally{await browser.close()}
