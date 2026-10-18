// Synthetic contract tests, never presented as actual installation evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {test} from 'node:test'
import {tableEditingChecks,validateInstalledTableEditing} from './lib/installed-v1-1-15-evidence.mjs'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),csv=Buffer.from('\ufeffsynthetic,csv\r\nvalue,only\r\n'),xlsx=Buffer.from('synthetic-export-not-a-real-installed-workbook')
const example=()=>{
 const manifest={appVersion:'1.1.15',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]}
 const report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-table-real-clipboard-native-save-export-and-independent-disk',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:tableEditingChecks.map(id=>({id,status:'passed'})),unselectedBefore:'e'.repeat(64),unselectedAfter:'e'.repeat(64),csvInspection:{status:'passed',hasBom:true,endsCrlf:true,nativeBridgeMocked:false,sha256:sha(csv),rows:[['会议\r\n备注','可见','00123',''],['保持原样','隐藏','9007199254740993123',''],['核对文档','可见','9007199254740993124',''],['=SUM(A1:A2)','已完成','42','']]},xlsxInspection:{status:'passed',nativeBridgeMocked:false,sha256:sha(xlsx),hasFormula:false,cells:{C2:'00123',C3:'9007199254740993123',C4:'9007199254740993124',A5:'=SUM(A1:A2)',C5:'42'},types:{C2:'s',C3:'s',C4:'s',A5:'s',C5:'n'}},runtimeErrors:[],inputTrace:[{type:'click',trusted:true},{type:'paste',trusted:true}]}
 for(const key of ['filteredPasteExact','hiddenRowProtected','sortUndoRedoExact','rangeCopyExact','clearUndoExact','appendUndoExact','columnSurvivesUndo','multilineDraftOnly','csvReopenExact','tableCopyPreservesSource'])report[key]=true
 return[report,manifest]
}
test('table evidence rejects partial/fake checks, changed hidden rows, flattened values, precision loss and scripted input',()=>{
 assert.doesNotThrow(()=>validateInstalledTableEditing(...example()))
 for(const change of [r=>r.checks.pop(),r=>r.nativeBridgeMocked=true,r=>r.hiddenRowProtected=false,r=>r.clearUndoExact=false,r=>r.csvReopenExact=false,r=>r.csvInspection.rows[0][0]='会议备注',r=>r.csvInspection.rows[0][2]='123',r=>r.xlsxInspection.cells.C3='9007199254740993000',r=>r.xlsxInspection.types.C2='n',r=>r.xlsxInspection.hasFormula=true,r=>r.unselectedAfter='f'.repeat(64),r=>r.inputTrace[0].trusted=false,r=>r.inputTrace=r.inputTrace.filter(e=>e.type!=='paste'),r=>r.runtimeErrors.push('error')]){const[r,m]=example();change(r);assert.throws(()=>validateInstalledTableEditing(r,m))}
})
test('real table driver uses native clipboard and public input without mutating a handler or bridge',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-15-workflow.mjs','utf8')
 for(const token of ['dispatchEvent(','__TAURI_INTERNALS__=','__TAURI_INTERNALS__ =','isDirty=false','isDirty = false','force:true','force: true'])assert.ok(!source.includes(token),token)
 for(const token of ['nativeUserInput','set-hosted-writing-clipboard.ps1','read-hosted-table-clipboard.ps1','inspect-hosted-table-delivery.ps1','validateInstalledTableEditing','sourceSaved'])assert.ok(source.includes(token),token)
 for(const file of ['scripts/inspect-hosted-table-delivery.ps1','scripts/read-hosted-table-clipboard.ps1']){const guard=fs.readFileSync(file,'utf8');for(const token of ['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','LONGEDIT_R5I_DISPOSABLE','.v119-installed-owner','StartsWith'])assert.ok(guard.includes(token),file+token)}
})
function syntheticBundle(){
 const manifest=JSON.parse(fs.readFileSync('docs/evidence/v1.1.14-release/artifact-manifest.json','utf8'));manifest.appVersion=manifest.sourceVersion='1.1.15'
 const reports={},bytes=new Map(),prefix='docs/evidence/v1-1-15-candidate-lifecycle/'
 for(const[key,item]of Object.entries(manifest.runtimeSmoke.reports))reports[key]=JSON.parse(fs.readFileSync(item.path,'utf8').replaceAll('1.1.14','1.1.15'))
 reports.tableEditing={...example()[0],sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(a=>a.target==='nsis').sha256,executableSha256:reports.searchCompleteness.executableSha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit}
 const update=()=>{bytes.clear();manifest.runtimeSmoke.reports=Object.fromEntries(Object.entries(reports).map(([key,report])=>{const file=prefix+(key==='tableEditing'?'installed-v1115-workflow.json':key+'.json'),value=Buffer.from(JSON.stringify(report));bytes.set(file,value);return[key,{path:file,sha256:sha(value)}]}));bytes.set(prefix+'installed-v1115-saved.csv',csv);bytes.set(prefix+'installed-v1115-export.xlsx',xlsx)}
 update();return{manifest,reports,bytes,update}
}
test('v1.1.15 requires all 176 predecessor checks and same-source same-executable same-driver table checks and bytes',()=>{
 const b=syntheticBundle(),read=file=>b.bytes.get(file);assert.doesNotThrow(()=>assertInstalledReleaseRuntime(b.manifest,read))
 const writing=b.reports.writingDelivery;delete b.reports.writingDelivery;b.update();assert.throws(()=>assertInstalledReleaseRuntime(b.manifest,read));b.reports.writingDelivery=writing;b.reports.tableEditing.executableSha256='f'.repeat(64);b.update();assert.throws(()=>assertInstalledReleaseRuntime(b.manifest,read));b.reports.tableEditing.executableSha256=b.reports.searchCompleteness.executableSha256;b.update();b.bytes.set('docs/evidence/v1-1-15-candidate-lifecycle/installed-v1115-export.xlsx',Buffer.from('changed'));assert.throws(()=>assertInstalledReleaseRuntime(b.manifest,read))
})
test('actual importer retains exact table delivery bytes and refuses an acknowledged re-import',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'longedit-table-import-protocol-'));fs.writeFileSync(path.join(root,'.owned-table-import-protocol'),'synthetic')
 try{
  fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.cpSync('scripts/lib',path.join(root,'scripts/lib'),{recursive:true});fs.copyFileSync('scripts/import-community-release-review.mjs',path.join(root,'scripts/import-community-release-review.mjs'));fs.mkdirSync(path.join(root,'shared'));fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.1.15',type:'module'}))
  const community=JSON.parse(fs.readFileSync('shared/v1-community-release-policy.json','utf8'));community.appVersion='1.1.15';community.gates.githubReleasePublished=false;community.patchValidation.previousPublicVersion='1.1.14';fs.writeFileSync(path.join(root,'shared/v1-community-release-policy.json'),JSON.stringify(community));fs.copyFileSync('shared/development-version-policy.json',path.join(root,'shared/development-version-policy.json'))
  const input=path.join(root,'input');fs.mkdirSync(input);const b=syntheticBundle()
  for(const name of fs.readdirSync('docs/evidence/v1-1-14-candidate-lifecycle').filter(name=>name.endsWith('.json'))){const value=fs.readFileSync('docs/evidence/v1-1-14-candidate-lifecycle/'+name,'utf8').replaceAll('1.1.14','1.1.15');fs.writeFileSync(path.join(input,name),value)}
  for(const item of Object.values(b.manifest.runtimeSmoke.reports)){const original=path.basename(item.path),key=Object.entries(b.manifest.runtimeSmoke.reports).find(([,value])=>value.path===item.path)[0];const previous=JSON.parse(fs.readFileSync('docs/evidence/v1.1.14-release/artifact-manifest.json','utf8')).runtimeSmoke.reports[key];fs.writeFileSync(path.join(input,key==='tableEditing'?'installed-v1115-workflow.json':path.basename(previous.path)),b.bytes.get(item.path))}
  const lifecycle=JSON.parse(fs.readFileSync(path.join(input,'lifecycle-result.json'),'utf8').replace(/^\uFEFF/,''));lifecycle.previousVersion='1.1.14';fs.writeFileSync(path.join(input,'lifecycle-result.json'),JSON.stringify(lifecycle))
  const built=JSON.parse(fs.readFileSync('docs/evidence/v1-1-14-candidate-lifecycle/installer-build-receipt.json','utf8'));built.appVersion='1.1.15';built.previousVersion='1.1.14';for(const a of built.artifacts)a.fileName=a.fileName.replaceAll('1.1.14','1.1.15');fs.writeFileSync(path.join(input,'installer-build-receipt.json'),JSON.stringify(built));fs.writeFileSync(path.join(input,'installed-v1115-saved.csv'),csv);fs.writeFileSync(path.join(input,'installed-v1115-export.xlsx'),xlsx)
  const args=['scripts/import-community-release-review.mjs','--review-dir',input,'--build-run','101','--review-run','102'];execFileSync(process.execPath,args,{cwd:root,stdio:'pipe'});const accepted=path.join(root,'docs/evidence/v1-1-15-candidate-lifecycle/installed-v1115-export.xlsx');assert.deepEqual(fs.readFileSync(accepted),xlsx);assert.throws(()=>execFileSync(process.execPath,args,{cwd:root,stdio:'pipe'}),/accepted review already exists/)
 }finally{const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('longedit-table-import-protocol-'));assert.ok(fs.existsSync(path.join(resolved,'.owned-table-import-protocol')));fs.rmSync(resolved,{recursive:true})}
})
