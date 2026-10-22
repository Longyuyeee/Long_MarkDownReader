import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {annotationHistoryChecks,validateInstalledAnnotationHistory} from './lib/installed-v1-2-2-evidence.mjs'
test('native annotation tasks retain real input, real disk conflicts and valid renderer expressions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-2-2-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready|ui\.waitFor)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true','Unidentified'])assert.ok(!source.includes(forbidden))
 assert.ok(source.includes('[IO.FileShare]::Read'));assert.ok(source.includes('externalBytes'))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertAnnotationHistoryOutputBytes'))
})
test('installed annotation proof rejects stale source, partial tasks, runtime errors and synthetic input',()=>{
 const manifest={appVersion:'1.2.2',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),pdfBefore:'e'.repeat(64),pdfAfter:'e'.repeat(64),status:'passed',evidenceLevel:'installed-pdf-annotation-history-trusted-input-and-sidecar-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:annotationHistoryChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:20},()=>({type:'input',trusted:true}))}
 assert.doesNotThrow(()=>validateInstalledAnnotationHistory(report,manifest));for(const change of [{sourceCommit:'f'.repeat(40)},{checks:report.checks.slice(1)},{pdfAfter:'f'.repeat(64)},{runtimeErrors:['lost comment']},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true}])assert.throws(()=>validateInstalledAnnotationHistory({...report,...change},manifest))
})
