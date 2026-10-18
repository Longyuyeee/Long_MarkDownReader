// Synthetic protocol tests: not real native installation evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {docxEditingChecks,validateInstalledDocxEditing,assertDocxOutputBytes} from './lib/installed-v1-1-17-evidence.mjs'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const bytes=Buffer.from('synthetic-docx-not-a-real-native-output'),sha=crypto.createHash('sha256').update(bytes).digest('hex')
function example(){
 const manifest={appVersion:'1.1.17',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-docx-native-save-and-independent-zip-xml',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:docxEditingChecks.map(id=>({id,status:'passed'})),unselectedBefore:'e'.repeat(64),unselectedAfter:'e'.repeat(64),runtimeErrors:[],inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),outputs:[],inspection:{status:'passed',reader:'defusedxml-0.7.1-and-stdlib-zipfile',nativeBridgeMocked:false,officeVisualAcceptance:false,cases:[]}}
 report.uiMessages=[]
 for(const key of ['cancelExact','sourceSavedExact','copySourceUnchanged','undoRedoExact','collisionExact','reloadCancelExact','shortcutConfirmed','shortcutExclusive','externalReadOnly','unauthorizedExternalRejected','samePathExternalDraftProtected'])report[key]=true
 for(const producerId of ['microsoft-word-16','wps-writer','libreoffice-writer']){
  const outcome={expectedTextVerified:true,sha256:sha,preservedParts:['[Content_Types].xml','word/styles.xml','docProps/core.xml'].map(part=>({part,sha256:'f'.repeat(64)}))};report.inspection.cases.push({producerId,beforeSha256:'0'.repeat(64),source:structuredClone(outcome),copy:structuredClone(outcome)})
  for(const key of ['before','source','copy'])report.outputs.push({fileName:`installed-v1117-${producerId}-${key}.docx`,sizeBytes:bytes.length,sha256:key==='before'?'0'.repeat(64):sha})
 }
 report.inspection.cases[1].beforeSha256='1'.repeat(64);report.outputs.find(item=>item.fileName==='installed-v1117-wps-writer-before.docx').sha256='1'.repeat(64)
 Object.assign(report,{sourceConflictPreserved:true,conflictBeforeSha256:'0'.repeat(64),externalConflictSha256:'1'.repeat(64),conflictAfterSha256:'1'.repeat(64)})
 return [report,manifest]
}
test('DOCX receipt refuses partial checks, wrong identities, data loss, scripted input and overstated Office acceptance',()=>{
 assert.doesNotThrow(()=>validateInstalledDocxEditing(...example()))
 for(const mutate of [r=>r.checks.pop(),r=>r.appVersion='1.1.16',r=>r.sourceCommit='f'.repeat(40),r=>r.nativeBridgeMocked=true,r=>r.undoRedoExact=false,r=>r.unselectedAfter='f'.repeat(64),r=>r.inspection.officeVisualAcceptance=true,r=>r.inspection.cases.pop(),r=>r.inspection.cases[0].source.preservedParts=[],r=>r.inspection.cases[0].copy.expectedTextVerified=false,r=>r.outputs.pop(),r=>r.outputs[1].sha256='e'.repeat(64),r=>r.runtimeErrors.push('error'),r=>r.inputTrace[0].trusted=false,r=>r.unauthorizedExternalRejected=false]){const[r,m]=example();mutate(r);assert.throws(()=>validateInstalledDocxEditing(r,m))}
})
test('DOCX raw output bytes cannot be substituted after validation',()=>{
 const report={outputs:[{fileName:'native.docx',sizeBytes:bytes.length,sha256:sha}]};assert.doesNotThrow(()=>assertDocxOutputBytes(report,()=>bytes));assert.throws(()=>assertDocxOutputBytes(report,()=>Buffer.from('different')))
})
test('v1.1.17 retains every prior installed report and binds all nine DOCX outputs to the same package and driver',()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/evidence/v1.1.16-release/artifact-manifest.json','utf8'));manifest.appVersion=manifest.sourceVersion='1.1.17'
 const root='docs/evidence/v1-1-17-candidate-lifecycle/',files=new Map(),reports={}
 for(const[key,item]of Object.entries(manifest.runtimeSmoke.reports)){const raw=fs.readFileSync(item.path);reports[key]=JSON.parse(raw.toString('utf8').replaceAll('1.1.16','1.1.17'))}
 for(const file of ['installed-v1115-saved.csv','installed-v1115-export.xlsx','installed-v1116-before.xlsx','installed-v1116-saved.xlsx','installed-v1116-producer.xlsx'])files.set(root+file,fs.readFileSync('docs/evidence/v1-1-16-candidate-lifecycle/'+file))
 const docx=example()[0],before=Buffer.from('synthetic-before-not-native'),externalBefore=Buffer.from('synthetic-external-not-native'),beforeHash=crypto.createHash('sha256').update(before).digest('hex'),externalHash=crypto.createHash('sha256').update(externalBefore).digest('hex');Object.assign(docx,{sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(item=>item.target==='nsis').sha256,executableSha256:reports.searchCompleteness.executableSha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit,conflictBeforeSha256:beforeHash,externalConflictSha256:externalHash,conflictAfterSha256:externalHash})
 for(const item of docx.inspection.cases)item.beforeSha256=item.producerId==='wps-writer'?externalHash:beforeHash
 for(const item of docx.outputs){const original=item.fileName.endsWith('-before.docx'),value=original?(item.fileName.includes('wps-writer')?externalBefore:before):bytes;item.sha256=crypto.createHash('sha256').update(value).digest('hex');item.sizeBytes=value.length;files.set(root+item.fileName,value)}
 reports.docxEditing=docx
 const update=()=>{for(const[key,value]of Object.entries(reports)){const file=root+key+'.json',raw=Buffer.from(JSON.stringify(value));files.set(file,raw);manifest.runtimeSmoke.reports[key]={path:file,sha256:crypto.createHash('sha256').update(raw).digest('hex')}}};update()
 assert.doesNotThrow(()=>assertInstalledReleaseRuntime(manifest,file=>files.get(file)))
 docx.harnessSourceCommit='f'.repeat(40);update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,file=>files.get(file)));docx.harnessSourceCommit=reports.searchCompleteness.harnessSourceCommit;update()
 files.set(root+docx.outputs[0].fileName,Buffer.from('substituted'));assert.throws(()=>assertInstalledReleaseRuntime(manifest,file=>files.get(file)))
})
test('native DOCX driver uses trusted input, real producer files and independent ZIP XML; all publication stages bind outputs',()=>{
 const driver=fs.readFileSync('scripts/lib/installed-v1-1-17-workflow.mjs','utf8')
 for(const token of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true','force:true'])assert.ok(!driver.includes(token),token)
 assert.ok(!driver.includes('[title='),'Native titles are adopted into accessible labels by the production tooltip policy')
 for(const token of ['nativeUserInput','fixtures/docx/producers','inspect-hosted-docx-delivery.py','validateInstalledDocxEditing','COPYFILE_EXCL','shortcutConfirmed'])assert.ok(driver.includes(token),token)
 for(const file of ['scripts/lib/installed-release-runtime.mjs','scripts/import-community-release-review.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertDocxOutputBytes'),file)
 for(const file of ['.github/workflows/v1-1-0-candidate-lifecycle.yml','.github/workflows/v1-1-0-installer-review.yml']){
  const source=fs.readFileSync(file,'utf8');assert.equal((source.match(/if: contains\(fromJSON\('\["1\.1\.16","1\.1\.17"\]'\), inputs\.current_version\)/g)||[]).length,2,'Both Python setup and pinned install must include the successor')
 }
})
test('literal WebView observations remain valid JavaScript after string decoding',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-17-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const walk=node=>{if(ts.isCallExpression(node)&&(/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree)))){const arg=node.arguments[0];if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))){assert.doesNotThrow(()=>new vm.Script(arg.text),arg.text);count++}}ts.forEachChild(node,walk)};walk(tree);assert.ok(count>=12)
})
