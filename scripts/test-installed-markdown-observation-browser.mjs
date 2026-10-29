// Production Vue and real Vditor, with explicitly mocked file IPC.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {installedMarkdownValueExpression} from './lib/installed-markdown-observation.mjs'
import {linkSourceText,linkSourceAddition,linkSourceDraft} from './lib/link-source-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.LONGEDIT_PRODUCTION_BROWSER_BASE||'http://127.0.0.1:15990',output=process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/markdown-observation',checks=[]
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']})
try{
 for(const mode of ['wysiwyg','ir','sv'])for(const crlf of [false,true]){
  console.log('Production observation',mode,crlf?'CRLF':'LF')
  const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v1314-library-links-browser.html?editor='+mode+'&crlf='+(crlf?'1':'0'))
  const selector=mode==='sv'?'#vditor-lib .vditor-sv':`#vditor-lib .vditor-${mode} > pre`
  await page.locator(selector).waitFor({state:'visible'});await page.waitForFunction(()=>typeof window.Lute?.New==='function')
  const value=()=>page.evaluate(installedMarkdownValueExpression)
  await page.waitForFunction(({expression,text})=>eval(expression)?.trimEnd()===text.trimEnd(),{expression:installedMarkdownValueExpression,text:linkSourceText})
  const baseline=await value();assert.equal(baseline.trimEnd(),linkSourceText.trimEnd())
  const privateInstanceAbsent=await page.evaluate(()=>{let vm=document.querySelector('#vditor-lib').__vueParentComponent;while(vm&&!vm.setupState?.vditor)vm=vm.parent;return !vm?.setupState?.vditor});assert.equal(privateInstanceAbsent,true)
  await page.locator(selector).click({position:{x:12,y:12}});await page.keyboard.press('Control+End');await page.keyboard.insertText(linkSourceAddition);await page.waitForTimeout(1100)
  const draft=await page.evaluate(()=>shellAudit.store.tabs.find(t=>t.id===shellAudit.store.activeTabId).content)
  assert.equal(await value(),draft);assert.ok(draft.startsWith(linkSourceText.trimEnd())&&draft.includes(linkSourceAddition));if(mode==='wysiwyg')assert.equal(draft,linkSourceDraft)
  await page.keyboard.press('Control+z');await page.waitForTimeout(1000);assert.equal(await value(),baseline)
  await page.keyboard.press('Control+y');await page.waitForTimeout(1000);assert.equal(await value(),draft);assert.deepEqual(errors,[])
  checks.push({mode,crlf,privateInstanceAbsent,initialBodyExact:true,draftExact:true,undoRedoExact:true,runtimeErrors:errors});await page.close()
 }
 await mkdir(output,{recursive:true});await writeFile(output+'/production-markdown-observation.json',JSON.stringify({status:'passed',productionVue:true,nativeBridgeMocked:true,checks},null,2)+'\n');console.log('Production Markdown observation: six mode/line-ending combinations passed')
}finally{await browser.close()}
