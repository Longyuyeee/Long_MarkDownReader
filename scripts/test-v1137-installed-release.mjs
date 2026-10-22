import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {pdfResumeChecks,validateInstalledPdfResume} from './lib/installed-v1-1-37-evidence.mjs'
test('installed PDF resume driver uses real input, a fresh renderer and scalar readiness predicates',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-37-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready|ui\.waitFor)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=15);assert.ok(source.includes("send('Page.reload'"));assert.ok(source.includes("!('__v1137Trace' in window)"));assert.ok(source.includes("ui.waitFor('Boolean('+e+')'"));assert.equal((source.match(/ui\.waitFor\(/g)||[]).length,1)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true','Unidentified'])assert.ok(!source.includes(forbidden));for(const p of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(p,'utf8').includes('assertPdfResumeOutputBytes'))
})
test('installed PDF resume proof rejects partial tasks, changed bytes and untrusted input',()=>{
 const manifest={appVersion:'1.1.37',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},r={appVersion:'1.1.37',sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),pdfBefore:'e'.repeat(64),pdfAfter:'e'.repeat(64),status:'passed',evidenceLevel:'installed-pdf-view-reload-trusted-ui-and-sidecar-bytes',rendererReloads:1,nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:pdfResumeChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:12},(_,n)=>({type:['click','keydown','input'][n%3],trusted:true}))};assert.doesNotThrow(()=>validateInstalledPdfResume(r,manifest));for(const change of [{pdfAfter:'f'.repeat(64)},{checks:r.checks.slice(1)},{rendererReloads:0},{inputTrace:[{type:'click',trusted:false}]},{nativeBridgeMocked:true}])assert.throws(()=>validateInstalledPdfResume({...r,...change},manifest))
})
