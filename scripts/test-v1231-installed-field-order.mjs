import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {yamlFieldOrderChecks,validateInstalledYamlFieldOrder,assertYamlFieldOrderOutputBytes,yamlFieldOrderSource,yamlFieldOrderEdited,yamlFieldOrderConflict,yamlFieldOrderOutputFiles} from './lib/installed-v1-2-31-evidence.mjs'
import {runInstalledV1231YamlFieldOrderWorkflow} from './lib/installed-v1-2-31-workflow.mjs'
test('installed YAML field order driver uses real input with parseable observation expressions',()=>{
 assert.equal(typeof runInstalledV1231YamlFieldOrderWorkflow,'function')
 const source=fs.readFileSync('scripts/lib/installed-v1-2-31-workflow.mjs','utf8');assert.ok(source.includes('nativeUserInput'));assert.ok(source.includes('FileShare]::Read'));assert.ok(!/dispatchEvent|__TAURI|\.force\(/.test(source))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const file of ['scripts/capture-r5j-installed-artifact-smoke.mjs','scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('installed-v1-2-31-'),file)
})
test('ordering proof rejects lost draft bytes, synthetic input, wrong identities and incomplete flows',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),buffers=[Buffer.from(JSON.stringify(Object.fromEntries(yamlFieldOrderChecks.map(id=>[id,true])))),Buffer.from('\uFEFF'+yamlFieldOrderEdited.replaceAll('\n','\r\n')),Buffer.from(yamlFieldOrderConflict),Buffer.from('\uFEFF'+yamlFieldOrderEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))]
 const manifest={appVersion:'1.2.31',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),lockedBefore:'e'.repeat(64),lockedAfter:'e'.repeat(64),externalBefore:'f'.repeat(64),externalAfter:'f'.repeat(64),status:'passed',evidenceLevel:'installed-yaml-field-adjacent-order-trusted-input-and-file-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:yamlFieldOrderChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:11},()=>({type:'input',trusted:true})),disposableDraftsExplicitlyDiscarded:true,viewportWidths:[1280,800],boundariesDisabled:true,outputs:yamlFieldOrderOutputFiles.map((fileName,i)=>({fileName,sizeBytes:buffers[i].length,sha256:hash(buffers[i])}))}
 const read=n=>buffers[yamlFieldOrderOutputFiles.indexOf(n)];validateInstalledYamlFieldOrder(report,manifest);assertYamlFieldOrderOutputBytes(report,read)
 for(const change of [{checks:report.checks.slice(1)},{lockedAfter:'a'.repeat(64)},{externalAfter:'a'.repeat(64)},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true},{runtimeErrors:['lost draft']},{disposableDraftsExplicitlyDiscarded:false},{viewportWidths:[1280]},{boundariesDisabled:false}])assert.throws(()=>validateInstalledYamlFieldOrder({...report,...change},manifest))
 assert.throws(()=>assertYamlFieldOrderOutputBytes(report,n=>n.includes('-copy.')?Buffer.from(yamlFieldOrderSource):read(n)))
})
