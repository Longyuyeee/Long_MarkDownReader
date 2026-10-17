import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
import {visibleMarkdownInput} from './lib/visible-markdown-input.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_EDITOR_INPUT_EVIDENCE||'docs/evidence/v1110-editor-input'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),checks=[],errors=[]
let page
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});page.on('pageerror',error=>errors.push(error.message))
 await page.goto((process.env.LONGEDIT_BROWSER_BASE_URL||'http://127.0.0.1:9020')+'/scripts/fixtures/foundation-v113-browser.html')
 await page.getByRole('link',{name:'资料库',exact:true}).click();await page.locator('[data-drop-path="C:/workflow-fixture/项目方案.md"]').click()
 const cdp=await page.context().newCDPSession(page),ui=nativeUserInput({send:(method,args)=>cdp.send(method,args),evaluate:expression=>page.evaluate(expression)},{timeoutMs:20000})
 const editor=visibleMarkdownInput('#vditor-lib'),disk=await page.evaluate(()=>window.workflowAudit.disk.get('C:/workflow-fixture/项目方案.md'))
 await page.evaluate(()=>{window.editorInputTrace=[];for(const type of ['click','keydown','input'])addEventListener(type,e=>window.editorInputTrace.push({type,trusted:e.isTrusted}),true)})
 for(const [mode,label]of [['sv','源码编辑'],['ir','即时渲染 IR'],['wysiwyg','所见即所得']]){
  await ui.click('.inline-mode');await ui.clickText('.n-dropdown-option-body__label',label)
  await ui.waitFor(`window.workflowAudit.store.editorMode===${JSON.stringify(mode)}&&(${editor})?.textContent.includes('项目方案')`,'real '+mode+' editor ready')
  await ui.clickTarget(editor);await ui.key('End','End',35,2);await cdp.send('Input.insertText',{text:'\n真实输入模式-'+mode})
  await ui.waitFor(`window.workflowAudit.store.tabs.some(t=>t.path.endsWith('项目方案.md')&&t.isDirty&&t.content.includes('真实输入模式-${mode}'))`,'actual dirty input '+mode)
  assert.equal(await page.evaluate(()=>window.workflowAudit.disk.get('C:/workflow-fixture/项目方案.md')),disk)
  await page.screenshot({path:output+'/'+mode+'.png'});checks.push({mode,actualDirty:true,diskPreserved:true})
 }
 const trace=await page.evaluate(()=>window.editorInputTrace);for(const type of ['click','keydown','input'])assert.ok(trace.some(e=>e.type===type&&e.trusted));assert.ok(trace.every(e=>e.trusted));assert.deepEqual(errors,[])
 await fs.writeFile(output+'/report.json',JSON.stringify({scope:'Real Vue/Vditor and CDP input; simulated native IPC, not installed acceptance',checks,trace,errors},null,2)+'\n');console.log('PASS: visible editor receives trusted input in all three existing modes; disk unchanged')
}catch(error){await page?.screenshot({path:output+'/failure.png'});throw error}finally{await browser.close()}
