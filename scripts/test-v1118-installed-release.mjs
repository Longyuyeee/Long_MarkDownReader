// Synthetic protocol fixtures only. They are not native installation evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {pptxEditingChecks,validateInstalledPptxEditing,assertPptxOutputBytes} from './lib/installed-v1-1-18-evidence.mjs'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),bytes=Buffer.from('synthetic-output-not-native-pptx'),before=Buffer.from('synthetic-before'),peer=Buffer.from('synthetic-peer')
function example(){
 const manifest={appVersion:'1.1.18',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-pptx-native-save-and-independent-zip-xml',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:pptxEditingChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],uiMessages:[],inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),unselectedBefore:'e'.repeat(64),unselectedAfter:'e'.repeat(64),outputs:[],conflictBeforeSha256:sha(before),externalConflictSha256:sha(peer),conflictAfterSha256:sha(peer),inspection:{status:'passed',reader:'defusedxml-0.7.1-and-stdlib-zipfile',nativeBridgeMocked:false,officeVisualAcceptance:false,cases:[]}}
 for(const key of ['canvasTargetExact','notesTargetExact','rawBufferExact','samePathExternalDraftProtected','undoRedoExact','collisionExact','copySourceUnchanged','cancelExact','shortcutConfirmed','shortcutExclusive','reloadCancelExact','sourceConflictPreserved','sourceSavedExact','externalReadOnly','unauthorizedExternalRejected'])report[key]=true
 const files=new Map()
 for(const producerId of ['microsoft-powerpoint-16','wps-presentation','libreoffice-impress']){
  const original=producerId==='wps-presentation'?peer:before,outcome={sha256:sha(bytes),expectedTextVerified:true,unchangedStructureVerified:true,changedTextCount:2,changedParts:['ppt/slides/slide1.xml','ppt/notesSlides/notesSlide1.xml'],preservedParts:['[Content_Types].xml','_rels/.rels','ppt/theme/theme1.xml'].map(part=>({part,sha256:'f'.repeat(64)}))}
  report.inspection.cases.push({producerId,beforeSha256:sha(original),source:structuredClone(outcome),copy:structuredClone(outcome)})
  for(const key of ['before','source','copy']){const fileName=`installed-v1118-${producerId}-${key}.pptx`,content=key==='before'?original:bytes;files.set(fileName,content);report.outputs.push({fileName,sizeBytes:content.length,sha256:sha(content)})}
 }
 return {report,manifest,files}
}
test('PPTX intake requires every actual task, producer, preservation and immutable file identity',()=>{
 const {report,manifest,files}=example();validateInstalledPptxEditing(report,manifest);assertPptxOutputBytes(report,file=>files.get(file))
 for(const key of ['canvasTargetExact','notesTargetExact','rawBufferExact','samePathExternalDraftProtected','undoRedoExact','collisionExact','copySourceUnchanged','cancelExact','shortcutConfirmed','shortcutExclusive','reloadCancelExact','sourceConflictPreserved','sourceSavedExact','externalReadOnly','unauthorizedExternalRejected']){const bad=structuredClone(report);bad[key]=false;assert.throws(()=>validateInstalledPptxEditing(bad,manifest),key)}
 for(const mutate of [r=>r.checks.pop(),r=>r.checks.reverse(),r=>r.outputs.pop(),r=>r.outputs[1].sha256='0'.repeat(64),r=>r.outputs[1].fileName=r.outputs[0].fileName,r=>r.nativeBridgeMocked=true,r=>r.desktopInputUsed=true,r=>r.sourceUserContentIncluded=true,r=>r.runtimeErrors.push('error'),r=>r.inputTrace[0].trusted=false,r=>r.inspection.cases[0].source.changedParts.pop(),r=>r.inspection.cases[0].source.changedParts[0]='ppt/theme/theme1.xml',r=>r.inspection.cases[0].source.changedTextCount=1,r=>r.inspection.cases[0].source.unchangedStructureVerified=false,r=>r.conflictAfterSha256=r.conflictBeforeSha256,r=>r.uiMessages.push('当前文件没有文本写入适配器'),r=>r.inspection.officeVisualAcceptance=true,r=>r.installerSha256='0'.repeat(64)]){const bad=structuredClone(report);mutate(bad);assert.throws(()=>validateInstalledPptxEditing(bad,manifest))}
 files.set(report.outputs[0].fileName,Buffer.from('substituted'));assert.throws(()=>assertPptxOutputBytes(report,file=>files.get(file)))
})
test('all predecessor runtime reports plus PPTX bind to the same installer executable, driver and raw output files',()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/evidence/v1.1.17-release/artifact-manifest.json')),root='docs/evidence/v1-1-18-candidate-lifecycle/',files=new Map(),reports={};manifest.appVersion=manifest.sourceVersion='1.1.18'
 for(const[key,item]of Object.entries(manifest.runtimeSmoke.reports))reports[key]=JSON.parse(fs.readFileSync(item.path,'utf8').replaceAll('1.1.17','1.1.18'))
 for(const name of fs.readdirSync('docs/evidence/v1-1-17-candidate-lifecycle'))if(!name.endsWith('.json'))files.set(root+name,fs.readFileSync('docs/evidence/v1-1-17-candidate-lifecycle/'+name))
 const {report,files:raw}=example();Object.assign(report,{sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(a=>a.target==='nsis').sha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit,executableSha256:reports.searchCompleteness.executableSha256});reports.pptxEditing=report;for(const[name,content]of raw)files.set(root+name,content)
 const update=()=>{for(const[key,value]of Object.entries(reports)){const name=root+key+'.json',raw=Buffer.from(JSON.stringify(value));files.set(name,raw);manifest.runtimeSmoke.reports[key]={path:name,sha256:sha(raw)}}};update();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(manifest,name=>files.get(name)))
 report.harnessSourceCommit='0'.repeat(40);update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,name=>files.get(name)));report.harnessSourceCommit=reports.searchCompleteness.harnessSourceCommit;update();files.set(root+report.outputs[0].fileName,Buffer.from('changed'));assert.throws(()=>assertInstalledReleaseRuntime(manifest,name=>files.get(name)))
})
test('native PPTX acceptance uses real trusted controls, original producers and independent readback at every release gate',()=>{
 const driver=fs.readFileSync('scripts/lib/installed-v1-1-18-workflow.mjs','utf8')
 for(const token of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true','force:true','[title='])assert.ok(!driver.includes(token),token)
 for(const token of ['nativeUserInput','fixtures/pptx/producers','inspect-hosted-pptx-delivery.py','COPYFILE_EXCL','sourceConflictPreserved','validateInstalledPptxEditing','rawBufferExact'])assert.ok(driver.includes(token),token)
 for(const file of ['scripts/lib/installed-release-runtime.mjs','scripts/import-community-release-review.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertPptxOutputBytes'),file)
 const tree=ts.createSourceFile('driver.mjs',driver,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const walk=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const arg=node.arguments[0];if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))){assert.doesNotThrow(()=>new vm.Script(arg.text),arg.text);count++}}ts.forEachChild(node,walk)};walk(tree);assert.ok(count>=20)
})
