import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readingMoveChecks,validateInstalledReadingMove} from './lib/installed-v1-2-1-evidence.mjs'
test('reading move driver keeps native receipts, trusted input and valid browser expressions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-2-1-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready|ui\.waitFor)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=20)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true','Unidentified'])assert.ok(!source.includes(forbidden))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertReadingMoveOutputBytes'))
})
test('same-installer reading proof rejects partial receipts, mutated source bytes and implicit saves',()=>{
 const manifest={appVersion:'1.2.1',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),pdfBefore:'e'.repeat(64),pdfAfter:'e'.repeat(64),status:'passed',evidenceLevel:'installed-reading-continuity-native-receipts-and-trusted-input',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:readingMoveChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:8},()=>({type:'input',trusted:true}))}
 assert.doesNotThrow(()=>validateInstalledReadingMove(report,manifest));for(const change of [{checks:report.checks.slice(1)},{pdfAfter:'f'.repeat(64)},{runtimeErrors:['lost draft']},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true}])assert.throws(()=>validateInstalledReadingMove({...report,...change},manifest))
})
