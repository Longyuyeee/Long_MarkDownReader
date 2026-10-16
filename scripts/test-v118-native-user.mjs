// Driver/schema unit contracts only. Not saved as real runtime acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
import {nativeUserChecks,verifyNativeUserEvidence} from './lib/v118-native-user-evidence.mjs'
import {nativeSearchProduct} from './lib/v118-native-search-fixture.mjs'
test('CDP input waits for an unobscured target and never calls a DOM handler',async()=>{
  const calls=[],expressions=[]
  const ui=nativeUserInput({send:async(method,args)=>calls.push({method,args}),evaluate:async expression=>{expressions.push(expression);return {x:10,y:20}}},{timeoutMs:5,pollMs:1})
  await ui.click('button[aria-label="加载更多文件"]')
  assert.deepEqual(calls.map(call=>call.args.type),['mousePressed','mouseReleased'])
  assert.ok(calls.every(call=>call.method==='Input.dispatchMouseEvent'))
  assert.ok(expressions.every(expression=>expression.includes('elementFromPoint')&&!expression.includes('.click(')))
  const blocked=nativeUserInput({send:async()=>assert.fail('blocked target cannot receive input'),evaluate:async()=>null},{timeoutMs:1,pollMs:1})
  await assert.rejects(()=>blocked.click('#blocked'),/did not become ready/)
})
test('typing and Enter use real WebView input phases without setting DOM values',async()=>{
  const calls=[]
  const ui=nativeUserInput({send:async(method,args)=>calls.push({method,args}),evaluate:async expression=>expression.includes('activeElement')?true:{x:5,y:5}})
  await ui.fill('input','我想找正式预算');await ui.key('Enter','Enter',13)
  assert.ok(calls.some(call=>call.method==='Input.insertText'&&call.args.text==='我想找正式预算'))
  assert.ok(calls.some(call=>call.args.key==='a'&&call.args.modifiers===2))
  assert.ok(calls.some(call=>call.args.key==='Enter'&&call.args.type==='keyDown'&&call.args.text==='\r'))
})
test('native user driver is hosted-only, real-bridge and actionability based',()=>{
  const source=fs.readFileSync('scripts/capture-v118-native-user.mjs','utf8'),helper=fs.readFileSync('scripts/lib/v118-native-user-input.mjs','utf8')
  assert.ok(source.indexOf('assertHostedSearchAudit()')<source.indexOf('await fs.readFile'))
  // ui.click is our actionability-checked CDP helper, not HTMLElement.click.
  assert.doesNotMatch(source.replaceAll('ui.click(', 'ui.pointerInput(')+helper,/__TAURI_INTERNALS__\.invoke\s*=|\.dispatchEvent\(|\.click\(|\.focus\(/)
  assert.doesNotMatch(source,/invoke\(['"](?:search_|write_|save_|read_text_document)/)
  assert.ok(source.includes('dirty:t.isDirty')&&source.includes('hash(originals.get(draftPath))'))
  assert.ok(source.includes('do not overwrite an unexpected fixture edit'))
  const runner=fs.readFileSync('scripts/run-v118-native-search.ps1','utf8')
  assert.ok(runner.includes("@('baseline','disk','user')"))
  for(const text of [source,helper])assert.doesNotMatch(text,/\.(?:isDirty|content|value)\s*=(?!=)/)
})
function evidence(){
  const run={status:'completed',conclusion:'success',headSha:'a'.repeat(40)},baseline={productCommit:nativeSearchProduct,harnessCommit:run.headSha,executableSha256:'b'.repeat(64)}
  const user={...baseline,status:'passed',phase:'user',evidenceLevel:'actual-wry-webview-input-events-generated-disk-not-installed',runtimeBaseVersion:'1.1.7',sourceUserContentIncluded:false,nativeBridgeMocked:false,desktopInputUsed:false,checks:[...nativeUserChecks],runtimeErrors:[],uiObservation:{errorOverlay:false},inputTrace:['click','keydown','input'].map(type=>({type,trusted:true})),initialFiles:80,refreshFiles:80,pdf:{annotationId:'批注-3',page:1,comment:'预算位置3'},sourceFiles:['zz-项目预算.md','a-0001-记录.md','多批注.pdf','多批注.pdf.annotations.json'].map(name=>({name,before:'c'.repeat(64),after:'c'.repeat(64)})),draftContentSha256:'d'.repeat(64),draftChecks:Array.from({length:5},()=>({name:'zz-项目预算.md',dirty:true,contentSha256:'d'.repeat(64)}))}
  return {run,baseline,user}
}
test('user validator keeps new program identity and input evidence separate from IPC-only proof',()=>{
  const e=evidence();assert.equal(verifyNativeUserEvidence(e.user,e.baseline,e.run).userChecks,6)
})
test('user validator rejects unfinished runs, fake input, missing tasks, locator and source drift',()=>{
  for(const mutate of [e=>e.run.status='in_progress',e=>e.run.conclusion='failure',e=>e.user.productCommit='d'.repeat(40),e=>e.user.executableSha256='d'.repeat(64),e=>e.user.evidenceLevel='installed',e=>e.user.nativeBridgeMocked=true,e=>e.user.desktopInputUsed=true,e=>e.user.checks.pop(),e=>e.user.inputTrace[2].trusted=false,e=>e.user.pdf.annotationId='wrong',e=>e.user.sourceFiles[0].after='d'.repeat(64),e=>e.user.sourceFiles[1]=e.user.sourceFiles[0],e=>e.user.sourceFiles[0].name='unrelated',e=>e.user.draftChecks[0].dirty=false,e=>e.user.draftChecks[0].contentSha256='e'.repeat(64),e=>e.user.uiObservation.errorOverlay=true]){
    const e=evidence();mutate(e);assert.throws(()=>verifyNativeUserEvidence(e.user,e.baseline,e.run))
  }
})
