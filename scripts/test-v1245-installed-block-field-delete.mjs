import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {tomlBlockFieldDeleteChecks,validateInstalledTomlBlockFieldDelete,assertTomlBlockFieldDeleteOutputBytes,tomlBlockFieldDeleteSource,tomlBlockFieldDeleteEdited,tomlBlockFieldDeleteConflict,tomlBlockFieldDeleteOutputFiles} from './lib/installed-v1-2-45-evidence.mjs'
import {runInstalledV1245TomlBlockFieldDeleteWorkflow} from './lib/installed-v1-2-45-workflow.mjs'
test('installed TOML deletion driver uses real input with parseable observation expressions',()=>{
 assert.equal(typeof runInstalledV1245TomlBlockFieldDeleteWorkflow,'function')
 const source=fs.readFileSync('scripts/lib/installed-v1-2-45-workflow.mjs','utf8');assert.ok(source.includes('nativeUserInput'));assert.ok(source.includes('FileShare]::Read'));assert.ok(!/dispatchEvent|__TAURI|\.force\(/.test(source))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const file of ['scripts/capture-r5j-installed-artifact-smoke.mjs','scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('installed-v1-2-45-'),file)
})
test('deletion proof rejects lost draft bytes, synthetic input, wrong identities and incomplete flows',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),buffers=[Buffer.from(JSON.stringify(Object.fromEntries(tomlBlockFieldDeleteChecks.map(id=>[id,true])))),Buffer.from('\uFEFF'+tomlBlockFieldDeleteEdited.replaceAll('\n','\r\n')),Buffer.from(tomlBlockFieldDeleteConflict),Buffer.from('\uFEFF'+tomlBlockFieldDeleteEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))]
 const manifest={appVersion:'1.2.45',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),lockedBefore:'e'.repeat(64),lockedAfter:'e'.repeat(64),externalBefore:'f'.repeat(64),externalAfter:'f'.repeat(64),status:'passed',evidenceLevel:'installed-toml-block-field-deletion-trusted-input-and-file-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:tomlBlockFieldDeleteChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:11},()=>({type:'input',trusted:true})),disposableDraftsExplicitlyDiscarded:true,viewportWidths:[1280,800],deletionSelectionVerified:true,outputs:tomlBlockFieldDeleteOutputFiles.map((fileName,i)=>({fileName,sizeBytes:buffers[i].length,sha256:hash(buffers[i])}))}
 const read=n=>buffers[tomlBlockFieldDeleteOutputFiles.indexOf(n)];validateInstalledTomlBlockFieldDelete(report,manifest);assertTomlBlockFieldDeleteOutputBytes(report,read)
 for(const change of [{checks:report.checks.slice(1)},{lockedAfter:'a'.repeat(64)},{externalAfter:'a'.repeat(64)},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true},{runtimeErrors:['lost draft']},{disposableDraftsExplicitlyDiscarded:false},{viewportWidths:[1280]},{deletionSelectionVerified:false}])assert.throws(()=>validateInstalledTomlBlockFieldDelete({...report,...change},manifest))
 assert.throws(()=>assertTomlBlockFieldDeleteOutputBytes(report,n=>n.includes('-copy.')?Buffer.from(tomlBlockFieldDeleteSource):read(n)))
})
