import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {listCopyChecks,validateInstalledListCopy} from './lib/installed-v1-2-26-evidence.mjs'
import {runInstalledV1226ListCopyWorkflow} from './lib/installed-v1-2-26-workflow.mjs'
test('installed list copy driver uses real input with parseable observation expressions',()=>{
 assert.equal(typeof runInstalledV1226ListCopyWorkflow,'function')
 const source=fs.readFileSync('scripts/lib/installed-v1-2-26-workflow.mjs','utf8');assert.ok(source.includes('nativeUserInput'));assert.ok(source.includes('FileShare]::Read'));assert.ok(!/dispatchEvent|__TAURI|\.force\(/.test(source))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const file of ['scripts/capture-r5j-installed-artifact-smoke.mjs','scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('installed-v1-2-26-'),file)
})
test('list copy proof rejects incomplete format results, mutations, synthetic input and occluded context',()=>{
 const manifest={appVersion:'1.2.26',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},both={yaml:'e'.repeat(64),toml:'f'.repeat(64)},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),lockedBefore:both,lockedAfter:{...both},externalBefore:both,externalAfter:{...both},status:'passed',evidenceLevel:'installed-yaml-toml-item-copy-trusted-input-and-file-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:listCopyChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:11},()=>({type:'input',trusted:true})),disposableDraftsExplicitlyDiscarded:true,contextViewportWidths:[1280,800],floatingTriggerPresent:false}
 assert.doesNotThrow(()=>validateInstalledListCopy(report,manifest));for(const change of [{checks:report.checks.slice(1)},{lockedAfter:{...both,toml:'a'.repeat(64)}},{externalAfter:{...both,yaml:'a'.repeat(64)}},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true},{runtimeErrors:['lost draft']},{disposableDraftsExplicitlyDiscarded:false},{contextViewportWidths:[1280]},{floatingTriggerPresent:true}])assert.throws(()=>validateInstalledListCopy({...report,...change},manifest))
})
