import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readingMoveChecks,validateInstalledReadingMove} from './lib/installed-v1-2-1-evidence.mjs'
import {installedViewLookupExpression} from './lib/installed-view-lookup.mjs'
test('installed reading snapshots select the exact file when two folders share a PDF name and annotation IDs',()=>{
 const first='C:/Library/moved/接续.pdf',second='C:/Library/resume/接续.pdf',data={[first]:{pdfAnnotations:{query:'',selection:[]} },['\\\\?\\C:\\Library\\resume\\接续.pdf']:{pdfAnnotations:{query:'接续评论',selection:['resume-9']}}}
 const localStorage={getItem:key=>{assert.equal(key,'longedit.view-state.v1');return JSON.stringify(data)}}
 assert.equal(vm.runInNewContext(installedViewLookupExpression(first),{localStorage}).pdfAnnotations.query,'')
 assert.equal(vm.runInNewContext(installedViewLookupExpression(second),{localStorage}).pdfAnnotations.query,'接续评论')
 assert.equal(vm.runInNewContext(installedViewLookupExpression('C:/elsewhere/接续.pdf'),{localStorage}),undefined)
})
test('the actual moved-PDF predicate keeps the Windows namespace question mark inside the query value',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-2-1-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS)
 let template
 const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText(tree)==='ready'&&node.arguments[1]?.text==='active PDF at moved path')template=node.arguments[0];ts.forEachChild(node,visit)};visit(tree);assert.ok(template&&ts.isTemplateExpression(template))
 const target='c:/longeditr5ilibrary/归档/阅读资料/接续.pdf',expression=template.head.text+template.templateSpans.map(span=>JSON.stringify(target)+span.literal.text).join('')
 const location={hash:'#/library?path=%5C%5C?%5CC:%5CLongEditR5ILibrary%5C%E5%BD%92%E6%A1%A3%5C%E9%98%85%E8%AF%BB%E8%B5%84%E6%96%99%5C%E6%8E%A5%E7%BB%AD.pdf'},input={value:'2'},document={querySelector:()=>input,body:{inert:false}},run=()=>vm.runInNewContext(expression,{location,document,URLSearchParams,String})
 assert.equal(run(),true);input.value='1';assert.equal(run(),false);input.value='2';document.body.inert=true;assert.equal(run(),false);document.body.inert=false;location.hash='#/library?path=C:/wrong.pdf';assert.equal(run(),false)
})
test('reading move driver keeps native receipts, trusted input and valid browser expressions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-2-1-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready|ui\.waitFor)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree)
 // The shared observer is generated rather than a source literal; retain its
 // syntax coverage for both stores instead of dropping that expression check.
 for(const key of ['longedit.view-state.v1','longedit.session-view-state.v1']){assert.doesNotThrow(()=>new vm.Script(installedViewLookupExpression('C:/Library/接续.pdf',key)));count++}
 assert.ok(count>=20)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true','Unidentified'])assert.ok(!source.includes(forbidden))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertReadingMoveOutputBytes'))
})
test('same-installer reading proof rejects partial receipts, mutated source bytes and implicit saves',()=>{
 const manifest={appVersion:'1.2.1',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),pdfBefore:'e'.repeat(64),pdfAfter:'e'.repeat(64),status:'passed',evidenceLevel:'installed-reading-continuity-native-receipts-and-trusted-input',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:readingMoveChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:8},()=>({type:'input',trusted:true}))}
 assert.doesNotThrow(()=>validateInstalledReadingMove(report,manifest));for(const change of [{checks:report.checks.slice(1)},{pdfAfter:'f'.repeat(64)},{runtimeErrors:['lost draft']},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true}])assert.throws(()=>validateInstalledReadingMove({...report,...change},manifest))
})
