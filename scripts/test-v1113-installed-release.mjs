// Synthetic protocol examples below are never installed acceptance evidence.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {pdfReadingChecks,validateInstalledPdfReading} from './lib/installed-v1-1-13-evidence.mjs'
import crypto from 'node:crypto'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const example=()=>{
 const manifest={appVersion:'1.1.13',sourceCommit:'b'.repeat(40),artifacts:[{target:'nsis',sha256:'c'.repeat(64)}]},digest='a'.repeat(64)
 const report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'d'.repeat(40),executableSha256:'e'.repeat(64),status:'passed',evidenceLevel:'installed-webview-input-native-pdf-notes-picker-and-disk',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:pdfReadingChecks.map(id=>({id,status:'passed'})),pdfPages:86,annotationCount:240,filteredCount:6,previewCount:2,selectedIds:['reading-11','reading-14'],sourceBefore:digest,sourceAfter:digest,sidecarBefore:digest,sidecarAfter:digest,unselectedBefore:digest,unselectedAfter:digest,targetSignatureBefore:'original',targetSignatureAfterInsert:'original',draftBeforeSaveSha256:digest,explicitSavedSha256:digest,nativePicker:{status:'selected-real-native-dialog',dialogClosed:true,desktopUserSession:'disposable-github-hosted',processId:1},inputTrace:['click','keydown','input'].map(type=>({type,trusted:true})),runtimeErrors:[],editorModes:{before:'sv',after:'sv'}}
 for(const key of ['dirtyBeforeInsert','dirtyAfterInsert','exactDraftPrefix','draftDiskUnchangedBeforeSave','explicitSave','returnedExactAnnotation','deletedAnnotationNotice','legacyNotice','newNoteSelectedOnly','existingTargetPreserved','replacementRejected','replacementTimestampPreserved','movedRelinkDirtyOnly','movedRelinkReturnedExact','restoredReferenceVerified','restoredPageVisible'])report[key]=true
 report.snapshot={items:report.selectedIds.map((id,i)=>({annotation:{id,page:i+12},uri:`longedit://pdf?path=p.pdf&page=${i+12}&annotation=${id}&sha256=${digest}`}))}
 for(const field of ['sourceRender','movedRender','restoredRender'])report[field]={observedFrom:'rendered-pdf-controls-text-and-canvas',page:12,annotationId:'reading-11',placeholderAbsent:true,text:'Reading source page 12',width:612,height:792,opaquePixels:200,inkPixels:40}
 for(const [field,text]of [['deletedNotice','批注不存在或已被删除'],['legacySourceNotice','旧引用没有内容摘要']])report[field]={observedFrom:'rendered-reference-notice-in-panel-viewport',text,visible:true,top:200,bottom:250,parentTop:190,parentBottom:900}
 return [report,manifest]
}
test('PDF installed evidence refuses missing checks, changed bytes, fake input and unprotected drafts',()=>{
 assert.doesNotThrow(()=>validateInstalledPdfReading(...example()))
 for(const mutate of [r=>r.checks.pop(),r=>r.nativeBridgeMocked=true,r=>r.sourceAfter='f'.repeat(64),r=>r.snapshot.items.pop(),r=>r.snapshot.items[0].annotation.id='unselected',r=>r.draftDiskUnchangedBeforeSave=false,r=>r.dirtyAfterInsert=false,r=>r.returnedExactAnnotation=false,r=>r.movedRelinkDirtyOnly=false,r=>r.nativePicker.dialogClosed=false,r=>r.replacementTimestampPreserved=false,r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('error'),r=>r.editorModes.after='ir']){const [r,m]=example();mutate(r);assert.throws(()=>validateInstalledPdfReading(r,m))}
})
test('PDF workflow uses real input, owned native chooser and independent disk checks',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-13-workflow.mjs','utf8')
 for(const token of ['LONGEDIT_R5I_DISPOSABLE','github-hosted','nativeUserInput','observedNativeCommand','select-hosted-session-file.ps1','replace-hosted-pdf-source.ps1','fs.readFile','explicitSave','validateInstalledPdfReading','sourceBefore'])assert.ok(source.includes(token),token)
 for(const token of ['dispatchEvent(','__TAURI_INTERNALS__ =','__TAURI_INTERNALS__=','isDirty=false','isDirty = false','force:true','force: true'])assert.ok(!source.includes(token),token)
})
test('a tab label or blank/wrong canvas cannot stand in for an actual source page',()=>{
 for(const mutate of [r=>r.sourceRender.inkPixels=0,r=>r.movedRender.page=1,r=>r.restoredRender.text='wrong page',r=>r.sourceRender.annotationId='wrong',r=>r.pdfPages=2]){const [r,m]=example();mutate(r);assert.throws(()=>validateInstalledPdfReading(r,m))}
})
test('v1.1.13 requires its PDF report and every predecessor, with the same executable and driver',()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/evidence/v1.1.12-release/artifact-manifest.json','utf8'));manifest.appVersion=manifest.sourceVersion='1.1.13'
 const reports={},bytes=new Map()
 for(const [key,item]of Object.entries(manifest.runtimeSmoke.reports))reports[key]=JSON.parse(fs.readFileSync(item.path,'utf8').replaceAll('1.1.12','1.1.13'))
 reports.pdfReading={...example()[0],sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(a=>a.target==='nsis').sha256,executableSha256:reports.searchCompleteness.executableSha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit}
 const update=()=>{manifest.runtimeSmoke.reports=Object.fromEntries(Object.entries(reports).map(([key,value])=>{const file='docs/evidence/v1-1-13-candidate-lifecycle/'+key+'.json',buffer=Buffer.from(JSON.stringify(value));bytes.set(file,buffer);return[key,{path:file,sha256:crypto.createHash('sha256').update(buffer).digest('hex')}]}))}
 update();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(manifest,f=>bytes.get(f)))
 for(const key of Object.keys(reports)){const old=reports[key];delete reports[key];update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,f=>bytes.get(f)),key);reports[key]=old}
 for(const field of ['executableSha256','harnessSourceCommit']){const old=reports.pdfReading[field];reports.pdfReading[field]='0'.repeat(old.length);update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,f=>bytes.get(f)));reports.pdfReading[field]=old}
})
