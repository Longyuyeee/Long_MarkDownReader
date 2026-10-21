import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
import {copyReadingChecks,validateInstalledCopyReading} from './lib/installed-v1-1-33-evidence.mjs'
test('reading copy uses real existing controls and parses every embedded observation',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-33-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const expression=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(expression),expression);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=20)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true'])assert.ok(!source.includes(forbidden));assert.ok(source.includes("assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted')"));assert.ok(fs.readFileSync('scripts/lib/installed-v1-1-21-workflow.mjs','utf8').includes('runInstalledV1133Workflow'))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertCopyReadingOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/import-community-release-review.mjs','utf8').includes("[['copyReading',reports.copyReading.file]]"))
})
test('installed reading-copy identity cannot accept a missing task or a different source',()=>{
 const source='a'.repeat(40),installer='b'.repeat(64),manifest={appVersion:'1.1.33',sourceCommit:source,artifacts:[{target:'nsis',sha256:installer}]},report={appVersion:'1.1.33',sourceCommit:source,installerSha256:installer,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-cross-library-reading-results-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:copyReadingChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:12},(_,n)=>({type:['click','pointerdown','keydown','input'][n%4],trusted:true}))}
 for(const k of ['previewReadOnly','collisionExact','sourceExact','reopenedExact','noteMappingExact','metadataUpdatable','partialExact','retryExact','optOutExact','cancelExact','draftsExact','receiptRepeatExact'])report[k]=true
 assert.doesNotThrow(()=>validateInstalledCopyReading(report,manifest));for(const altered of [{...report,sourceCommit:'e'.repeat(40)},{...report,checks:report.checks.slice(1)},{...report,metadataUpdatable:false},{...report,nativeBridgeMocked:true},{...report,inputTrace:[{type:'click',trusted:false}]}])assert.throws(()=>validateInstalledCopyReading(altered,manifest))
})
