import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {outlineNavigationDraft} from './lib/structured-outline-navigation-fixture.mjs'
import {outlineNavigationChecks,outlineNavigationOutputFiles,validateInstalledOutlineNavigation,assertOutlineNavigationOutputBytes} from './lib/installed-v1-3-2-evidence.mjs'
test('outline proof requires every real format, current ranges, preserved drafts and exact saved source bytes',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),buffers=[Buffer.from(JSON.stringify(Object.fromEntries(outlineNavigationChecks.map(id=>[id,true])))),...['json','yaml','xml','toml'].map(mode=>Buffer.from('\uFEFF'+outlineNavigationDraft(mode).replaceAll('\n','\r\n')))]
 const manifest={appVersion:'1.3.2',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',inputProtocol:'leading-empty-lines-use-trusted-enter',evidenceLevel:'installed-outline-navigation-trusted-input-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,runtimeErrors:[],otherDraftsPreserved:true,disposableDraftsExplicitlySaved:true,viewportWidths:[1280,800],inputTrace:Array.from({length:21},()=>({type:'keydown',trusted:true})),checks:outlineNavigationChecks.map(id=>({id,status:'passed'})),modes:['json','yaml','xml','toml'].map(mode=>({mode,keyboardExact:true,currentRangeExact:true,filterExact:true,editorInputScoped:true,switchDraftExact:true,savedExact:true})),outputs:outlineNavigationOutputFiles.map((fileName,i)=>({fileName,sizeBytes:buffers[i].length,sha256:hash(buffers[i])}))}
 const read=n=>buffers[outlineNavigationOutputFiles.indexOf(n)];validateInstalledOutlineNavigation(report,manifest);assertOutlineNavigationOutputBytes(report,read)
 for(const change of [r=>r.modes[0].currentRangeExact=false,r=>r.otherDraftsPreserved=false,r=>r.checks.pop(),r=>r.nativeBridgeMocked=true,r=>r.inputTrace[0].trusted=false,r=>r.sourceCommit='f'.repeat(40)]){const copy=structuredClone(report);change(copy);assert.throws(()=>validateInstalledOutlineNavigation(copy,manifest))}
 assert.throws(()=>assertOutlineNavigationOutputBytes(report,n=>n.endsWith('.yaml')?Buffer.from('lost draft'):read(n)))
})
test('installed navigation remains bound to runtime, original installers and publication',()=>{
 for(const file of ['scripts/capture-r5j-installed-artifact-smoke.mjs','scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('installed-v1-3-2-'),file)
 const driver=fs.readFileSync('scripts/lib/installed-v1-3-2-workflow.mjs','utf8');assert.ok(driver.includes('nativeUserInput'));assert.ok(driver.includes('ui.tabTo(rows)'));assert.ok(!/dispatchEvent|__TAURI|\.focus\(/.test(driver))
 const tree=ts.createSourceFile('driver.mjs',driver,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const script=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(script),script);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
})

test('the current version must still execute and validate the inherited131 workflow',()=>{
 const current=JSON.parse(fs.readFileSync('package.json','utf8')).version
 for(const[file,anchor,guard]of [
  ['scripts/capture-r5j-installed-artifact-smoke.mjs','const {runInstalledV131YamlBlockFieldDeleteWorkflow}','if('],
  ['scripts/lib/installed-release-runtime.mjs','validateInstalledYamlBlockFieldDelete(reports.yamlBlockFieldDelete','if('],
  ['scripts/import-community-release-review.mjs',"[['yamlBlockFieldDelete','installed-v131",'...('],
  ['.github/workflows/community-release-publish.yml','import {validateInstalledYamlBlockFieldDelete','if ($env:RELEASE_VERSION'],
 ]){
  const source=fs.readFileSync(file,'utf8'),end=source.indexOf(anchor);assert.ok(end>0,file)
  const start=source.lastIndexOf(guard,end);assert.ok(start>=0,file);assert.ok(source.slice(start,end).includes("'"+current+"'"),file+' omitted the current version from the inherited workflow')
 }
})
