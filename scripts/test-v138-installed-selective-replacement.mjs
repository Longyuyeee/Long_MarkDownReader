import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {selectiveReplacementOutput} from './lib/installed-v1-3-8-evidence.mjs'
import {selectiveReplacementChecks,selectiveReplacementOutputFiles,validateInstalledSelectiveReplacement,assertSelectiveReplacementOutputBytes} from './lib/installed-v1-3-8-evidence.mjs'
test('installed proof binds each query, draft/save/readonly task to real executable and exact saved bytes',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),buffers=[Buffer.from(JSON.stringify(Object.fromEntries(selectiveReplacementChecks.map(id=>[id,true])))),...['json','yaml','xml','toml'].map(mode=>Buffer.from('\uFEFF'+selectiveReplacementOutput(mode).replaceAll('\n','\r\n')))]
 const manifest={appVersion:'1.3.8',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},r={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',inputProtocol:'trusted-keyboard-and-pointer',evidenceLevel:'installed-selective-replacement-trusted-input-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,runtimeErrors:[],otherDraftsPreserved:true,disposableDraftsExplicitlySaved:true,viewportWidths:[1280,800],inputTrace:Array.from({length:21},()=>({type:'keydown',trusted:true})),checks:selectiveReplacementChecks.map(id=>({id,status:'passed'})),modes:['json','yaml','xml','toml'].map(mode=>({mode,...Object.fromEntries(['crossPageSelectionExact','allNoneProtected','refreshResetsSelection','applyFocusExact','pagedBeforeAfterExact','cancelDraftExact','scopedCapturesExact','applyUndoRedoExact','explicitSaveExact','ownerResetExact','readOnlyExact'].map(k=>[k,true]))})),outputs:selectiveReplacementOutputFiles.map((fileName,i)=>({fileName,sizeBytes:buffers[i].length,sha256:hash(buffers[i])}))}
 const read=n=>buffers[selectiveReplacementOutputFiles.indexOf(n)];validateInstalledSelectiveReplacement(r,manifest);assertSelectiveReplacementOutputBytes(r,read)
 for(const mutate of [v=>v.modes[0].crossPageSelectionExact=false,v=>v.modes[1].readOnlyExact=false,v=>v.modes[2].applyFocusExact=false,v=>v.otherDraftsPreserved=false,v=>v.checks.pop(),v=>v.nativeBridgeMocked=true,v=>v.inputTrace[0].trusted=false]){const copy=structuredClone(r);mutate(copy);assert.throws(()=>validateInstalledSelectiveReplacement(copy,manifest))}
 assert.throws(()=>assertSelectiveReplacementOutputBytes(r,n=>n.endsWith('.xml')?Buffer.from('changed output'):read(n)))
 assert.throws(()=>validateInstalledSelectiveReplacement(r,{...manifest,appVersion:'1.3.9'}))
})
test('installed search task uses trusted existing controls with valid evaluated expressions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-3-8-workflow.mjs','utf8');assert.ok(!/dispatchEvent|__TAURI|\.focus\(/.test(source));for(const text of ['nativeUserInput','下一页','应用到草稿','fs.chmod','button[name=previewReplace]'])assert.ok(source.includes(text))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const code=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(code),code);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>20)
})
test('current release registers the new workflow and retains the entire137 preview workflow',()=>{
 const current=JSON.parse(fs.readFileSync('package.json','utf8')).version
 for(const[file,anchor,guard]of [['scripts/capture-r5j-installed-artifact-smoke.mjs','const {runInstalledV137ReplacementPreviewWorkflow}','if('],['scripts/lib/installed-release-runtime.mjs','validateInstalledReplacementPreview(reports.replacementPreview','if('],['scripts/import-community-release-review.mjs',"[['replacementPreview','installed-v137",'...('],['.github/workflows/community-release-publish.yml','import {validateInstalledReplacementPreview','if ($env:RELEASE_VERSION']]){const s=fs.readFileSync(file,'utf8'),end=s.indexOf(anchor),start=s.lastIndexOf(guard,end);assert.ok(end>0&&start>=0,file);assert.ok(s.slice(start,end).includes("'"+current+"'"),file+' omitted the previous workflow');assert.ok(s.includes('installed-v1-3-8-'),file)}
})
