import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {xmlTextChecks,validateInstalledXmlText} from './lib/installed-v1-2-12-evidence.mjs'
import {runInstalledV1212XmlTextWorkflow} from './lib/installed-v1-2-12-workflow.mjs'
test('installed XML driver uses real input and all read-only expressions parse',()=>{
 assert.equal(typeof runInstalledV1212XmlTextWorkflow,'function')
 assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('await runInstalledV1212XmlTextWorkflow('))
 const source=fs.readFileSync('scripts/lib/installed-v1-2-12-workflow.mjs','utf8');assert.ok(source.includes('nativeUserInput'));assert.ok(source.includes('FileShare]::Read'));assert.ok(!/dispatchEvent|__TAURI|\.force\(/.test(source))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const file of ['scripts/capture-r5j-installed-artifact-smoke.mjs','scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('installed-v1-2-12-'),file)
})
test('XML proof rejects partial results, changed source bytes, false input and bridge mocks',()=>{
 const manifest={appVersion:'1.2.12',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),lockedBefore:'e'.repeat(64),lockedAfter:'e'.repeat(64),externalBefore:'f'.repeat(64),externalAfter:'f'.repeat(64),yamlBefore:'e'.repeat(64),yamlAfter:'e'.repeat(64),status:'passed',evidenceLevel:'installed-xml-text-edit-trusted-input-and-file-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:xmlTextChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:11},()=>({type:'input',trusted:true}))}
 assert.doesNotThrow(()=>validateInstalledXmlText(report,manifest));for(const change of [{checks:report.checks.slice(1)},{lockedAfter:'f'.repeat(64)},{externalAfter:'a'.repeat(64)},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true},{runtimeErrors:['lost selection']}])assert.throws(()=>validateInstalledXmlText({...report,...change},manifest))
})
