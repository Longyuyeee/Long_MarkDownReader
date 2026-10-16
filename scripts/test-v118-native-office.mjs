// Synthetic schemas and owned disk fixtures only, never native acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {createNativeOfficeFixture,officeFixtureSpecs,officeHash,officePathKey} from './lib/v118-native-office-fixture.mjs'
import {nativeOfficeChecks,officeMatchTarget,officeRouteQuery} from './lib/v118-native-office-input.mjs'
import {verifyNativeOfficeEvidence} from './lib/v118-native-office-evidence.mjs'
import {nativeSearchProduct} from './lib/v118-native-search-fixture.mjs'

test('Office uses three immutable real-format files and exclusive owned copies, not simulated parse reports',async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'longedit-v118-office-unit-')),root=path.join(parent,'longedit-v118-native-office')
  try{
    await fs.mkdir(root)
    await assert.rejects(()=>createNativeOfficeFixture(root,process.cwd()),{code:'ENOENT'})
    await fs.writeFile(path.join(root,'.v118-native-owner'),JSON.stringify({kind:'generated-search-fixture',nonce:crypto.randomUUID()}),{flag:'wx'})
    await fs.mkdir(path.join(root,'项目 & 资料'))
    const files=await createNativeOfficeFixture(root,process.cwd());assert.equal(files.length,3)
    for(const file of files){assert.equal(officeHash(await fs.readFile(file.path)),file.sha256);assert.equal((await fs.readFile(file.path)).subarray(0,2).toString(),'PK')}
    await assert.rejects(()=>createNativeOfficeFixture(root,process.cwd()),{code:'EEXIST'})
    for(const file of files)assert.equal(officeHash(await fs.readFile(file.path)),file.sha256)
  }finally{
    assert.ok(path.resolve(parent).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(parent).startsWith('longedit-v118-office-unit-'))
    await fs.rm(parent,{recursive:true})
  }
})

test('Office target selectors parse the actual public search key and never substitute a document open',()=>{
  assert.equal(officePathKey(String.raw`\\?\D:\Owned\定位资料\File.docx`),officePathKey('D:/Owned/定位资料/File.docx'))
  assert.notEqual(officePathKey('D:/Owned/File.docx'),officePathKey('D:/Other/File.docx'))
  const windowsPath=String.raw`\\?\D:\Owned\项目 & 资料\原文定位.docx`
  const route=officeRouteQuery('#/library?locator=docx-block&path='+windowsPath.replaceAll(' ','%20').replaceAll('&','%26')+'&locatorToken=1')
  assert.equal(route.path,windowsPath);assert.equal(route.locator,'docx-block');assert.equal(route.locatorToken,'1')
  assert.deepEqual(officeRouteQuery('#/library'),{})
  for(const kind of ['docx-block','pptx-object','pptx-slide','workbook-sheet']){
    const key=JSON.stringify(['C:/own/file','docx','body',null,null,kind,'target','text'])
    const row={closest:()=>({dataset:{searchKey:key}})}
    const actual=vm.runInNewContext(officeMatchTarget(kind),{document:{querySelectorAll:()=>[row]}})
    assert.equal(actual,row)
    assert.equal(vm.runInNewContext(officeMatchTarget('unmatched'),{document:{querySelectorAll:()=>[row]}}),undefined)
  }
})

test('all literal and interpolated native user/browser expressions are syntactically valid',async()=>{
  let checked=0
  for(const name of ['scripts/capture-v118-native-user.mjs','scripts/lib/v118-native-office-input.mjs']){
    const source=await fs.readFile(name,'utf8'),tree=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
    function inspect(node){
      if(ts.isCallExpression(node)&&['evaluate','ui.waitFor'].includes(node.expression.getText(tree))){
        const expression=node.arguments[0]
        if(expression&&(ts.isStringLiteral(expression)||ts.isNoSubstitutionTemplateLiteral(expression))){new vm.Script(expression.text);checked++}
        else if(expression&&ts.isTemplateExpression(expression)){
          const text=expression.head.text+expression.templateSpans.map(span=>'TEMPLATE_VALUE'+span.literal.text).join('')
          new vm.Script(text);checked++
        }
      }
      ts.forEachChild(node,inspect)
    }
    inspect(tree)
  }
  assert.ok(checked>=35)
})

test('Office driver is hosted-only trusted input with genuine page/draft/byte and footer observations',async()=>{
  const office=await fs.readFile('scripts/lib/v118-native-office-input.mjs','utf8'),user=await fs.readFile('scripts/capture-v118-native-user.mjs','utf8')
  assert.ok(office.indexOf('assertHostedSearchAudit()')<office.indexOf('files=await createNativeOfficeFixture'))
  assert.doesNotMatch(office.replaceAll('ui.click(', 'ui.pointerInput('),/__TAURI_INTERNALS__|\.dispatchEvent\(|\.click\(|\.focus\(|\.(?:isDirty|content|value)\s*=(?!=)/)
  assert.match(office,/await assertDraft\(false\)/);assert.match(office,/officeHash\(await fs.readFile\(file.path\)\)/)
  assert.match(office,/\.route-target-object/);assert.match(office,/\.pptx-details \.notes/);assert.match(office,/\.sheet-tabs button.active/)
  assert.ok(user.indexOf('report.footerRecovery=await evaluate')<user.indexOf("await ui.click(library+' .search-page-retry')"))
  assert.match(user,/visibleWithoutRecoveryScroll:true/)
})

function example(){
  const run={status:'completed',conclusion:'success',headSha:'a'.repeat(40)}
  const identity={productCommit:nativeSearchProduct,harnessCommit:run.headSha,executableSha256:'b'.repeat(64)}
  const user={...identity,status:'passed',runtimeErrors:[],draftChecks:Array(10).fill({}),footerRecovery:{label:'重新搜索',visibleWithoutRecoveryScroll:true,retainedFiles:80}}
  const office={...identity,status:'passed',phase:'office',runtimeBaseVersion:'1.1.7',evidenceLevel:'actual-wry-webview-input-events-generated-disk-not-installed',sourceUserContentIncluded:false,nativeBridgeMocked:false,desktopInputUsed:false,checks:[...nativeOfficeChecks],runtimeErrors:[],uiObservation:{errorOverlay:false},inputTrace:['click','keydown','input'].map(type=>({type,trusted:true})),sourceFiles:officeFixtureSpecs.map(s=>({name:s.name,source:s.source,before:s.sha256,after:s.sha256})),observations:{
    docx:{path:'C:/own/原文定位.docx',locator:'docx-p-1',targetText:'After explicit page break.',visible:true},
    pptxObject:{path:'C:/own/演示定位.pptx',locatorKind:'pptx-object',locator:'obj-1',objectId:'obj-1',slide:'1',text:'Search and notes evidence',locatorToken:'1'},
    pptxNotes:{path:'C:/own/演示定位.pptx',slide:'2',activeSlide:2,matchKind:'notes',notes:'LibreOffice image relationship evidence.',locatorToken:'2'},
    workbook:[{path:'C:/own/工作表定位.xlsx',sheet:'Inventory',activeSheet:'Inventory',locatorToken:'3'},{path:'C:/own/工作表定位.xlsx',sheet:'Details',activeSheet:'Details',locatorToken:'4'}],
  }}
  return {run,user,office}
}
test('Office evidence keeps the new product, four actual input tasks, three immutable sources and original draft together',()=>{
  const e=example();assert.equal(verifyNativeOfficeEvidence(e.office,e.user,e.run).nativeOfficeChecks,4)
})
test('Office evidence rejects missing native identity, trusted input, source bytes, visible footer and exact locations',()=>{
  for(const mutate of [e=>e.run.conclusion='failure',e=>e.run.status='in_progress',e=>e.office.productCommit='c'.repeat(40),e=>e.office.executableSha256='d'.repeat(64),e=>e.office.checks.pop(),e=>e.office.nativeBridgeMocked=true,e=>e.office.inputTrace[2].trusted=false,e=>e.office.sourceFiles[0].after='a'.repeat(64),e=>e.office.sourceFiles.pop(),e=>e.office.observations.docx.visible=false,e=>e.office.observations.pptxObject.objectId='wrong',e=>e.office.observations.pptxNotes.activeSlide=1,e=>e.office.observations.workbook[1].activeSheet='Inventory',e=>e.office.observations.workbook[1].locatorToken='3',e=>e.user.footerRecovery.visibleWithoutRecoveryScroll=false,e=>e.user.draftChecks.pop(),e=>e.office.runtimeErrors.push('error'),e=>e.office.uiObservation.errorOverlay=true]){
    const e=example();mutate(e);assert.throws(()=>verifyNativeOfficeEvidence(e.office,e.user,e.run))
  }
})
