import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {outlineContinuityDraft} from './lib/structured-outline-continuity-fixture.mjs'
import {outlineContinuityChecks,outlineContinuityOutputFiles,validateInstalledOutlineContinuity,assertOutlineContinuityOutputBytes} from './lib/installed-v1-3-3-evidence.mjs'
test('installed continuity proof requires per-file state, real rename/close, current expansion, drafts and exact source bytes',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),buffers=[Buffer.from(JSON.stringify(Object.fromEntries(outlineContinuityChecks.map(id=>[id,true])))),...['json','yaml','xml','toml'].map(mode=>Buffer.from('\uFEFF'+outlineContinuityDraft(mode).replaceAll('\n','\r\n')))]
 const manifest={appVersion:'1.3.3',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},r={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',inputProtocol:'leading-empty-lines-use-trusted-enter',evidenceLevel:'installed-outline-continuity-trusted-input-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,runtimeErrors:[],otherDraftsPreserved:true,disposableDraftsExplicitlySaved:true,jsonTreeRestored:true,tomlArraysRestored:true,viewportWidths:[1280,800],inputTrace:Array.from({length:21},()=>({type:'keydown',trusted:true})),checks:outlineContinuityChecks.map(id=>({id,status:'passed'})),modes:['json','yaml','xml','toml'].map(mode=>({mode,perFileFilterExact:true,selectionExact:true,draftExact:true,closeResetExact:true,renameExact:true,currentRangeExact:true,savedExact:true})),outputs:outlineContinuityOutputFiles.map((fileName,i)=>({fileName,sizeBytes:buffers[i].length,sha256:hash(buffers[i])}))}
 const read=n=>buffers[outlineContinuityOutputFiles.indexOf(n)];validateInstalledOutlineContinuity(r,manifest);assertOutlineContinuityOutputBytes(r,read)
 for(const mutate of [v=>v.modes[0].renameExact=false,v=>v.modes[1].closeResetExact=false,v=>v.jsonTreeRestored=false,v=>v.tomlArraysRestored=false,v=>v.otherDraftsPreserved=false,v=>v.checks.pop(),v=>v.nativeBridgeMocked=true,v=>v.inputTrace[0].trusted=false]){const copy=structuredClone(r);mutate(copy);assert.throws(()=>validateInstalledOutlineContinuity(copy,manifest))}
 assert.throws(()=>assertOutlineContinuityOutputBytes(r,n=>n.endsWith('.toml')?Buffer.from('dropped array'):read(n)))
})
test('the real installed driver uses only trusted UI input and valid evaluated expressions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-3-3-workflow.mjs','utf8');assert.ok(!/dispatchEvent|__TAURI|\.focus\(/.test(source));assert.ok(source.includes('nativeUserInput'));assert.ok(source.includes('重命名当前文档'));assert.ok(source.includes('close-tab'))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const code=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(code),code);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>15)
 for(const file of ['scripts/capture-r5j-installed-artifact-smoke.mjs','scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('installed-v1-3-3-'),file)
})
test('current version continues capturing, importing and validating the entire previous132 workflow',()=>{
 const version=JSON.parse(fs.readFileSync('package.json','utf8')).version
 for(const[file,anchor,guard]of [['scripts/capture-r5j-installed-artifact-smoke.mjs','const {runInstalledV132OutlineNavigationWorkflow}','if('],['scripts/lib/installed-release-runtime.mjs','validateInstalledOutlineNavigation(reports.outlineNavigation','if('],['scripts/import-community-release-review.mjs',"[['outlineNavigation','installed-v132",'...('],['.github/workflows/community-release-publish.yml','import {validateInstalledOutlineNavigation','if ($env:RELEASE_VERSION']]){const s=fs.readFileSync(file,'utf8'),end=s.indexOf(anchor),start=s.lastIndexOf(guard,end);assert.ok(end>0&&start>=0,file);assert.ok(s.slice(start,end).includes("'"+version+"'"),file+' omitted the latest version')}
})
