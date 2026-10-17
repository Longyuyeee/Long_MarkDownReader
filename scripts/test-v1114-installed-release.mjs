// These synthetic protocol cases are not actual installation evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import {writingDeliveryChecks,validateInstalledWritingDelivery} from './lib/installed-v1-1-14-evidence.mjs'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const example=()=>{
 const digest='a'.repeat(64),manifest={appVersion:'1.1.14',sourceCommit:'b'.repeat(40),artifacts:[{target:'nsis',sha256:'c'.repeat(64)}]}
 const report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'d'.repeat(40),executableSha256:'e'.repeat(64),status:'passed',evidenceLevel:'installed-writing-native-pickers-print-and-disk',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:writingDeliveryChecks.map(id=>({id,status:'passed'})),templateBody:'# 用户填写的文章\n作者：小林 {{time}}\n未知：{{keep}}\n',standalone:{nativeBridgeMocked:false,scripts:0,temporarySources:0,text:'这篇交付方案仍未保存',images:[1,2].map(()=>({width:240,height:100,embedded:true}))},cancelPicker:{status:'cancelled-real-native-dialog',dialogClosed:true},cancelCreatedFile:false,nativePrint:{status:'saved-real-native-print-pdf',desktopUserSession:'disposable-github-hosted',sha256:digest,sizeBytes:5000},pdfPages:3,pdfText:'这篇交付方案仍未保存',pdfInk:10,inputTrace:['click','keydown','input'].map(type=>({type,trusted:true})),runtimeErrors:[]}
 for(const key of ['templateCreatedWithParameters','previewIncludesUnsavedDraft','relativeImageInserted','htmlCarriesLocalImages','markdownMatchesDraft','draftStillDirty','nativePdfHasOnlyArticle','pdfLastSectionVisible','originalModeRestored'])report[key]=true
 for(const key of ['sourceBefore','sourceAfter','sharedBefore','sharedAfter','unselectedBefore','unselectedAfter','htmlSha256','movedHtmlSha256','previewSha256'])report[key]=digest
 for(const field of ['imagePicker','htmlPicker','markdownPicker'])report[field]={status:'selected-real-native-dialog',dialogClosed:true,desktopUserSession:'disposable-github-hosted',processId:1}
 return [report,manifest]
}
test('writing evidence rejects missing checks, fake print, stale snapshots, data changes and scripted input',()=>{
 assert.doesNotThrow(()=>validateInstalledWritingDelivery(...example()))
 for(const mutate of [r=>r.checks.pop(),r=>r.nativeBridgeMocked=true,r=>r.nativePrint.status='print-dialog-only',r=>r.pdfPages=0,r=>r.pdfText='wrong output',r=>r.pdfText+='快速笔记',r=>r.pdfInk=0,r=>r.sourceAfter='f'.repeat(64),r=>r.sharedAfter='f'.repeat(64),r=>r.previewSha256='f'.repeat(64),r=>r.standalone.images[0].embedded=false,r=>r.standalone.scripts=1,r=>r.cancelCreatedFile=true,r=>r.markdownMatchesDraft=false,r=>r.draftStillDirty=false,r=>r.imagePicker.dialogClosed=false,r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('error')]){const[r,m]=example();mutate(r);assert.throws(()=>validateInstalledWritingDelivery(r,m))}
})
test('real installed driver never replaces bridge, calls a component handler or synthesizes DOM input',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-14-workflow.mjs','utf8')
 for(const token of ['dispatchEvent(','__TAURI_INTERNALS__=','__TAURI_INTERNALS__ =','isDirty=false','isDirty = false','force:true','force: true'])assert.ok(!source.includes(token),token)
 for(const token of ['nativeUserInput','select-hosted-session-file.ps1','print-hosted-writing-pdf.ps1','inspectStandaloneDelivery','validateInstalledWritingDelivery'])assert.ok(source.includes(token),token)
})
test('v1.1.14 requires all predecessor reports plus writing with the same source, executable and driver',()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/evidence/v1.1.13-release/artifact-manifest.json','utf8'));manifest.appVersion=manifest.sourceVersion='1.1.14'
 const reports={},bytes=new Map()
 for(const[key,item]of Object.entries(manifest.runtimeSmoke.reports))reports[key]=JSON.parse(fs.readFileSync(item.path,'utf8').replaceAll('1.1.13','1.1.14'))
 reports.writingDelivery={...example()[0],sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(a=>a.target==='nsis').sha256,executableSha256:reports.searchCompleteness.executableSha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit}
 const update=()=>{manifest.runtimeSmoke.reports=Object.fromEntries(Object.entries(reports).map(([key,value])=>{const file='docs/evidence/v1-1-14-candidate-lifecycle/'+key+'.json',buffer=Buffer.from(JSON.stringify(value));bytes.set(file,buffer);return[key,{path:file,sha256:crypto.createHash('sha256').update(buffer).digest('hex')}]}))}
 update();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(manifest,f=>bytes.get(f)))
 for(const key of Object.keys(reports)){const old=reports[key];delete reports[key];update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,f=>bytes.get(f)),key);reports[key]=old}
 for(const field of ['executableSha256','harnessSourceCommit']){const old=reports.writingDelivery[field];reports.writingDelivery[field]='0'.repeat(old.length);update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,f=>bytes.get(f)));reports.writingDelivery[field]=old}
})
