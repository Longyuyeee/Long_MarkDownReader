// Real CodeMirror with mocked file IPC; never native installation evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
import {positionSource,positionDraft} from './lib/structured-source-position-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE)
const base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15989',output=process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/native-fill-undo'
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[]
const fixed=true
try{
 for(const mode of ['json','yaml','xml','toml']){
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  await page.goto(base+'/scripts/fixtures/v1312-structure-navigation-browser.html?mode='+mode)
  await page.waitForFunction(m=>document.querySelector('.'+m+'-workspace')?.dataset.analysisCurrent==='true'&&document.querySelector('.'+m+'-workspace')?.dataset.loading==='false',mode)
  const session=await page.context().newCDPSession(page)
  const send=async(method,args)=>{if(method==='Input.insertText')await page.waitForTimeout(900);return session.send(method,args)}
  const ui=nativeUserInput({send,evaluate:s=>page.evaluate(s)},{timeoutMs:10000})
  const source='.'+mode+'-workspace .cm-content',read=()=>page.evaluate(()=>structuredAudit.sourceText())
  const original=await read();assert.equal(original,positionSource(mode))
  const draft=positionDraft(mode);await ui.fill(source,draft);assert.equal(await read(),draft)
  await ui.key('z','KeyZ',90,2);const afterUndo=await read()
  checks.push({mode,afterUndoOriginal:afterUndo===original,afterUndoEmpty:afterUndo==='',replacementExact:true,delayedInputMs:900})
  assert.equal(afterUndo,original);await ui.key('y','KeyY',89,2);assert.equal(await read(),draft)
  await ui.fill(source,'');assert.equal(await read(),'');await ui.key('z','KeyZ',90,2);assert.equal(await read(),draft)
  const filter=mode==='json'?'input[aria-label="筛选字段路径"]':mode==='yaml'?'input[aria-label="筛选 YAML 结构提纲"]':'.'+mode+'-workspace aside input'
  const input=page.locator(filter).first()
  if(await input.isVisible()){await ui.fill(filter,'field00');assert.equal(await input.inputValue(),'field00');await ui.fill(filter,'field002');assert.equal(await input.inputValue(),'field002');await ui.fill(filter,'');assert.equal(await input.inputValue(),'')}
  Object.assign(checks.at(-1),{redoExact:true,emptyFillUndoExact:true})
  await page.close()
 }
 await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/native-input-harness-results.json',JSON.stringify({nativeBridgeMocked:true,checks},null,2)+'\n')
 console.log(JSON.stringify({fixed,checks}))
}finally{await browser.close()}
